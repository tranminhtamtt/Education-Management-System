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
      const res = await apiClient.get('/classes', { params: { status: 'ONGOING' } });
      if (res.success && res.data.length > 0) {
        setClasses(res.data);
        const firstClass = res.data[0];
        setSelectedClassId(firstClass.id);
        if (firstClass.schedules && firstClass.schedules.length > 0) {
          const firstDay = firstClass.schedules[0].dayOfWeek;
          setSessionDate(`2026-11-${String(2 + (firstDay - 2)).padStart(2, '0')}`);
        }
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
    const DAY_LABELS = {
      2: 'Thứ 2',
      3: 'Thứ 3',
      4: 'Thứ 4',
      5: 'Thứ 5',
      6: 'Thứ 6',
      7: 'Thứ 7',
      8: 'Chủ Nhật'
    };

    const STATUS_TAG = {
      PRESENT: <Tag color="success">Có mặt</Tag>,
      LATE: <Tag color="warning">Đi muộn</Tag>,
      ABSENT_EXCUSED: <Tag color="purple">Nghỉ có phép</Tag>,
      ABSENT_UNEXCUSED: <Tag color="error">Vắng không phép</Tag>,
      UPCOMING: <Tag color="default">Chưa học (Chưa đến ngày)</Tag>
    };

    return (
      <Card title="Báo cáo Chuyên cần Kỳ học 2 Tuần & Cảnh báo Vắng mặt (Quy chế 20% FAP)">
        <Alert
          message="Quy định Chuyên cần FAP (Kỳ học 2 tuần - 6 buổi/môn): Sinh viên vắng không phép từ 20% tổng số buổi (tương đương >= 2/6 buổi) sẽ bị CẤM THI (is_banned = true) và nhận kết quả Không Đạt (NOT PASSED). Nhấn vào dấu (+) từng môn để xem chi tiết lịch sử 6 buổi học trong 2 tuần."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />
        <Table
          rowKey="classId"
          dataSource={studentReport}
          loading={loading}
          pagination={false}
          expandable={{
            defaultExpandAllRows: true,
            expandedRowRender: (record) => (
              <Table
                rowKey="sessionNo"
                size="small"
                pagination={false}
                dataSource={record.sessions || []}
                columns={[
                  {
                    title: 'Buổi học',
                    dataIndex: 'sessionNo',
                    width: 90,
                    render: (n) => <Text strong>Buổi {n}</Text>
                  },
                  {
                    title: 'Tuần',
                    dataIndex: 'week',
                    width: 90,
                    render: (w) => <Tag color={w === 1 ? 'blue' : 'cyan'}>Tuần {w}</Tag>
                  },
                  {
                    title: 'Ngày học',
                    dataIndex: 'sessionDate',
                    render: (d, s) => `${DAY_LABELS[s.dayOfWeek] || ''} - ${dayjs(d).format('DD/MM/YYYY')}`
                  },
                  {
                    title: 'Ca học (Slot)',
                    dataIndex: 'shift',
                    render: (sh) => <Tag color="orange">Slot {sh}</Tag>
                  },
                  {
                    title: 'Phòng',
                    dataIndex: 'room',
                    render: (rm) => <Tag color="geekblue">{rm}</Tag>
                  },
                  {
                    title: 'Trạng thái điểm danh',
                    dataIndex: 'status',
                    render: (st) => STATUS_TAG[st] || <Tag>{st}</Tag>
                  },
                  {
                    title: 'Ghi chú của GV / Hệ thống',
                    dataIndex: 'note',
                    render: (nt) => nt || <Text type="secondary">-</Text>
                  }
                ]}
              />
            )
          }}
          columns={[
            { title: 'Lớp', dataIndex: 'classCode', render: (c) => <Text strong style={{ color: '#F26F21' }}>{c}</Text> },
            { title: 'Môn học', render: (_, r) => `${r.courseCode} - ${r.courseName}` },
            { title: 'Giảng viên', dataIndex: 'teacherName' },
            { title: 'Tiến độ học', render: (_, r) => <Tag color="blue">{r.recordedSessions}/{r.totalSessions} buổi</Tag> },
            { title: 'Có mặt', dataIndex: 'present', render: (p) => <Tag color="green">{p}</Tag> },
            { title: 'Đi muộn', dataIndex: 'late', render: (l) => <Tag color="orange">{l || 0}</Tag> },
            { title: 'Có phép', dataIndex: 'absentExcused', render: (ae) => <Tag color="purple">{ae}</Tag> },
            { title: 'Không phép', dataIndex: 'absentUnexcused', render: (au) => <Tag color="red">{au}</Tag> },
            {
              title: 'Điểm CC (10%)',
              dataIndex: 'attendanceScore',
              align: 'center',
              render: (sc) => <Text strong style={{ color: '#1890ff' }}>{sc ?? 10}/10</Text>
            },
            {
              title: 'Tỷ lệ vắng',
              render: (_, r) => (
                <div style={{ width: 130 }}>
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
              title: 'Tình trạng thi',
              render: (_, r) => (
                r.isBanned
                  ? <Tag color="error" icon={<WarningOutlined />}>CẤM THI (&gt;=20%)</Tag>
                  : r.absentRate > 10
                  ? <Tag color="warning">Cảnh báo vắng</Tag>
                  : <Tag color="success">Đủ ĐK thi</Tag>
              )
            }
          ]}
        />
      </Card>
    );
  }

  // Tính 6 ngày học trong 2 tuần của lớp đang chọn cho Giảng viên/Admin chọn nhanh
  const currentClassObj = classes.find(c => c.id === selectedClassId);
  const classSessionDates = [];
  if (currentClassObj?.schedules?.length > 0) {
    const days = [...new Set(currentClassObj.schedules.map(s => s.dayOfWeek))].sort((a, b) => a - b);
    days.forEach(d => {
      classSessionDates.push({ week: 1, date: `2026-11-${String(2 + (d - 2)).padStart(2, '0')}`, dayOfWeek: d });
    });
    days.forEach(d => {
      classSessionDates.push({ week: 2, date: `2026-11-${String(9 + (d - 2)).padStart(2, '0')}`, dayOfWeek: d });
    });
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
            style={{ width: 300 }}
            value={selectedClassId}
            onChange={(val) => {
              setSelectedClassId(val);
              const cls = classes.find(c => c.id === val);
              if (cls?.schedules?.length > 0) {
                const firstDay = cls.schedules[0].dayOfWeek;
                setSessionDate(`2026-11-${String(2 + (firstDay - 2)).padStart(2, '0')}`);
              }
            }}
            options={classes.map(c => ({
              label: `${c.classCode} - ${c.course.name} (${c.semester})`,
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

        {classSessionDates.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Space wrap size={[6, 6]}>
              <Text type="secondary" style={{ fontSize: 12 }}>Chọn nhanh buổi học (Kỳ 2 tuần):</Text>
              {classSessionDates.map((item, idx) => (
                <Button
                  key={item.date}
                  size="small"
                  type={sessionDate === item.date ? 'primary' : 'default'}
                  style={sessionDate === item.date ? { backgroundColor: '#F26F21', borderColor: '#F26F21' } : {}}
                  onClick={() => setSessionDate(item.date)}
                >
                  Buổi {idx + 1} - T{item.week} ({dayjs(item.date).format('DD/MM')})
                </Button>
              ))}
            </Space>
          </div>
        )}

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
