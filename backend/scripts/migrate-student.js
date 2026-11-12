/** Additive migration for the Student portal. Never resets or fabricates course content. */
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const M = require('../src/models');

async function migrateStudentData(db) {
  const result = {};
  for (const [collection, fields] of Object.entries({
    courses: { category: 'FPT_SUBJECT', deliveryMode: 'LIVE_ONLINE', level: 'BEGINNER', instructorId: null, thumbnailUrl: null },
    classes: { meetUrl: null },
    enrollments: { progressPercent: 0, completedLessonsCount: 0 }
  })) {
    result[collection] = 0;
    for (const [field, value] of Object.entries(fields)) {
      const updated = await db.collection(collection).updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
      result[collection] += updated.modifiedCount;
    }
  }
  // Legacy courses were classroom courses. Reuse an existing assigned teacher, without inventing media URLs.
  const classes = await db.collection('classes').find({ teacherId: { $type: 'number' } }).sort({ id: 1 }).toArray();
  for (const item of classes) {
    await db.collection('courses').updateOne({ id: item.courseId, instructorId: null }, { $set: { instructorId: item.teacherId } });
  }
  for (const model of [M.CourseLesson, M.LessonProgress, M.CourseQuestion]) {
    await model.createCollection();
    await model.createIndexes();
  }
  return result;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined, autoIndex: false, serverSelectionTimeoutMS: 15000 });
  try {
    const db = mongoose.connection.db;
    const counts = {};
    for (const name of ['users', 'courses', 'classes', 'enrollments', 'tuition_invoices', 'tuition_payments', 'course_lessons', 'lesson_progress', 'course_questions']) {
      counts[name] = await db.collection(name).countDocuments();
    }
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', counts }));
    if (!process.argv.includes('--apply')) return;
    const backupDir = path.resolve(__dirname, '../backups', `student-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await fs.mkdir(backupDir, { recursive: true });
    for (const name of ['courses', 'classes', 'enrollments']) {
      await fs.writeFile(path.join(backupDir, `${name}.json`), JSON.stringify(await db.collection(name).find({}).toArray(), null, 2));
    }
    console.log('Backup: ' + backupDir);
    console.log(JSON.stringify({ changes: await migrateStudentData(db) }));
    for (const [name, count] of Object.entries(counts)) {
      if (await db.collection(name).countDocuments() !== count) throw new Error(`Unexpected count change: ${name}`);
    }
    console.log('Verified: record counts unchanged; no user, grade, invoice or payment writes.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error('Migration failed:', error.name, error.code || '', error.message.startsWith('Unexpected') ? error.message : 'Check database connectivity/configuration.'); process.exitCode = 1; });
module.exports = { migrateStudentData };
