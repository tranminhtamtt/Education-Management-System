const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startMongo, stopMongo, resetMongo } = require('./helpers/mongo');
const { User, Course, Class, Enrollment, Grade } = require('../src/models');
const { withTransaction, lockDoc } = require('../src/config/db');

before(startMongo);
after(stopMongo);

test('numeric auto-increment ids, embedded profile, virtual populate and JSON shape', async () => {
  await resetMongo();
  const [u] = await User.create([{ code: 'S1', email: 's1@x', passwordHash: 'h', fullName: 'A', studentProfile: { enrollmentYear: 2025 } }]);
  const more = await User.insertMany([{ code: 'S2', email: 's2@x', passwordHash: 'h', fullName: 'B' }, { code: 'S3', email: 's3@x', passwordHash: 'h', fullName: 'C' }]);
  assert.equal(typeof u.id, 'number');
  assert.deepEqual(more.map(m => m.id), [u.id + 1, u.id + 2]);
  const c = await Course.create({ courseCode: 'PRF192', name: 'P' });
  const cl = await Class.create({ classCode: 'C1', courseId: c.id, semester: 'FA26' });
  const e = await Enrollment.create({ classId: cl.id, studentId: u.id });
  await Grade.create({ enrollmentId: e.id });
  const loaded = await Enrollment.findOne({ id: e.id }).populate([{ path: 'class', populate: 'course' }, 'grade', 'student']).lean({ virtuals: true });
  const doc = await Enrollment.findOne({ id: e.id }).populate([{ path: 'class', populate: 'course' }, 'grade', 'student']);
  const json = doc.toJSON();
  assert.equal(json.class.course.courseCode, 'PRF192');
  assert.equal(json.grade.isPassed, false);
  assert.equal(json._id, undefined);
  assert.equal(json.student.passwordHash, undefined);
  assert.ok(loaded);
});

test('transaction rollback and lock conflicts retry', async () => {
  await resetMongo();
  const c = await Course.create({ courseCode: 'X', name: 'X', credits: 0 });
  await assert.rejects(withTransaction(async session => {
    await Course.updateOne({ id: c.id }, { $set: { credits: 9 } }, { session });
    throw new Error('boom');
  }));
  assert.equal((await Course.findOne({ id: c.id })).credits, 0);
  await Promise.all(Array.from({ length: 5 }, () => withTransaction(async session => {
    const cur = await lockDoc(Course, { id: c.id }, session);
    await Course.updateOne({ id: c.id }, { $set: { credits: cur.credits + 1 } }, { session });
  })));
  assert.equal((await Course.findOne({ id: c.id })).credits, 5);
});

