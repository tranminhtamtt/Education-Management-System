/**
 * Chính sách ghi danh theo khung chương trình (dùng chung cho ghi danh đơn lẻ UC4.2
 * và xếp lớp hàng loạt). Mọi kiểm tra + tạo enrollment/grade/invoice chạy trong
 * cùng một transaction MongoDB; student và class được "khóa" bằng lockDoc để hai
 * yêu cầu đồng thời không vượt sĩ số hoặc ghi danh trùng.
 */
const { withTransaction, lockDoc } = require('../../config/db');
const { User, Class, Enrollment, Grade, TuitionInvoice } = require('../../models');
const { checkPrerequisites, summarizeEnrollments, findCurriculumCourse } = require('./curriculumData');

const invalid = (message, extra = {}) => Object.assign(new Error(message), { status: 400, ...extra });

async function loadStudentEnrollments(studentId, session) {
  return Enrollment.find({ studentId, status: 'ACTIVE' })
    .session(session || null)
    .populate([{ path: 'class', populate: ['course', 'schedules'] }, 'grade'])
    .then(list => list.map(e => e.toJSON()));
}

/**
 * Kiểm tra điều kiện; ném lỗi status 400 (hoặc 409 trùng lịch).
 * `force` (đặc cách của Giáo vụ) chỉ bỏ qua tiên quyết và vượt kỳ.
 */
async function validateEnrollment(classId, studentId, { session, force = false } = {}) {
  const c = await Class.findOne({ id: classId }).session(session || null).populate(['course', 'schedules']);
  const student = await User.findOne({ id: studentId }).session(session || null);
  if (!c) throw Object.assign(new Error('Không tìm thấy lớp học phần'), { status: 404 });
  if (c.status === 'COMPLETED') throw invalid('Lớp đã kết thúc, không nhận ghi danh');
  if (!student || student.role !== 'STUDENT' || student.status !== 'ACTIVE') throw invalid('Sinh viên không hợp lệ hoặc không còn hoạt động');

  const activeCount = await Enrollment.countDocuments({ classId, status: 'ACTIVE' }).session(session || null);
  if (activeCount >= c.maxStudents) throw invalid(`Lớp đã đạt sĩ số tối đa (${c.maxStudents} sinh viên). Không thể thêm học viên.`);
  if (await Enrollment.exists({ classId, studentId }).session(session || null)) throw invalid('Học viên này đã có trong danh sách lớp học');

  const enrollments = await loadStudentEnrollments(studentId, session);
  const summary = summarizeEnrollments(enrollments);
  const code = c.course.courseCode.toUpperCase();
  const course = findCurriculumCourse(code);

  if (summary.passedCodes.includes(code)) throw invalid(`Sinh viên đã hoàn thành môn ${code}`);
  const studyingSame = enrollments.find(e => e.class?.course?.courseCode?.toUpperCase() === code && e.class.status !== 'COMPLETED' && !e.grade?.isPassed && (e.grade?.totalScore === null || e.grade?.totalScore === undefined));
  if (studyingSame) throw invalid(`Sinh viên đang học môn ${code} ở lớp ${studyingSame.class.classCode} (${studyingSame.class.semester})`);

  if (!force) {
    const check = checkPrerequisites(code, summary.passedCodes);
    if (!check.isEligible) {
      throw invalid(`[Chưa đủ điều kiện tiên quyết] Học viên chưa hoàn thành môn tiên quyết: ${check.missingPrerequisites.join(', ')}.`, { data: { missingPrerequisites: check.missingPrerequisites, canForce: true } });
    }
    if (course && course.term > summary.currentTerm) {
      throw invalid(`Môn ${code} thuộc kỳ ${course.term}, vượt kỳ hiện tại (kỳ ${summary.currentTerm}) của sinh viên trong khung chương trình.`, { data: { courseTerm: course.term, currentTerm: summary.currentTerm, canForce: true } });
    }
  }

  const schedules = c.schedules || [];
  for (const e of enrollments.filter(e => e.class && e.class.semester === c.semester && e.class.status !== 'COMPLETED')) {
    for (const a of schedules) {
      if ((e.class.schedules || []).some(b => a.dayOfWeek === b.dayOfWeek && a.shift === b.shift)) {
        throw Object.assign(new Error(`[Xung đột lịch học viên] Học viên đã có lịch học lớp ${e.class.classCode} vào Thứ ${a.dayOfWeek}, Slot ${a.shift} trong học kỳ ${c.semester}. Không thể ghi danh!`), { status: 409 });
      }
    }
  }
  return { cls: c, student, summary };
}

/**
 * Ghi danh + trigger tự động: Grade trống và TuitionInvoice UNPAID theo baseTuitionFee của môn.
 */
async function enrollStudent(classId, studentId, { force = false } = {}) {
  return withTransaction(async session => {
    await lockDoc(User, { id: studentId }, session);
    await lockDoc(Class, { id: classId }, session);
    const { cls } = await validateEnrollment(classId, studentId, { session, force });

    const [enrollment] = await Enrollment.create([{ classId, studentId, status: 'ACTIVE' }], { session });
    const [grade] = await Grade.create([{
      enrollmentId: enrollment.id,
      attendanceScore: null,
      midtermScore: null,
      finalScore: null,
      totalScore: null,
      isPassed: false,
      isBanned: false
    }], { session });

    const tuitionFee = Number(cls.course?.baseTuitionFee ?? 5000000);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // Hạn đóng sau 30 ngày
    const [invoice] = await TuitionInvoice.create([{
      studentId,
      enrollmentId: enrollment.id,
      amount: tuitionFee,
      paidAmount: 0,
      dueDate,
      status: 'UNPAID'
    }], { session });

    return { enrollment: enrollment.toJSON(), grade: grade.toJSON(), invoice: invoice.toJSON() };
  });
}

module.exports = { validateEnrollment, enrollStudent, loadStudentEnrollments };
