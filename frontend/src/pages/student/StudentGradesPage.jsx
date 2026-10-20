import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Typography, Row, Col, Statistic, Select, Space, Button, Empty, Alert } from 'antd';
import { TrophyOutlined, ReloadOutlined, BookOutlined } from '@ant-design/icons';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LabelList } from 'recharts';
import apiClient from '../../api/client';
import { GradeResultTag, scoreText, PRIMARY } from './studentHelpers';

const { Text } = Typography;

const rankOf = (gpa) => {
  if (gpa >= 9) return { label: 'Xuất sắc', color: '#52c41a' };
  if (gpa >= 8) return { label: 'Giỏi', color: '#73d13d' };
  if (gpa >= 6.5) return { label: 'Khá', color: '#1677ff' };
  if (gpa >= 5) return { label: 'Trung bình', color: '#fa8c16' };
  if (gpa > 0) return { label: 'Yếu', color: '#ff4d4f' };
  return { label: 'Chưa xếp loại', color: '#8c8c8c' };
};

/**
 * BF-STU-8 / UC8.4: Bảng điểm từng môn (CC / GK / CK / Tổng kết) & GPA tích lũy theo tín chỉ (DF28)
 */
const StudentGradesPage = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [semester, setSemester] = useState('ALL');

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students/my-grades');
      if (res.success) setData(res.data);
    } catch (err) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grades = data?.grades || [];
  const semesters = useMemo(() => [...new Set(grades.map((g) => g.semester))], [grades]);
  const filtered = semester === 'ALL' ? grades : grades.filter((g) => g.semester === semester);
  const rank = rankOf(data?.gpa || 0);
  const bannedCount = grades.filter((g) => g.isBanned).length;

  const scoreCell = (v) => (v === null || v === undefined ? <Text type="secondary">-</Text> : scoreText(v));

  const columns = [
    {
      title: 'Môn học',
      render: (_, r) => (
        <div>
          <Text strong>
            {r.courseCode} - {r.courseName}
          </Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {r.classCode} • GV: {r.teacherName}
          </div>
        </div>
      )
    },
    { title: 'Học kỳ', dataIndex: 'semester', width: 100 },
    { title: 'Tín chỉ', dataIndex: 'credits', width: 80, align: 'center' },
    { title: 'Chuyên cần', dataIndex: 'attendanceScore', width: 100, align: 'center', render: scoreCell },
    { title: 'Giữa kỳ', dataIndex: 'midtermScore', width: 90, align: 'center', render: scoreCell },
    { title: 'Cuối kỳ', dataIndex: 'finalScore', width: 90, align: 'center', render: scoreCell },
    {
      title: 'Tổng kết',
      dataIndex: 'totalScore',
      width: 100,
      align: 'center',
      sorter: (a, b) => (a.totalScore ?? -1) - (b.totalScore ?? -1),
      render: (v, r) =>
        v === null || v === undefined ? (
          <Text type="secondary">-</Text>
        ) : (
          <Text strong style={{ color: r.isPassed ? '#52c41a' : '#ff4d4f' }}>
            {scoreText(v)}
          </Text>
        )
    },
    { title: 'Kết quả', width: 120, render: (_, r) => <GradeResultTag row={r} /> }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderTop: `3px solid ${PRIMARY}` }}>
            <Statistic
              title="GPA tích lũy (thang 10)"
              value={data?.gpa || 0}
              precision={2}
              prefix={<TrophyOutlined style={{ color: PRIMARY }} />}
              valueStyle={{ color: PRIMARY }}
            />
            <Text style={{ color: rank.color }}>Xếp loại: {rank.label}</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false}>
            <Statistic title="Tín chỉ tích lũy" value={data?.totalCredits || 0} prefix={<BookOutlined />} />
            <Text type="secondary">Tính trên các môn đã có điểm</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false}>
            <Statistic title="Môn qua" value={data?.passedCourses || 0} suffix={`/ ${data?.totalCourses || 0}`} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false}>
            <Statistic title="Môn học lại" value={data?.failedCourses || 0} valueStyle={{ color: (data?.failedCourses || 0) > 0 ? '#ff4d4f' : undefined }} />
          </Card>
        </Col>
      </Row>

      {bannedCount > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message={`Bạn bị CẤM THI ${bannedCount} môn do vắng không phép vượt 20% số buổi`}
          description="Các môn này nhận kết quả Học lại. Vui lòng đăng ký học lại ở kỳ sau."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: PRIMARY }} />
                <span>Bảng điểm chi tiết</span>
              </Space>
            }
            extra={
              <Space>
                <Select
                  style={{ width: 160 }}
                  value={semester}
                  onChange={setSemester}
                  options={[{ value: 'ALL', label: 'Tất cả học kỳ' }, ...semesters.map((s) => ({ value: s, label: s }))]}
                />
                <Button icon={<ReloadOutlined />} onClick={load} />
              </Space>
            }
          >
            <Table
              rowKey="enrollmentId"
              loading={loading}
              dataSource={filtered}
              columns={columns}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: <Empty description="Chưa có môn học nào" /> }}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              Điểm tổng kết = CC × 10% + GK × 30% + CK × 60%. Qua môn khi Cuối kỳ ≥ 3.5, Tổng kết ≥ 4.0 và không bị cấm thi (vắng không phép {'<'} 20%).
            </Text>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="GPA theo học kỳ">
            {(data?.gpaBySemester || []).length === 0 ? (
              <Empty description="Chưa có dữ liệu" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.gpaBySemester} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semester" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip formatter={(v) => [v, 'GPA']} />
                  <ReferenceLine y={4} stroke="#ff4d4f" strokeDasharray="4 4" />
                  <Bar dataKey="gpa" fill={PRIMARY} radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="gpa" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StudentGradesPage;
