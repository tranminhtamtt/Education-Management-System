const { Class, Course, CourseLesson } = require('../../models');

async function teacherQuestionScope(teacherId, session = null) {
  const classes = await Class.find({ teacherId }).select('id').session(session);
  const courses = await Course.find({ instructorId: teacherId }).select('id').session(session);
  const lessons = await CourseLesson.find({ courseId: { $in: courses.map(course => course.id) } })
    .select('id').session(session);

  return {
    $or: [
      { teacherId },
      { teacherId: null, classId: { $in: classes.map(item => item.id) } },
      { teacherId: null, classId: null, lessonId: { $in: lessons.map(lesson => lesson.id) } }
    ]
  };
}

module.exports = { teacherQuestionScope };
