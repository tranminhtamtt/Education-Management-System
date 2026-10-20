import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Typography,
  Row,
  Col,
  Statistic,
  Select,
  Space,
  Button,
  Modal,
  Upload,
  Alert,
  Descriptions,
  Empty,
  Tooltip,
  message
} from 'antd';
import {
  FileTextOutlined,
  DownloadOutlined,
  UploadOutlined,
  InboxOutlined,
  ReloadOutlined,
  EyeOutlined,
  PaperClipOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../api/client';
import { AssignmentStateTag, ASSIGNMENT_STATE, scoreText, PRIMARY } from './studentHelpers';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

const MAX_FILE_MB = 25;

/**
 * BF-STU-4 → BF-STU-7 (UC7.2 / UC7.4*):
 * Tải đề → Nộp bài (kiểm tra hạn: đúng hạn / nộp muộn) → Xem điểm & lời phê của giảng viên
 */
const StudentAssignmentsPage = () => {
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState({});
  const [classFilter, setClassFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');

  const [submitTarget, setSubmitTarget] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/students/my-assignments');
      if (res.success) {
        setAssignments(res.data.assignments);
        setStats(res.data.stats);
      }
    } catch (err) {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const classOptions = useMemo(() => {
    const map = new Map();
    assignments.forEach((a) => map.set(a.classId, `${a.classCode} - ${a.courseName}`));
    return [{ value: 'ALL', label: 'Tất cả lớp' }, ...[...map.entries()].map(([value, label]) => ({ value, label }))];
  }, [assignments]);

  const filtered = assignments.filter(
    (a) => (classFilter === 'ALL' || a.classId === classFilter) && (stateFilter === 'ALL' || a.state === stateFilter)
  );

  const openSubmit = (a) => {
    setFileList([]);
    setSubmitTarget(a);
  };

  const handleSubmit = async () => {
    if (fileList.length === 0) {
      message.warning('Vui lòng chọn file bài làm để nộp');
      return;
    }
    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('file', fileList[0].originFileObj || fileList[0]);
      const res = await apiClient.post(`/assignments/${submitTarget.id}/submissions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.success) {
        message.success(res.message || 'Nộp bài thành công');
        setSubmitTarget(null);
        setFileList([]);
        load();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi nộp bài');
    } finally {
      setSubmitting(false);
    }
  };

  const isPastDue = (a) => a && dayjs().isAfter(dayjs(a.dueDate));

  const dueCell = (a) => {
    const due = dayjs(a.dueDate);
    const diffH = due.diff(dayjs(), 'hour');
    let hint = null;
    if (!a.mySubmission) {
      if (diffH < 0) hint = <Text type="danger">Đã quá hạn</Text>;
      else if (diffH < 24) hint = <Text type="warning">Còn {diffH} giờ</Text>;
      else hint = <Text type="secondary">Còn {Math.floor(diffH / 24)} ngày</Text>;
    }
    return (
      <div>
        <div>{due.format('HH:mm DD/MM/YYYY')}</div>
        {hint && <div style={{ fontSize: 12 }}>{hint}</div>}
      </div>
    );
  };

  const columns = [
    {
      title: 'Bài tập',
      render: (_, a) => (
        <div>
          <Text strong>{a.title}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {a.classCode} • {a.courseName} • GV: {a.teacherName}
          </div>
        </div>
      )
    },
    {
      title: 'Đề bài',
      width: 110,
      align: 'center',
      render: (_, a) =>
        a.fileUrl ? (
          <Button size="small" icon={<DownloadOutlined />} href={a.fileUrl} target="_blank">
            Tải đề
          </Button>
        ) : (
          <Text type="secondary">-</Text>
        )
    },
    { title: 'Hạn nộp', width: 160, sorter: (x, y) => dayjs(x.dueDate) - dayjs(y.dueDate), render: (_, a) => dueCell(a) },
    { title: 'Trạng thái', width: 190, render: (_, a) => <AssignmentStateTag state={a.state} /> },
    {
      title: 'Điểm',
      width: 80,
      align: 'center',
      render: (_, a) =>
        a.mySubmission?.score !== null && a.mySubmission?.score !== undefined ? (
          <Text strong style={{ color: a.mySubmission.score >= 5 ? '#52c41a' : '#ff4d4f' }}>
            {scoreText(a.mySubmission.score)}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        )
    },
    {
      title: 'Thao tác',
      width: 200,
      render: (_, a) => (
        <Space>
          <Tooltip title="Xem chi tiết, bài đã nộp, điểm & lời phê">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(a)} />
          </Tooltip>
          {a.state !== 'GRADED' && (
            <Button
              size="small"
              type={a.mySubmission ? 'default' : 'primary'}
              danger={!a.mySubmission && a.state === 'MISSING'}
              icon={<UploadOutlined />}
              onClick={() => openSubmit(a)}
            >
              {a.mySubmission ? 'Nộp lại' : 'Nộp bài'}
            </Button>
          )}
        </Space>
      )
    }
  ];

  const statCards = [
    { key: 'PENDING', color: '#1677ff' },
    { key: 'MISSING', color: '#ff4d4f' },
    { key: 'SUBMITTED', color: '#52c41a' },
    { key: 'LATE_SUBMITTED', color: '#fa8c16' },
    { key: 'GRADED', color: '#d4b106' }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {statCards.map((s) => (
          <Col xs={12} sm={8} lg={{ flex: '20%' }} key={s.key}>
            <Card
              bordered={false}
              hoverable
              onClick={() => setStateFilter(stateFilter === s.key ? 'ALL' : s.key)}
              style={{ borderTop: `3px solid ${s.color}`, background: stateFilter === s.key ? '#fff7f0' : undefined }}
            >
              <Statistic title={ASSIGNMENT_STATE[s.key].label} value={stats[s.key] || 0} valueStyle={{ color: s.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {(stats.MISSING || 0) > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message={`Bạn có ${stats.MISSING} bài đã quá hạn nhưng chưa nộp`}
          description="Bạn vẫn có thể nộp bài, hệ thống sẽ ghi nhận trạng thái NỘP MUỘN để giảng viên xem xét."
        />
      )}

      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: PRIMARY }} />
            <span>Bài tập của tôi</span>
          </Space>
        }
        extra={
          <Space wrap>
            <Select style={{ width: 240 }} value={classFilter} onChange={setClassFilter} options={classOptions} />
            <Select
              style={{ width: 190 }}
              value={stateFilter}
              onChange={setStateFilter}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                ...Object.entries(ASSIGNMENT_STATE).map(([value, s]) => ({ value, label: s.label }))
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={load} />
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: 950 }}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="Không có bài tập nào" /> }}
        />
      </Card>

      {/* Modal nộp bài (BF-STU-5, BF-STU-6) */}
      <Modal
        title={submitTarget ? `Nộp bài: ${submitTarget.title}` : ''}
        open={!!submitTarget}
        onCancel={() => setSubmitTarget(null)}
        onOk={handleSubmit}
        okText={submitTarget?.mySubmission ? 'Nộp lại' : 'Nộp bài'}
        confirmLoading={submitting}
        destroyOnClose
      >
        {submitTarget && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Lớp">
                {submitTarget.classCode} - {submitTarget.courseName}
              </Descriptions.Item>
              <Descriptions.Item label="Hạn nộp">{dayjs(submitTarget.dueDate).format('HH:mm DD/MM/YYYY')}</Descriptions.Item>
            </Descriptions>
            {isPastDue(submitTarget) ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Đã quá hạn nộp"
                description="Bài nộp lúc này sẽ được đánh dấu NỘP MUỘN."
              />
            ) : (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Bài nộp trước hạn sẽ được ghi nhận ĐÚNG HẠN." />
            )}
            {submitTarget.mySubmission && (
              <Alert
                type="info"
                style={{ marginBottom: 12 }}
                message="Bạn đã nộp bài này trước đó. Nộp lại sẽ thay thế file cũ và cập nhật thời gian nộp."
              />
            )}
            <Dragger
              maxCount={1}
              fileList={fileList}
              beforeUpload={(file) => {
                if (file.size / 1024 / 1024 > MAX_FILE_MB) {
                  message.error(`File vượt quá ${MAX_FILE_MB}MB`);
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: PRIMARY }} />
              </p>
              <p className="ant-upload-text">Kéo thả hoặc bấm để chọn file bài làm</p>
              <p className="ant-upload-hint">Tối đa {MAX_FILE_MB}MB (PDF, DOCX, ZIP...)</p>
            </Dragger>
          </>
        )}
      </Modal>

      {/* Modal chi tiết (BF-STU-7) */}
      <Modal title={detail?.title} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Lớp / Môn">
                {detail.classCode} - {detail.courseName}
              </Descriptions.Item>
              <Descriptions.Item label="Giảng viên">{detail.teacherName}</Descriptions.Item>
              <Descriptions.Item label="Hạn nộp">{dayjs(detail.dueDate).format('HH:mm DD/MM/YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Mô tả">
                {detail.description ? <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{detail.description}</Paragraph> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="File đề">
                {detail.fileUrl ? (
                  <a href={detail.fileUrl} target="_blank" rel="noreferrer">
                    <DownloadOutlined /> Tải đề bài
                  </a>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <AssignmentStateTag state={detail.state} />
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Bài làm của tôi" style={{ marginTop: 16 }}>
              {detail.mySubmission ? (
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="File đã nộp">
                    <a href={detail.mySubmission.fileUrl} target="_blank" rel="noreferrer">
                      <PaperClipOutlined /> Xem bài đã nộp
                    </a>
                  </Descriptions.Item>
                  <Descriptions.Item label="Thời gian nộp">
                    {dayjs(detail.mySubmission.submittedAt).format('HH:mm DD/MM/YYYY')}{' '}
                    {detail.mySubmission.isLate ? <Text type="warning">(nộp muộn)</Text> : <Text type="success">(đúng hạn)</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="Điểm">
                    {detail.mySubmission.score !== null ? (
                      <Text strong style={{ fontSize: 18, color: detail.mySubmission.score >= 5 ? '#52c41a' : '#ff4d4f' }}>
                        {scoreText(detail.mySubmission.score)} / 10
                      </Text>
                    ) : (
                      <Text type="secondary">Giảng viên chưa chấm</Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Lời phê của GV">
                    {detail.mySubmission.teacherFeedback ? (
                      <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{detail.mySubmission.teacherFeedback}</Paragraph>
                    ) : (
                      <Text type="secondary">-</Text>
                    )}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa nộp bài này">
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    onClick={() => {
                      const a = detail;
                      setDetail(null);
                      openSubmit(a);
                    }}
                  >
                    Nộp bài ngay
                  </Button>
                </Empty>
              )}
            </Card>
          </>
        )}
      </Modal>
    </div>
  );
};

export default StudentAssignmentsPage;
