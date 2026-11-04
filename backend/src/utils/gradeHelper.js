const { Class, Attendance, Enrollment, Grade } = require('../models');

/**
 * Đồng bộ trạng thái Chuyên cần, Cảnh báo Cấm thi (is_banned) và Điểm chuyên cần giữa Member 3 & Member 4
 * @param {import('mongoose').ClientSession|null} session - Session transaction (tùy chọn)
 * @param {number} classId - ID lớp học phần
 * @param {number} studentId - ID học viên
 */
async function syncAttendanceAndGrades(session, classId, studentId) {
  // 1. Lấy thông tin lớp và tổng số buổi học của môn
  const classInfo = await Class.findOne({ id: classId }).session(session || null).populate('course');

  if (!classInfo) return null;

  const totalSessions = classInfo.course?.totalSessions || 30;

  // 2. Lấy tất cả bản ghi điểm danh của học viên trong lớp
  const attendances = await Attendance.find({ classId, studentId }).session(session || null);

  const absentUnexcused = attendances.filter(a => a.status === 'ABSENT_UNEXCUSED').length;
  const absentExcused = attendances.filter(a => a.status === 'ABSENT_EXCUSED').length;
  const present = attendances.filter(a => a.status === 'PRESENT').length;
  const late = attendances.filter(a => a.status === 'LATE').length;

  // Công thức tỷ lệ vắng: (Số buổi vắng không phép / Tổng số buổi) * 100%
  const absentRate = (absentUnexcused / totalSessions) * 100;
  const isBanned = absentRate >= 20.0;

  // Điểm chuyên cần tự động gợi ý (thang 10): Đi đủ = 10, vắng không phép bị trừ
  // Điểm danh có phép và đi muộn có mức tính linh hoạt
  const recorded = attendances.length;
  let autoAttendanceScore = 10.0;
  if (recorded > 0) {
    const earned = (present * 1.0) + (late * 0.8) + (absentExcused * 0.9);
    autoAttendanceScore = parseFloat(Math.max(0, Math.min(10, (earned / recorded) * 10)).toFixed(1));
  }

  // 3. Tìm bản ghi enrollment để cập nhật Grade
  const enrollment = await Enrollment.findOne({ classId, studentId }).session(session || null);

  if (!enrollment) return null;

  const currentGrade = await Grade.findOne({ enrollmentId: enrollment.id }).session(session || null);
  const finalIsBanned = isBanned;
  let finalPassed = false;

  if (currentGrade) {
    const fin = currentGrade.finalScore !== null ? parseFloat(currentGrade.finalScore) : null;
    const tot = currentGrade.totalScore !== null ? parseFloat(currentGrade.totalScore) : null;

    if (isBanned) {
      finalPassed = false;
    } else if (fin !== null && tot !== null) {
      finalPassed = fin >= 3.5 && tot >= 4.0;
    }

    await Grade.updateOne(
      { enrollmentId: enrollment.id },
      {
        $set: {
          isBanned: finalIsBanned,
          isPassed: finalPassed,
          // Nếu điểm chuyên cần trước đó chưa có thì điền điểm gợi ý
          ...(currentGrade.attendanceScore === null ? { attendanceScore: autoAttendanceScore } : {})
        }
      },
      { session: session || undefined }
    );
  }

  return {
    studentId,
    classId,
    totalSessions,
    absentUnexcused,
    absentRate: parseFloat(absentRate.toFixed(1)),
    isBanned: finalIsBanned,
    autoAttendanceScore
  };
}

module.exports = {
  syncAttendanceAndGrades
};
