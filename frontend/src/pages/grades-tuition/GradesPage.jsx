import React, { useState, useEffect } from 'react';
import { Card, Table, Select, Button, InputNumber, Tag, Typography, Space, message, Alert, Statistic, Row, Col } from 'antd';
import { SaveOutlined, TrophyOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Text, Title } = Typography;

const GradesPage = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const isTeacherOrAdmin = ['TEACHER', 'ADMIN'].includes(user?.role);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [gradesData, setGradesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dành cho sinh viên
  const [myGradesOverview, setMyGradesOverview] = useState(null);

  useEffect(() => {
    if (isStudent) {
      fetchMyGrades();
    } else {
      fetchClasses();
    }
  }, [isStudent]);

  const fetchClasses = async () => {
    try {
      const res = await apiClient.get('/classes');
      if (res.success && res.data.length > 0) {
        setClasses(res.data);
        setSelectedClassId(res.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  };

  const fetchClassGrades = async (classId) => {
    if (!classId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/classes/${classId}/grades`);
      if (res.success) {
        setGradesData(res.data.grades);
      }
    } catch (err) {
      message.error('Lỗi khi tải bảng điểm lớp');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyGrades = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students/my-grades');
      if (res.success) {
        setMyGradesOverview(res.data);
      }
    } catch (err) {
      message.error('Lỗi khi tải bảng điểm cá nhân');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId && isTeacherOrAdmin) {
      fetchClassGrades(selectedClassId);
    }
  }, [selectedClassId, isTeacherOrAdmin]);

  // Cập nhật điểm thành phần trực tiếp trên Editable Table
  const handleScoreChange = (enrollmentId, field, value) => {
    setGradesData(prev =>
      prev.map(item => {
        if (item.enrollmentId === enrollmentId) {
          const updated = { ...item, [field]: value };
          // Tự tính tổng kết tạm thời trên frontend
          const att = updated.attendanceScore;
          const mid = updated.midtermScore;
          const fin = updated.finalScore;

          if (att !== null && mid !== null && fin !== null) {
            const total = parseFloat((att * 0.1 + mid * 0.3 + fin * 0.6).toFixed(1));
            const isPassed = !updated.isBanned && fin >= 3.5 && total >= 4.0;
            return { ...updated, totalScore: total, isPassed };
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Lưu bảng điểm lên server
  const handleSaveGrades = async () => {
    try {
      setSaving(true);
      const res = await apiClient.put(`/classes/${selectedClassId}/grades`, {
        gradesList: gradesData.map(g => ({
          enrollmentId: g.enrollmentId,
          attendanceScore: g.attendanceScore,
          midtermScore: g.midtermScore,
          finalScore: g.finalScore,
          isBanned: g.isBanned
        }))
      });
      if (res.success) {
        message.success('Cập nhật bảng điểm và xét điều kiện qua môn thành công');
        fetchClassGrades(selectedClassId);
      }
    } catch (err) {
      message.error('Lỗi khi lưu bảng điểm');
    } finally {
      setSaving(false);
    }
  };

  // Bảng điểm Giảng viên / Admin (Editable Grid)
  const teacherColumns = [
    {
      title: 'Mã SV',
      dataIndex: 'studentCode',
      width: 120,
      render: (c) => <Text strong style={{ color: '#F26F21' }}>{c}</Text>
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'studentName',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Chuyên cần (10%)',
      width: 150,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={10}
          step={0.5}
          value={r.attendanceScore}
          onChange={(val) => handleScoreChange(r.enrollmentId, 'attendanceScore', val)}
          disabled={r.isBanned}
          placeholder="0 - 10"
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Giữa kỳ (30%)',
      width: 150,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={10}
          step={0.5}
          value={r.midtermScore}
          onChange={(val) => handleScoreChange(r.enrollmentId, 'midtermScore', val)}
          disabled={r.isBanned}
          placeholder="0 - 10"
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Cuối kỳ (60%)',
      width: 150,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={10}
          step={0.5}
          value={r.finalScore}
          onChange={(val) => handleScoreChange(r.enrollmentId, 'finalScore', val)}
          disabled={r.isBanned}
          placeholder="0 - 10"
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Tổng kết',
      dataIndex: 'totalScore',
      width: 110,
      align: 'center',
      render: (t) => t !== null && t !== undefined ? <Text strong style={{ fontSize: 16 }}>{t}</Text> : '-'
    },
    {
      title: 'Trạng thái môn',
      width: 160,
      render: (_, r) => {
        if (r.isBanned) return <Tag color="error">CẤM THI (&gt;20%)</Tag>;
        if (r.totalScore === null || r.totalScore === undefined) return <Tag color="default">Chưa hoàn thành</Tag>;
        if (r.isPassed) return <Tag color="success" icon={<CheckCircleOutlined />}>PASSED (Đạt)</Tag>;
        return <Tag color="error" icon={<CloseCircleOutlined />}>NOT PASSED</Tag>;
      }
    }
  ];

  // Giao diện Sinh viên xem bảng điểm
  if (isStudent && myGradesOverview) {
    return (
      <div>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Điểm trung bình tích lũy (GPA)"
                value={myGradesOverview.gpa}
                precision={2}
                prefix={<TrophyOutlined style={{ color: '#faad14' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Tổng số tín chỉ đã học"
                value={myGradesOverview.totalCredits}
                suffix="TC"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Tổng số môn đã đăng ký"
                value={myGradesOverview.totalCourses}
                suffix="môn"
              />
            </Card>
          </Col>
        </Row>

        <Card title="Bảng điểm chi tiết kết quả học tập">
          <Table
            rowKey="enrollmentId"
            dataSource={myGradesOverview.grades}
            loading={loading}
            pagination={false}
            columns={[
              { title: 'Học kỳ', dataIndex: 'semester', render: (s) => <Tag color="geekblue">{s}</Tag> },
              { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Text strong>{c}</Text> },
              { title: 'Môn học', dataIndex: 'courseName' },
              { title: 'Tín chỉ', dataIndex: 'credits', render: (tc) => `${tc} TC` },
              { title: 'Chuyên cần (10%)', render: (_, r) => r.grade?.attendanceScore ?? '-' },
              { title: 'Giữa kỳ (30%)', render: (_, r) => r.grade?.midtermScore ?? '-' },
              { title: 'Cuối kỳ (60%)', render: (_, r) => r.grade?.finalScore ?? '-' },
              {
                title: 'Tổng kết',
                render: (_, r) => r.grade?.totalScore !== null && r.grade?.totalScore !== undefined
                  ? <Text strong style={{ color: '#F26F21', fontSize: 15 }}>{r.grade.totalScore}</Text>
                  : '-'
              },
              {
                title: 'Kết quả',
                render: (_, r) => {
                  if (r.grade?.isBanned) return <Tag color="error">CẤM THI</Tag>;
                  if (r.grade?.isPassed) return <Tag color="success">ĐẠT (PASSED)</Tag>;
                  if (r.grade?.totalScore !== null && r.grade?.totalScore !== undefined) return <Tag color="error">TRƯỢT MÔN</Tag>;
                  return <Tag color="default">Đang học</Tag>;
                }
              }
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card
        title="Quản lý Bảng điểm Lớp học phần"
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSaveGrades}
            style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
          >
            Lưu Bảng Điểm & Xét Qua Môn
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Text strong>Chọn Lớp Học:</Text>
          <Select
            style={{ width: 280 }}
            value={selectedClassId}
            onChange={setSelectedClassId}
            options={classes.map(c => ({
              label: `${c.classCode} - ${c.course.name}`,
              value: c.id
            }))}
          />
        </Space>

        <Alert
          message="Quy chế FAP: Điểm tổng kết = CC * 0.1 + GK * 0.3 + CK * 0.6. Điều kiện qua môn: Không cấm thi, Điểm cuối kỳ >= 3.5, Điểm tổng kết >= 4.0."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          rowKey="enrollmentId"
          columns={teacherColumns}
          dataSource={gradesData}
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default GradesPage;
