import React, { useState, useEffect } from 'react';
import { Card, Table, Select, DatePicker, Button, Radio, Tag, Progress, Typography, Space, message, Tabs, Alert, Input, Row, Col, Empty, Collapse } from 'antd';
import { CheckSquareOutlined, SaveOutlined, WarningOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const AttendancePage = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const isTeacher = user?.role === 'TEACHER';

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [sessionDate, setSessionDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  // Thống kê chuyên cần cả kỳ
  const [summaryData, setSummaryData] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Dành cho sinh viên
  const [studentReport, setStudentReport] = useState([]);

  useEffect(() => {
    if (isStudent) {
      fetchStudentReport();
    } else {
      fetchClasses();
    }
  }, [isStudent, isTeacher]);

  const fetchClasses = async () => {
    try {
      const params = isTeacher
        ? { status: 'ONGOING', deliveryMode: 'LIVE_ONLINE' }
        : { status: 'ONGOING' };
      const res = await apiClient.get('/classes', { params });
      if (res.success) {
        const nextClasses = res.data || [];
        setClasses(nextClasses);
        setSelectedClassId(nextClasses[0]?.id || null);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tải danh sách lớp học');
    }
  };

  const fetchAttendances = async (classId, date) => {
    if (!classId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/classes/${classId}/attendances`, {
        params: { date }
      });
      if (res.success) {
        setStudents(res.data.students);
      }
    } catch (err) {
      message.error('Lỗi khi lấy dữ liệu điểm danh');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (classId) => {
    if (!classId) return;
    try {
      setLoadingSummary(true);
      const res = await apiClient.get(`/classes/${classId}/attendance-summary`);
      if (res.success) {
        setSummaryData(res.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchStudentReport = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/attendances/my-report');
      if (res.success) {
        setStudentReport(res.data);
      }
    } catch (err) {
      message.error('Lỗi lấy báo cáo chuyên cần');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId && !isStudent) {
      fetchAttendances(selectedClassId, sessionDate);
      fetchSummary(selectedClassId);
    }
  }, [selectedClassId, sessionDate, isStudent]);

  const handleStatusChange = (studentId, status) => {
    setStudents(prev =>
      prev.map(s => (s.studentId === studentId ? { ...s, status } : s))
    );
  };

  const handleNoteChange = (studentId, note) => {
    setStudents(prev =>
      prev.map(s => (s.studentId === studentId ? { ...s, note } : s))
    );
  };

  // Lưu điểm danh buổi học
  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      const res = await apiClient.post(`/classes/${selectedClassId}/attendances`, {
        sessionDate,
        records: students.map(s => ({
          studentId: s.studentId,
          status: s.status,
          note: s.note
        }))
      });
      if (res.success) {
        message.success('Lưu điểm danh thành công!');
        fetchSummary(selectedClassId);
      }
    } catch (err) {
      message.error('Lỗi khi lưu điểm danh');
    } finally {
      setSaving(false);
    }
  };

  // Render bảng điểm danh giảng viên
  const attendanceColumns = [
    {
      title: 'Mã SV',
      dataIndex: 'code',
      width: 120,
      render: (c) => <Text strong style={{ color: '#F26F21' }}>{c}</Text>
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'fullName',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Trạng thái điểm danh',
      width: 380,
      render: (_, record) => (
        <Radio.Group
          value={record.status}
          onChange={(e) => handleStatusChange(record.studentId, e.target.value)}
        >
          <Radio.Button value="PRESENT" style={{ color: '#52c41a' }}>Có mặt</Radio.Button>
          <Radio.Button value="LATE" style={{ color: '#fa8c16' }}>Muộn</Radio.Button>
          <Radio.Button value="ABSENT_EXCUSED" style={{ color: '#722ed1' }}>Nghỉ có phép</Radio.Button>
          <Radio.Button value="ABSENT_UNEXCUSED" style={{ color: '#f5222d' }}>Vắng mặt</Radio.Button>
        </Radio.Group>
      )
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      render: (note, record) => (
        <Input
          placeholder="Lý do, ghi chú..."
          value={note}
          onChange={(e) => handleNoteChange(record.studentId, e.target.value)}
          style={{ width: '100%' }}
        />
      )
    }
  ];

  // Render bảng tổng kết chuyên cần FAP (>20% cấm thi)
  const summaryColumns = [
    {
      title: 'Mã SV',
      dataIndex: 'code',
      render: (c) => <Text strong>{c}</Text>
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'fullName'
    },
    {
      title: 'Có mặt',
      dataIndex: 'present',
      render: (p) => <Tag color="green">{p} buổi</Tag>
    },
    {
      title: 'Vắng có phép',
      dataIndex: 'absentExcused',
      render: (ae) => <Tag color="purple">{ae} buổi</Tag>
    },
    {
      title: 'Vắng không phép',
      dataIndex: 'absentUnexcused',
      render: (au) => <Tag color="red">{au} buổi</Tag>
    },
    {
      title: 'Tỷ lệ vắng mặt (%)',
      render: (_, r) => {
        let strokeColor = '#52c41a';
        if (r.warningLevel === 'WARNING') strokeColor = '#fa8c16';
        if (r.warningLevel === 'BANNED') strokeColor = '#ff4d4f';

        return (
          <div style={{ width: 140 }}>
            <Progress
              percent={r.absentRate}
              strokeColor={strokeColor}
              size="small"
              format={(p) => `${p}%`}
            />
          </div>
        );
      }
    },
    {
      title: 'Điều kiện thi',
      render: (_, r) => {
        if (r.isBanned) {
          return <Tag color="error" icon={<WarningOutlined />}>CẤM THI (&gt;20%)</Tag>;
        }
        if (r.warningLevel === 'WARNING') {
          return <Tag color="warning">Nguy cơ cấm thi</Tag>;
        }
        return <Tag color="success">Đủ điều kiện</Tag>;
      }
    }
  ];

  if (isStudent) {
    // Trung tâm khóa học: chuyên cần chỉ để học viên tự theo dõi, không xét cấm thi / điểm chuyên cần.
    const DAY_LABELS = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'Chủ nhật' };
    const SIMPLE_STATUS = {
      PRESENT: { color: 'success', text: '✅ Có mặt' },
      LATE: { color: 'warning', text: '⏰ Đi muộn' },
      ABSENT_EXCUSED: { color: 'default', text: '➖ Vắng' },
      ABSENT_UNEXCUSED: { color: 'default', text: '➖ Vắng' },
      UPCOMING: { color: 'blue', text: 'Sắp học' },
      NOT_RECORDED: { color: 'default', text: 'Chưa điểm danh' }
    };
    const today = dayjs().format('YYYY-MM-DD');

    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>Chuyên cần lớp Live</Title>
          <Text type="secondary">Theo dõi các buổi bạn đã tham gia. Nếu lỡ buổi nào, hãy xem lại tài liệu hoặc hỏi giảng viên nhé.</Text>
        </div>
        {!loading && studentReport.length === 0 && (
          <Card><Empty description="Bạn chưa có lớp Live nào đang học. Khóa video quay sẵn không cần điểm danh." /></Card>
        )}
        <Row gutter={[16, 16]}>
          {studentReport.map(r => {
            const held = r.recordedSessions || 0;
            const attended = r.attendedSessions ?? ((r.present || 0) + (r.late || 0));
            const pastSessions = (r.sessions || []).filter(s => s.status !== 'UPCOMING' && s.status !== 'NOT_RECORDED');
            const nextSessions = (r.sessions || []).filter(s => s.status === 'UPCOMING' && s.sessionDate >= today).slice(0, 3);
            return (
              <Col xs={24} lg={12} key={r.classId}>
                <Card
                  loading={loading}
                  title={<Space direction="vertical" size={0}><Text strong>{r.courseName}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.classCode} · {r.teacherName}</Text></Space>}
                  extra={r.meetUrl && /^https?:\/\//i.test(r.meetUrl) ? <Button type="link" href={r.meetUrl} target="_blank" rel="noreferrer">Vào lớp</Button> : null}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Text>Đã tham gia <Text strong>{attended}/{held}</Text> buổi đã diễn ra</Text>
                      <Text type="secondary"> · Khóa có {r.totalSessions} buổi</Text>
                      <Progress percent={Math.round((held / (r.totalSessions || 1)) * 100)} success={{ percent: Math.round((attended / (r.totalSessions || 1)) * 100) }} showInfo={false} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Màu xanh lá: buổi đã tham gia · Xanh dương: buổi đã diễn ra</Text>
                    </div>
                    {nextSessions.length > 0 && (
                      <div>
                        <Text strong>Buổi học sắp tới</Text>
                        {nextSessions.map(s => (
                          <div key={s.sessionDate}><Text type="secondary">{DAY_LABELS[s.dayOfWeek]} {dayjs(s.sessionDate).format('DD/MM')} {s.startTime ? `· ${s.startTime}–${s.endTime}` : ''}</Text></div>
                        ))}
                      </div>
                    )}
                    <Collapse ghost size="small" items={[{
                      key: 'history',
                      label: `Lịch sử điểm danh (${pastSessions.length} buổi)`,
                      children: pastSessions.length === 0 ? <Text type="secondary">Chưa có buổi nào được điểm danh.</Text> : (
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          {pastSessions.map(s => (
                            <Space key={s.sessionDate} style={{ justifyContent: 'space-between', width: '100%' }}>
                              <Text>{DAY_LABELS[s.dayOfWeek]} {dayjs(s.sessionDate).format('DD/MM/YYYY')}</Text>
                              <Tag color={SIMPLE_STATUS[s.status]?.color}>{SIMPLE_STATUS[s.status]?.text || s.status}</Tag>
                            </Space>
                          ))}
                        </Space>
                      )
                    }]} />
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Space>
    );
  }

  return (
    <div>
      <Card
        title={isTeacher ? 'Điểm danh lớp học trực tuyến' : 'Quản lý điểm danh lớp học'}
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSaveAttendance}
            style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}
          >
            Lưu Điểm Danh Buổi Học
          </Button>
        }
      >
        {isTeacher && (
          <Alert
            type="info"
            showIcon
            message="Chỉ các lớp LIVE_ONLINE được phân công cho bạn hiển thị tại đây."
            style={{ marginBottom: 16 }}
          />
        )}
        <Space style={{ marginBottom: 20 }} wrap>
          <Text strong>Chọn Lớp Học:</Text>
          <Select
            style={{ width: 300 }}
            value={selectedClassId}
            onChange={setSelectedClassId}
            placeholder="Chọn lớp"
            options={classes.map(c => ({
              label: `${c.classCode} - ${c.course?.name || ''} (${c.semester})`,
              value: c.id
            }))}
          />

          <Text strong style={{ marginLeft: 16 }}>Ngày buổi học:</Text>
          <DatePicker
            value={dayjs(sessionDate)}
            onChange={(d, str) => setSessionDate(str)}
            allowClear={false}
          />
        </Space>

        <Tabs
          defaultActiveKey="takeAttendance"
          items={[
            {
              key: 'takeAttendance',
              label: 'Điểm danh buổi học',
              children: (
                <Table
                  rowKey="studentId"
                  columns={attendanceColumns}
                  dataSource={students}
                  loading={loading}
                  pagination={false}
                />
              )
            },
            {
              key: 'summary',
              label: 'Tổng kết Chuyên cần cả kỳ (Cảnh báo Cấm thi >20%)',
              children: (
                <Table
                  rowKey="studentId"
                  columns={summaryColumns}
                  dataSource={summaryData}
                  loading={loadingSummary}
                  pagination={false}
                />
              )
            }
          ]}
        />
      </Card>
    </div>
  );
};

export default AttendancePage;
