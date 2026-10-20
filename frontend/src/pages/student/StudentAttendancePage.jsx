import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Progress, Typography, Alert, Row, Col, Statistic, Empty, Button, Space } from 'antd';
import { CheckSquareOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { AttendanceTag, AttendanceWarningTag, warningColor } from './studentHelpers';

const { Text } = Typography;

/**
 * BF-STU-2 / UC6.3* & UC6.2: Lịch sử điểm danh cá nhân, tỷ lệ chuyên cần & cảnh báo vắng (DF26)
 */
const StudentAttendancePage = () => {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [threshold, setThreshold] = useState(20);

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students/my-attendances');
      if (res.success) {
        setClasses(res.data.classes);
        setThreshold(res.data.banThreshold);
      }
    } catch (err) {
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalRecorded = classes.reduce((s, c) => s + c.recordedSessions, 0);
  const totalAttended = classes.reduce((s, c) => s + c.present + c.late, 0);
  const overallRate = totalRecorded > 0 ? Math.round((totalAttended / totalRecorded) * 1000) / 10 : 100;
  const warned = classes.filter((c) => c.warningLevel !== 'SAFE');

  const columns = [
    {
      title: 'Lớp / Môn học',
      render: (_, r) => (
        <div>
          <Text strong>{r.courseName}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {r.classCode} • {r.semester} • GV: {r.teacherName}
          </div>
        </div>
      )
    },
    {
      title: 'Đã điểm danh',
      align: 'center',
      render: (_, r) => `${r.recordedSessions}/${r.totalSessions} buổi`
    },
    { title: 'Có mặt', dataIndex: 'present', align: 'center', render: (v) => <Tag color="success">{v}</Tag> },
    { title: 'Muộn', dataIndex: 'late', align: 'center', render: (v) => <Tag color="warning">{v}</Tag> },
    { title: 'Có phép', dataIndex: 'absentExcused', align: 'center', render: (v) => <Tag color="purple">{v}</Tag> },
    { title: 'Không phép', dataIndex: 'absentUnexcused', align: 'center', render: (v) => <Tag color="error">{v}</Tag> },
    {
      title: `Tỷ lệ vắng (ngưỡng ${threshold}%)`,
      width: 190,
      render: (_, r) => (
        <Progress
          percent={Math.min(100, (r.absentRate / threshold) * 100)}
          strokeColor={warningColor(r.warningLevel)}
          size="small"
          format={() => `${r.absentRate}%`}
        />
      )
    },
    { title: 'Tình trạng', render: (_, r) => <AttendanceWarningTag level={r.warningLevel} /> }
  ];

  const sessionColumns = [
    { title: 'Ngày học', dataIndex: 'sessionDate', render: (d) => dayjs(d).format('dddd, DD/MM/YYYY') },
    { title: 'Trạng thái', dataIndex: 'status', render: (s) => <AttendanceTag status={s} /> },
    { title: 'Ghi chú của giảng viên', dataIndex: 'note', render: (n) => n || <Text type="secondary">-</Text> }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false}>
            <Statistic title="Tỷ lệ chuyên cần chung" value={overallRate} suffix="%" valueStyle={{ color: overallRate >= 80 ? '#52c41a' : '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false}>
            <Statistic title="Tổng buổi đã điểm danh" value={totalRecorded} suffix="buổi" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false}>
            <Statistic
              title="Môn bị cảnh báo"
              value={warned.length}
              valueStyle={{ color: warned.length > 0 ? '#ff4d4f' : '#52c41a' }}
              suffix={`/ ${classes.length} môn`}
            />
          </Card>
        </Col>
      </Row>

      {warned.length > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type={warned.some((w) => w.isBanned) ? 'error' : 'warning'}
          showIcon
          message={`Bạn có ${warned.length} môn vượt ngưỡng cảnh báo chuyên cần`}
          description={`Vắng không phép từ ${threshold}% tổng số buổi của môn sẽ bị CẤM THI và nhận kết quả Học lại. Liên hệ giảng viên hoặc gửi đơn xin phép nếu có lý do chính đáng.`}
        />
      )}

      <Card
        title={
          <Space>
            <CheckSquareOutlined style={{ color: '#F26F21' }} />
            <span>Chuyên cần theo môn học</span>
          </Space>
        }
        extra={<Button icon={<ReloadOutlined />} onClick={load} />}
      >
        <Table
          rowKey="classId"
          dataSource={classes}
          loading={loading}
          columns={columns}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="Bạn chưa được ghi danh vào lớp nào" /> }}
          expandable={{
            expandedRowRender: (r) =>
              r.sessions.length === 0 ? (
                <Text type="secondary">Giảng viên chưa điểm danh buổi nào của lớp này.</Text>
              ) : (
                <Table rowKey="id" size="small" columns={sessionColumns} dataSource={r.sessions} pagination={false} />
              ),
            rowExpandable: () => true
          }}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Bấm dấu “+” ở mỗi môn để xem lịch sử điểm danh từng buổi.
        </Text>
      </Card>
    </div>
  );
};

export default StudentAttendancePage;
