import React, { useState, useEffect } from 'react';
import { Card, Table, Select, DatePicker, Button, Radio, Tag, Progress, Typography, Space, message, Tabs, Alert, Input } from 'antd';
import { CheckSquareOutlined, SaveOutlined, WarningOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const AttendancePage = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';

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
    return (
      <Card title="Báo cáo Chuyên cần & Cảnh báo Vắng mặt (Quy chế 20% FAP)">
        <Alert
          message="Quy định Chuyên cần FAP: Sinh viên vắng từ 20% tổng số buổi của môn học sẽ bị KHÓA ĐIỀU KIỆN THI và nhận kết quả Không Đạt (NOT PASSED)."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />
        <Table
          rowKey="classId"
          dataSource={studentReport}
          loading={loading}
          pagination={false}
          columns={[
            { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Text strong>{c}</Text> },
            { title: 'Môn học', dataIndex: 'courseName' },
            { title: 'Tổng buổi', dataIndex: 'totalSessions', render: (s) => `${s} buổi` },
            { title: 'Có mặt', dataIndex: 'present', render: (p) => <Tag color="green">{p}</Tag> },
            { title: 'Nghỉ có phép', dataIndex: 'absentExcused', render: (ae) => <Tag color="purple">{ae}</Tag> },
            { title: 'Vắng không phép', dataIndex: 'absentUnexcused', render: (au) => <Tag color="red">{au}</Tag> },
            {
              title: 'Tỷ lệ vắng',
              render: (_, r) => (
                <div style={{ width: 140 }}>
                  <Progress
                    percent={r.absentRate}
                    strokeColor={r.isBanned ? '#ff4d4f' : r.absentRate > 10 ? '#fa8c16' : '#52c41a'}
                    size="small"
                    format={(p) => `${p}%`}
                  />
                </div>
              )
            },
            {
              title: 'Tình trạng',
              render: (_, r) => (
                r.isBanned
                  ? <Tag color="error">CẤM THI</Tag>
                  : r.absentRate > 10
                  ? <Tag color="warning">Cảnh báo vắng</Tag>
                  : <Tag color="success">An toàn</Tag>
              )
            }
          ]}
        />
      </Card>
    );
  }

  return (
    <div>
      <Card
        title="Quản lý Điểm danh Lớp học"
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
        <Space style={{ marginBottom: 20 }} wrap>
          <Text strong>Chọn Lớp Học:</Text>
          <Select
            style={{ width: 260 }}
            value={selectedClassId}
            onChange={setSelectedClassId}
            options={classes.map(c => ({
              label: `${c.classCode} - ${c.course.name}`,
              value: c.id
            }))}
          />

          <Text strong style={{ marginLeft: 16 }}>Ngày học:</Text>
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
