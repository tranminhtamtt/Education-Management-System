/**
 * Mongoose models cho EMS (MongoDB Atlas).
 *
 * Quy ước để giữ nguyên hợp đồng API cũ (frontend dùng ID số):
 *  - Mỗi document có `id` (Number, unique, tự tăng qua collection `counters`) bên cạnh `_id`.
 *  - Khóa ngoại lưu dạng số (`studentId`, `classId`...) và quan hệ được nạp bằng virtual populate.
 *  - Tiền VND lưu dạng Number nguyên; điểm số lưu Number.
 *  - `lockVersion` dùng cho lockDoc() trong transaction (chống race condition).
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ---------------------------------------------------------------------------
// Counter + plugin
// ---------------------------------------------------------------------------
const Counter = mongoose.models.Counter || mongoose.model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }), 'counters');

// Không gắn session: bộ đếm không rollback (chấp nhận khoảng trống ID) và tránh WriteConflict nóng.
async function nextIds(name, count = 1) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: count } }, { new: true, upsert: true });
  return c.seq - count + 1;
}

// ID tường minh (seed/import) → nâng bộ đếm để ID tự sinh sau đó không trùng.
async function bumpCounter(name, id) {
  await Counter.updateOne({ _id: name }, { $max: { seq: id } }, { upsert: true });
}

function emsPlugin(schema, { counter }) {
  schema.add({ id: { type: Number, unique: true }, lockVersion: { type: Number, default: 0, select: false } });
  schema.pre('save', async function () {
    if (!this.isNew) return;
    if (this.id == null) this.id = await nextIds(counter);
    else await bumpCounter(counter, this.id);
  });
  schema.pre('insertMany', async function (next, docs) {
    const list = Array.isArray(docs) ? docs : [docs];
    const explicit = list.filter(d => d.id != null).map(d => d.id);
    if (explicit.length) await bumpCounter(counter, Math.max(...explicit));
    const missing = list.filter(d => d.id == null);
    if (missing.length) {
      let start = await nextIds(counter, missing.length);
      for (const d of missing) d.id = start++;
    }
  });
  const transform = (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    delete ret.lockVersion;
    return ret;
  };
  schema.set('toJSON', { virtuals: true, transform });
  schema.set('toObject', { virtuals: true, transform });
  schema.set('id', false); // tắt virtual `id` mặc định của Mongoose (dùng trường id số)
  schema.set('versionKey', false);
}

function define(name, collection, definition, options = {}, setup) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new Schema(definition, { ...options });
  schema.plugin(emsPlugin, { counter: collection });
  if (setup) setup(schema);
  return mongoose.model(name, schema, collection);
}

const ref = (model, localField, justOne = true, extra = {}) => ({ ref: model, localField, foreignField: 'id', justOne, ...extra });
const many = (model, foreignField, extra = {}) => ({ ref: model, localField: 'id', foreignField, justOne: false, ...extra });
const one = (model, foreignField) => ({ ref: model, localField: 'id', foreignField, justOne: true });

const ts = { createdAt: { type: Date, default: Date.now } };

// ---------------------------------------------------------------------------
// 1. users (student_profiles + teacher_profiles được nhúng vào user)
// ---------------------------------------------------------------------------
const StudentProfileSchema = new Schema({
  dob: { type: Date, default: null },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], default: 'MALE' },
  address: { type: String, default: null },
  targetGoal: { type: String, default: null, maxlength: 500 },
  enrollmentYear: { type: Number, default: 2026 }
}, { _id: false });

const TeacherProfileSchema = new Schema({
  degree: { type: String, default: null },
  specialty: { type: String, default: null },
  bio: { type: String, default: null }
}, { _id: false });

const User = define('User', 'users', {
  code: { type: String, required: true, unique: true, maxlength: 50 },
  email: { type: String, required: true, unique: true, maxlength: 100 },
  passwordHash: { type: String, required: true, select: false },
  fullName: { type: String, required: true, maxlength: 100 },
  role: { type: String, enum: ['ADMIN', 'TEACHER', 'STUDENT', 'ACCOUNTANT'], default: 'STUDENT', index: true },
  phone: { type: String, default: null },
  avatar: { type: String, default: null },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  studentProfile: { type: StudentProfileSchema, default: undefined },
  teacherProfile: { type: TeacherProfileSchema, default: undefined }
}, { timestamps: true }, s => {
  s.virtual('teachingClasses', many('Class', 'teacherId'));
  s.virtual('enrollments', many('Enrollment', 'studentId'));
});

// ---------------------------------------------------------------------------
// 2. courses
// ---------------------------------------------------------------------------
const Course = define('Course', 'courses', {
  category: { type: String, enum: ['FPT_SUBJECT', 'CERTIFICATE'], default: 'FPT_SUBJECT' },
  deliveryMode: { type: String, enum: ['RECORDED', 'LIVE_ONLINE'], default: 'LIVE_ONLINE' },
  level: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], default: 'BEGINNER' },
  instructorId: { type: Number, default: null },
  thumbnailUrl: { type: String, default: null },
  courseCode: { type: String, required: true, unique: true, maxlength: 50 },
  name: { type: String, required: true, maxlength: 150 },
  credits: { type: Number, default: 3 },
  totalSessions: { type: Number, default: 30 },
  baseTuitionFee: { type: Number, default: 0, min: 0 },
  description: { type: String, default: null },
  syllabusUrl: { type: String, default: null },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  ...ts
}, {}, s => {
  s.virtual('classes', many('Class', 'courseId'));
  s.virtual('instructor', ref('User', 'instructorId'));
  s.virtual('lessons', many('CourseLesson', 'courseId', { options: { sort: { orderIndex: 1 } } }));
});

// ---------------------------------------------------------------------------
// 3. classes
// ---------------------------------------------------------------------------
const Class = define('Class', 'classes', {
  meetUrl: { type: String, default: null },
  classCode: { type: String, required: true, unique: true, maxlength: 50 },
  courseId: { type: Number, required: true, index: true },
  teacherId: { type: Number, default: null, index: true },
  semester: { type: String, required: true, maxlength: 20, index: true },
  maxStudents: { type: Number, default: 30 },
  status: { type: String, enum: ['UPCOMING', 'ONGOING', 'COMPLETED'], default: 'UPCOMING' },
  ...ts
}, {}, s => {
  s.virtual('course', ref('Course', 'courseId'));
  s.virtual('teacher', ref('User', 'teacherId'));
  s.virtual('schedules', many('Schedule', 'classId', { options: { sort: { dayOfWeek: 1, shift: 1 } } }));
  s.virtual('enrollments', many('Enrollment', 'classId'));
});

// ---------------------------------------------------------------------------
// 4. enrollments
// ---------------------------------------------------------------------------
const Enrollment = define('Enrollment', 'enrollments', {
  classId: { type: Number, required: true },
  studentId: { type: Number, required: true, index: true },
  enrolledAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['PENDING_PAYMENT', 'ACTIVE', 'DROPPED'], default: 'ACTIVE' },
  progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  completedLessonsCount: { type: Number, default: 0, min: 0 }
}, {}, s => {
  s.index({ classId: 1, studentId: 1 }, { unique: true });
  s.virtual('class', ref('Class', 'classId'));
  s.virtual('student', ref('User', 'studentId'));
  s.virtual('grade', one('Grade', 'enrollmentId'));
  s.virtual('tuitionInvoice', one('TuitionInvoice', 'enrollmentId'));
});

// ---------------------------------------------------------------------------
// 5. schedules
// ---------------------------------------------------------------------------
const Schedule = define('Schedule', 'schedules', {
  classId: { type: Number, required: true, index: true },
  dayOfWeek: { type: Number, required: true, min: 2, max: 8 },
  shift: { type: Number, default: 1, min: 1, max: 6 },
  startTime: { type: String, required: true }, // "HH:mm"
  endTime: { type: String, required: true },
  room: { type: String, required: true, maxlength: 50 }
}, {}, s => {
  s.virtual('class', ref('Class', 'classId'));
});

// ---------------------------------------------------------------------------
// 6. attendances
// ---------------------------------------------------------------------------
const Attendance = define('Attendance', 'attendances', {
  classId: { type: Number, required: true },
  studentId: { type: Number, required: true },
  sessionDate: { type: Date, required: true },
  status: { type: String, enum: ['PRESENT', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LATE'], default: 'PRESENT' },
  note: { type: String, default: null }
}, {}, s => {
  s.index({ classId: 1, studentId: 1, sessionDate: 1 }, { unique: true });
});

// ---------------------------------------------------------------------------
// 7. assignments / 8. submissions
// ---------------------------------------------------------------------------
const Assignment = define('Assignment', 'assignments', {
  classId: { type: Number, required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, default: null },
  fileUrl: { type: String, default: null },
  dueDate: { type: Date, required: true },
  ...ts
}, {}, s => {
  s.virtual('class', ref('Class', 'classId'));
  s.virtual('submissions', many('Submission', 'assignmentId', { options: { sort: { submittedAt: -1 } } }));
});

const Submission = define('Submission', 'submissions', {
  content: { type: String, default: null, maxlength: 10000 },
  assignmentId: { type: Number, required: true },
  studentId: { type: Number, required: true },
  fileUrl: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['SUBMITTED', 'LATE_SUBMITTED'], default: 'SUBMITTED' },
  score: { type: Number, default: null, min: 0, max: 10 },
  teacherFeedback: { type: String, default: null }
}, {}, s => {
  s.index({ assignmentId: 1, studentId: 1 }, { unique: true });
  s.virtual('assignment', ref('Assignment', 'assignmentId'));
  s.virtual('student', ref('User', 'studentId'));
});

// ---------------------------------------------------------------------------
// 9. grades
// ---------------------------------------------------------------------------
const Grade = define('Grade', 'grades', {
  enrollmentId: { type: Number, required: true, unique: true },
  attendanceScore: { type: Number, default: null },
  midtermScore: { type: Number, default: null },
  finalScore: { type: Number, default: null },
  totalScore: { type: Number, default: null },
  isPassed: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false }
});

// ---------------------------------------------------------------------------
// 10. tuition_invoices
// ---------------------------------------------------------------------------
const TuitionInvoice = define('TuitionInvoice', 'tuition_invoices', {
  studentId: { type: Number, required: true, index: true },
  enrollmentId: { type: Number, required: true, unique: true },
  amount: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID', index: true },
  paidAt: { type: Date, default: null },
  ...ts
}, {}, s => {
  s.virtual('student', ref('User', 'studentId'));
  s.virtual('enrollment', ref('Enrollment', 'enrollmentId'));
  s.virtual('payments', many('TuitionPayment', 'invoiceId', { options: { sort: { paidAt: 1, id: 1 } } }));
  s.virtual('orders', many('PaymentOrder', 'invoiceId'));
  s.virtual('transactions', many('PaymentTransaction', 'invoiceId'));
});

// ---------------------------------------------------------------------------
// 11. tuition_payments (phiếu thu — chỉ sinh ra từ giao dịch đã xác minh)
// ---------------------------------------------------------------------------
const TuitionPayment = define('TuitionPayment', 'tuition_payments', {
  invoiceId: { type: Number, required: true, index: true },
  transactionId: { type: Number, default: null, index: true },
  receiptNo: { type: String, required: true, unique: true, maxlength: 50 },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'VIETQR'], default: 'BANK_TRANSFER' },
  note: { type: String, default: null },
  collectedById: { type: Number, default: null },
  paidAt: { type: Date, default: Date.now, index: true }
}, {}, s => {
  s.virtual('invoice', ref('TuitionInvoice', 'invoiceId'));
  s.virtual('collectedBy', ref('User', 'collectedById'));
});

// ---------------------------------------------------------------------------
// 12. payment_orders
// ---------------------------------------------------------------------------
const PaymentOrder = define('PaymentOrder', 'payment_orders', {
  code: { type: String, required: true, unique: true, maxlength: 40 },
  invoiceId: { type: Number, required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  createdById: { type: Number, default: null },
  ...ts
}, {}, s => {
  s.virtual('invoice', ref('TuitionInvoice', 'invoiceId'));
  s.virtual('transactions', many('PaymentTransaction', 'orderId'));
});

// ---------------------------------------------------------------------------
// 13. payment_transactions (dữ liệu SePay, bất biến sau khi xác nhận)
// ---------------------------------------------------------------------------
const TRANSACTION_STATUSES = ['MATCHED', 'UNMATCHED', 'DISCREPANCY'];
const PaymentTransaction = define('PaymentTransaction', 'payment_transactions', {
  providerId: { type: String, required: true, unique: true, maxlength: 80 },
  reference: { type: String, default: null },
  orderId: { type: Number, default: null, index: true },
  invoiceId: { type: Number, default: null, index: true },
  amount: { type: Number, required: true, min: 1 },
  appliedAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: TRANSACTION_STATUSES, default: 'UNMATCHED', index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  occurredAt: { type: Date, required: true, index: true },
  ...ts
}, {}, s => {
  s.virtual('order', ref('PaymentOrder', 'orderId'));
  s.virtual('invoice', ref('TuitionInvoice', 'invoiceId'));
  s.virtual('discrepancy', one('PaymentDiscrepancy', 'transactionId'));
  s.virtual('refunds', many('RefundRequest', 'transactionId'));
});

// ---------------------------------------------------------------------------
// 14. payment_discrepancies
// ---------------------------------------------------------------------------
const DISCREPANCY_REASONS = ['UNDERPAYMENT', 'OVERPAYMENT_OR_DUPLICATE', 'UNKNOWN_PAYMENT_CODE'];
const PaymentDiscrepancy = define('PaymentDiscrepancy', 'payment_discrepancies', {
  transactionId: { type: Number, required: true, unique: true },
  reason: { type: String, enum: DISCREPANCY_REASONS, required: true },
  status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN', index: true },
  note: { type: String, default: null, maxlength: 4000 },
  ...ts
}, {}, s => {
  s.virtual('transaction', ref('PaymentTransaction', 'transactionId'));
});

// ---------------------------------------------------------------------------
// 15. refund_requests
// ---------------------------------------------------------------------------
const RefundRequest = define('RefundRequest', 'refund_requests', {
  transactionId: { type: Number, required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, maxlength: 255 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'], default: 'PENDING', index: true },
  reference: { type: String, default: undefined, maxlength: 150 },
  requestedById: { type: Number, default: null },
  ...ts,
  completedAt: { type: Date, default: null }
}, {}, s => {
  // unique chỉ áp dụng khi đã có mã tham chiếu hoàn tiền
  s.index({ reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: 'string' } } });
  s.virtual('transaction', ref('PaymentTransaction', 'transactionId'));
});

// ---------------------------------------------------------------------------
// 16. payment_audit_logs (append-only)
// ---------------------------------------------------------------------------
const PaymentAuditLog = define('PaymentAuditLog', 'payment_audit_logs', {
  actorId: { type: Number, default: null },
  action: { type: String, required: true, maxlength: 80 },
  entityId: { type: Number, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  ...ts
});

// ---------------------------------------------------------------------------
// 17. notifications
// ---------------------------------------------------------------------------
const Notification = define('Notification', 'notifications', {
  userId: { type: Number, default: null, index: true }, // null = toàn trường
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true },
  type: { type: String, enum: ['ASSIGNMENT', 'GRADE', 'TUITION', 'REQUEST', 'SYSTEM'], default: 'SYSTEM' },
  isRead: { type: Boolean, default: false },
  ...ts
});

// ---------------------------------------------------------------------------
// 18. student_requests
// ---------------------------------------------------------------------------
const StudentRequest = define('StudentRequest', 'student_requests', {
  studentId: { type: Number, required: true, index: true },
  classId: { type: Number, default: null },
  requestType: { type: String, enum: ['ABSENCE', 'REMARK', 'CONFIRMATION'], required: true },
  sessionDate: { type: Date, default: null },
  reason: { type: String, required: true },
  attachmentUrl: { type: String, default: null },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  adminResponse: { type: String, default: null },
  ...ts
}, {}, s => {
  s.virtual('student', ref('User', 'studentId'));
  s.virtual('class', ref('Class', 'classId'));
});

const CourseLesson = define('CourseLesson', 'course_lessons', {
  courseId: { type: Number, required: true, index: true },
  sectionTitle: { type: String, default: 'Nội dung khóa học' },
  orderIndex: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, maxlength: 200 },
  videoUrl: { type: String, default: null },
  materialUrl: { type: String, default: null },
  durationMinutes: { type: Number, default: 0, min: 0 },
  isPreview: { type: Boolean, default: false }
}, {}, s => s.index({ courseId: 1, orderIndex: 1 }, { unique: true }));

const LessonProgress = define('LessonProgress', 'lesson_progress', {
  enrollmentId: { type: Number, required: true, index: true },
  lessonId: { type: Number, required: true },
  studentId: { type: Number, required: true, index: true },
  courseId: { type: Number, required: true },
  isCompleted: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  lastWatchedSecond: { type: Number, default: 0, min: 0 }
}, {}, s => s.index({ enrollmentId: 1, lessonId: 1 }, { unique: true }));

const CourseQuestion = define('CourseQuestion', 'course_questions', {
  studentId: { type: Number, required: true, index: true },
  classId: { type: Number, required: true, index: true },
  lessonId: { type: Number, default: null },
  questionTitle: { type: String, required: true, maxlength: 200 },
  questionContent: { type: String, required: true, maxlength: 10000 },
  attachmentUrl: { type: String, default: null },
  status: { type: String, enum: ['PENDING', 'ANSWERED', 'RESOLVED'], default: 'PENDING' },
  teacherAnswer: { type: String, default: null, maxlength: 10000 },
  answeredById: { type: Number, default: null },
  answeredAt: { type: Date, default: null },
  ...ts
}, {}, s => {
  s.virtual('class', ref('Class', 'classId'));
  s.virtual('student', ref('User', 'studentId'));
});

module.exports = {
  CourseLesson,
  LessonProgress,
  CourseQuestion,
  Counter,
  User,
  Course,
  Class,
  Enrollment,
  Schedule,
  Attendance,
  Assignment,
  Submission,
  Grade,
  TuitionInvoice,
  TuitionPayment,
  PaymentOrder,
  PaymentTransaction,
  PaymentDiscrepancy,
  RefundRequest,
  PaymentAuditLog,
  Notification,
  StudentRequest,
  TRANSACTION_STATUSES,
  DISCREPANCY_REASONS,
  nextIds
};
