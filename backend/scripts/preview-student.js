// Local UI preview with disposable fixtures. Never connects to the configured Atlas URI.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'local-disposable-student-preview';
const express = require('express');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { startMongo, stopMongo } = require('../test/helpers/mongo');
const M = require('../src/models');
const app = require('../src/app');
async function main() {
  await startMongo();
  await M.User.create([
    { id: 1, code: 'DEMO-STUDENT', email: 'student@preview.local', passwordHash: 'unused', fullName: 'Học viên Demo', role: 'STUDENT' },
    { id: 2, code: 'DEMO-TEACHER', email: 'teacher@preview.local', passwordHash: 'unused', fullName: 'Giảng viên Demo', role: 'TEACHER' }
  ]);
  await M.Course.create([
    { id: 1, courseCode: 'PRF192-VIDEO', name: 'Lập trình C căn bản', description: 'Bài giảng quay sẵn, bài tập thực hành và hỏi đáp với giảng viên.', instructorId: 2, deliveryMode: 'RECORDED', baseTuitionFee: 0 },
    { id: 2, courseCode: 'IELTS-LIVE', name: 'IELTS Intensive 6.5+', description: 'Lớp trực tuyến tương tác, luyện tập bốn kỹ năng cùng giảng viên.', category: 'CERTIFICATE', deliveryMode: 'LIVE_ONLINE', instructorId: 2, baseTuitionFee: 2500000 }
  ]);
  await M.Class.create([
    { id: 1, classCode: 'VIDEO-1', courseId: 1, teacherId: 2, semester: 'SELF_PACED', status: 'ONGOING' },
    { id: 2, classCode: 'IELTS-FA26', courseId: 2, teacherId: 2, semester: 'FA26', status: 'ONGOING' }
  ]);
  await M.CourseLesson.create([
    { id: 1, courseId: 1, orderIndex: 1, sectionTitle: 'Chương 1: Nhập môn', title: 'Làm quen ngôn ngữ C', durationMinutes: 15 },
    { id: 2, courseId: 1, orderIndex: 2, sectionTitle: 'Chương 1: Nhập môn', title: 'Biến và kiểu dữ liệu', durationMinutes: 20 }
  ]);
  await M.Enrollment.create({ id: 1, classId: 1, studentId: 1, status: 'ACTIVE' });
  await M.TuitionInvoice.create({ enrollmentId: 1, studentId: 1, amount: 0, paidAmount: 0, status: 'PAID', dueDate: new Date() });
  await M.Assignment.create({ classId: 1, title: 'Bài tập biến và kiểu dữ liệu', dueDate: new Date(Date.now() + 3 * 86400000) });
  const preview = express();
  preview.get('/__preview', (req, res) => res.type('html').send(`<script>localStorage.setItem('ems_token', ${JSON.stringify(jwt.sign({ id: 1, email: 'student@preview.local', role: 'STUDENT' }, process.env.JWT_SECRET))});location.replace('/dashboard');</script>`));
  preview.use((req, res, next) => /^\/(api|uploads)\//.test(req.path) ? app(req, res, next) : next());
  const dist = path.resolve(__dirname, '../../frontend/dist');
  preview.use(express.static(dist));
  preview.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  const server = preview.listen(5180, '127.0.0.1', () => console.log('Disposable Student UI preview: http://127.0.0.1:5180/__preview (in-memory data only)'));
  const close = async () => { server.close(); await stopMongo(); process.exit(0); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
