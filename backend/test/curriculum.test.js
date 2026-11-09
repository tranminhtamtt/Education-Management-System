const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SE_CURRICULUM, calculateStudentTerm, checkPrerequisites, summarizeEnrollments } = require('../src/modules/curriculum/curriculumData');
const { buildSeed, calendarTerm } = require('../scripts/seed');

const enr = (code, { passed = false, total = null, classStatus = 'COMPLETED', banned = false } = {}) => ({
  status: 'ACTIVE',
  class: { status: classStatus, course: { courseCode: code } },
  grade: { isPassed: passed, totalScore: total, isBanned: banned }
});

test('every curriculum term is reachable: passing all earlier terms puts the student in that term with prerequisites met', () => {
  for (let term = 1; term <= 9; term++) {
    const passed = SE_CURRICULUM.filter(c => c.term < term).map(c => c.courseCode);
    assert.equal(calculateStudentTerm(passed), term);
    for (const c of SE_CURRICULUM.filter(c => c.term === term)) assert.equal(checkPrerequisites(c.courseCode, passed).isEligible, true, c.courseCode);
  }
});

test('no curriculum course depends on a missing or same/future-term course', () => {
  for (const c of SE_CURRICULUM) for (const p of c.prerequisites) {
    const prerequisite = SE_CURRICULUM.find(x => x.courseCode.toUpperCase() === p.toUpperCase());
    assert.ok(prerequisite && prerequisite.term < c.term, `${c.courseCode} -> ${p}`);
  }
});

test('a failed course no longer freezes the student in that term; the retake is tracked and prerequisites still block dependants', () => {
  const term1 = SE_CURRICULUM.filter(c => c.term === 1).map(c => c.courseCode);
  const list = term1.map(code => code === 'PRF192' ? enr(code, { total: 3.2 }) : enr(code, { passed: true, total: 7 }));
  const s = summarizeEnrollments(list);
  assert.equal(s.currentTerm, 2);
  assert.ok(!s.passedCodes.includes('PRF192'));
  assert.ok(s.finishedCodes.includes('PRF192'));
  assert.equal(checkPrerequisites('PRO192', s.passedCodes).isEligible, false); // PRO192 cần PRF192
  assert.equal(checkPrerequisites('OSG201', s.passedCodes).isEligible, true);
});

test('courses being studied keep the student in the current term; dropped enrollments and duplicate passes are ignored', () => {
  const term1 = SE_CURRICULUM.filter(c => c.term === 1).map(c => c.courseCode);
  const list = [...term1.map(c => enr(c, { passed: true, total: 8 })), enr('PRO192', { classStatus: 'ONGOING' }), enr('PRF192', { passed: true, total: 9 }), { ...enr('MAD101', { passed: true, total: 8 }), status: 'DROPPED' }];
  const s = summarizeEnrollments(list);
  assert.equal(s.currentTerm, 2);
  assert.deepEqual(s.inProgressCodes, ['PRO192']);
  assert.equal(s.passedCredits, 12);
  assert.ok(!s.passedCodes.includes('MAD101'));
});

test('seed data: each term-K student passed every course of terms 1..K-1 and studies exactly the term-K courses', () => {
  const now = new Date(Date.UTC(2026, 10, 4));
  const { data, currentSemester } = buildSeed({ passwordHash: 'x', now });
  assert.equal(currentSemester, 'FA26');
  const courseById = new Map(data.courses.map(c => [c.id, c]));
  const classById = new Map(data.classes.map(c => [c.id, c]));
  const gradeByEnrollment = new Map(data.grades.map(g => [g.enrollmentId, g]));
  const students = data.users.filter(u => u.role === 'STUDENT');
  assert.equal(students.length, 27);
  for (const s of students) {
    const term = Number(s.code.slice(2, 4));
    const list = data.enrollments.filter(e => e.studentId === s.id).map(e => {
      const cls = classById.get(e.classId);
      return { status: 'ACTIVE', class: { ...cls, course: courseById.get(cls.courseId) }, grade: gradeByEnrollment.get(e.id) };
    });
    const summary = summarizeEnrollments(list);
    assert.equal(summary.currentTerm, term, s.code);
    const codes = t => SE_CURRICULUM.filter(t).map(c => c.courseCode.toUpperCase()).sort();
    assert.deepEqual(summary.passedCodes.sort(), codes(c => c.term < term), s.code);
    assert.deepEqual(summary.inProgressCodes.sort(), codes(c => c.term === term), s.code);
    assert.ok(list.filter(e => e.class.status === 'ONGOING').every(e => e.class.semester === 'FA26'), s.code);
  }
});

test('seed data: one invoice per enrollment, current-term invoices UNPAID, no room/teacher/student schedule conflicts', () => {
  const { data } = buildSeed({ passwordHash: 'x', now: new Date(Date.UTC(2026, 10, 4)) });
  assert.equal(data.tuition_invoices.length, data.enrollments.length);
  assert.equal(new Set(data.tuition_invoices.map(i => i.enrollmentId)).size, data.enrollments.length);
  const classById = new Map(data.classes.map(c => [c.id, c]));
  for (const inv of data.tuition_invoices) {
    const cls = classById.get(data.enrollments.find(e => e.id === inv.enrollmentId).classId);
    assert.equal(inv.status, cls.status === 'ONGOING' ? 'UNPAID' : 'PAID');
  }
  const room = new Set(), teacher = new Set();
  for (const sc of data.schedules) {
    const cls = classById.get(sc.classId);
    const r = `${cls.semester}|${sc.dayOfWeek}|${sc.shift}|${sc.room}`, t = `${cls.semester}|${sc.dayOfWeek}|${sc.shift}|${cls.teacherId}`;
    assert.ok(!room.has(r), r); assert.ok(!teacher.has(t), t);
    room.add(r); teacher.add(t);
  }
  assert.equal(calendarTerm(2026 * 3 + 2).semester, 'FA26');
  assert.equal(calendarTerm(2026 * 3).semester, 'SP26');
});
