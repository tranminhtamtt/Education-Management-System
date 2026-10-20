import React from 'react';
import { Tag } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  TrophyOutlined
} from '@ant-design/icons';

export const PRIMARY = '#F26F21';

// ===== Điểm danh (UC6.3*) =====
export const ATTENDANCE_STATUS = {
  PRESENT: { label: 'Có mặt', color: 'success' },
  LATE: { label: 'Đi muộn', color: 'warning' },
  ABSENT_EXCUSED: { label: 'Vắng có phép', color: 'purple' },
  ABSENT_UNEXCUSED: { label: 'Vắng không phép', color: 'error' }
};

export const AttendanceTag = ({ status }) => {
  const s = ATTENDANCE_STATUS[status] || { label: status, color: 'default' };
  return <Tag color={s.color}>{s.label}</Tag>;
};

export const warningColor = (level) => (level === 'BANNED' ? '#ff4d4f' : level === 'WARNING' ? '#fa8c16' : '#52c41a');

export const AttendanceWarningTag = ({ level }) => {
  if (level === 'BANNED') return <Tag color="error">CẤM THI (vắng ≥ 20%)</Tag>;
  if (level === 'WARNING') return <Tag color="warning">Cảnh báo vắng</Tag>;
  return <Tag color="success">An toàn</Tag>;
};

// ===== Bài tập (UC7.2 / UC7.4*) =====
export const ASSIGNMENT_STATE = {
  PENDING: { label: 'Chưa nộp', color: 'processing', icon: <ClockCircleOutlined /> },
  MISSING: { label: 'Quá hạn – chưa nộp', color: 'error', icon: <CloseCircleOutlined /> },
  SUBMITTED: { label: 'Đã nộp đúng hạn', color: 'success', icon: <CheckCircleOutlined /> },
  LATE_SUBMITTED: { label: 'Nộp muộn', color: 'warning', icon: <ExclamationCircleOutlined /> },
  GRADED: { label: 'Đã chấm điểm', color: 'gold', icon: <TrophyOutlined /> }
};

export const AssignmentStateTag = ({ state }) => {
  const s = ASSIGNMENT_STATE[state] || { label: state, color: 'default' };
  return (
    <Tag color={s.color} icon={s.icon}>
      {s.label}
    </Tag>
  );
};

// ===== Kết quả học tập (UC8.4) =====
export const GradeResultTag = ({ row }) => {
  if (row.isBanned) return <Tag color="error">CẤM THI</Tag>;
  if (row.totalScore === null || row.totalScore === undefined) return <Tag>Đang học</Tag>;
  if (row.isPassed) return <Tag color="success">QUA MÔN</Tag>;
  return <Tag color="error">HỌC LẠI</Tag>;
};

export const scoreText = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(1));
