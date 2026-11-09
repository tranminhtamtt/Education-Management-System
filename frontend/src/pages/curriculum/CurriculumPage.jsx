import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Table,
  Tag,
  Progress,
  Statistic,
  Tabs,
  Space,
  Select,
  Button,
  Modal,
  Alert,
  Tooltip,
  Badge,
  Input,
  Descriptions,
  Empty
} from 'antd';
import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  CloseCircleOutlined,
  UserOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;

const PRIMARY_COLOR = '#F26F21';

// Cấu hình nhãn và màu trạng thái chuẩn FAP
const STATUS_CONFIG = {
  PASSED: {
    label: 'ĐÃ QUA MÔN',
    color: 'success',
    icon: <CheckCircleOutlined />,
    description: 'Đã hoàn thành và đạt điểm kết thúc học phần'
  },
  STUDYING: {
    label: 'ĐANG HỌC',
    color: 'processing',
    icon: <ClockCircleOutlined />,
    description: 'Đang theo học trong học kỳ hiện tại'
  },
  FAILED: {
    label: 'HỌC LẠI',
    color: 'error',
    icon: <CloseCircleOutlined />,
    description: 'Chưa đạt điểm hoặc bị cấm thi, cần học lại'
  },
  ELIGIBLE: {
    label: 'ĐỦ ĐIỀU KIỆN',
    color: 'warning',
    icon: <UnlockOutlined />,
    description: 'Đã thỏa mãn môn tiên quyết và không vượt kỳ hiện tại — có thể được xếp lớp'
  },
  LOCKED: {
    label: 'CHƯA ĐỦ ĐIỀU KIỆN',
    color: 'default',
    icon: <LockOutlined />,
    description: 'Chưa hoàn thành môn điều kiện tiên quyết'
  }
};

const CurriculumPage = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const isAcademicStaff = user?.role === 'ADMIN';
  const [termOverview, setTermOverview] = useState(null);
  const [overviewTerm, setOverviewTerm] = useState(null);

  // Giáo vụ: phân bố sinh viên theo kỳ khung chương trình
  const fetchTermOverview = () => {
    if (!isAcademicStaff) return;
    apiClient.get('/curriculum/term-overview')
      .then(res => { if (res.success) setTermOverview(res.data); })
      .catch(err => console.error('Lỗi tải phân bố theo kỳ:', err));
  };
  useEffect(fetchTermOverview, [isAcademicStaff]);

  const [loading, setLoading] = useState(false);
  const [curriculumData, setCurriculumData] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  // Dành cho Admin/Giáo vụ chọn học viên
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Modal chi tiết môn
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Tải danh sách học viên nếu là Admin
  useEffect(() => {
    if (!isStudent) {
      apiClient.get('/students', { params: { pageSize: 100 } })
        .then(res => {
          if (res.success && res.data.items) {
            setAllStudents(res.data.items);
            if (res.data.items.length > 0) {
              setSelectedStudentId(res.data.items[0].id);
            }
          }
        })
        .catch(err => console.error('Lỗi tải danh sách học viên:', err));
    }
  }, [isStudent]);

  // Tải dữ liệu tiến độ khung chương trình
  const fetchCurriculum = async () => {
    try {
      setLoading(true);
      let endpoint = '/curriculum';
      if (isStudent) {
        endpoint = '/curriculum/my-progress';
      } else if (selectedStudentId) {
        endpoint = `/curriculum/student/${selectedStudentId}`;
      }

      const res = await apiClient.get(endpoint);
      if (res.success) {
        setCurriculumData(res.data);
      }
    } catch (err) {
      console.error('Lỗi tải khung chương trình:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isStudent || selectedStudentId) {
      fetchCurriculum();
    }
  }, [isStudent, selectedStudentId]);

  // Danh sách môn sau khi lọc
  const allCourses = curriculumData?.allCourses || (curriculumData?.terms ? curriculumData.terms.flatMap(t => t.courses) : []);

  const filteredCourses = allCourses.filter(c => {
    const matchTerm = selectedTerm === 'ALL' || c.term === parseInt(selectedTerm);
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchSearch =
      !searchText ||
      c.courseCode.toLowerCase().includes(searchText.toLowerCase()) ||
      c.name.toLowerCase().includes(searchText.toLowerCase());
    return matchTerm && matchStatus && matchSearch;
  });

  // Thống kê nhanh
  const passedCount = allCourses.filter(c => c.status === 'PASSED').length;
  const studyingCount = allCourses.filter(c => c.status === 'STUDYING').length;
  const eligibleCount = allCourses.filter(c => c.status === 'ELIGIBLE').length;
  const lockedCount = allCourses.filter(c => c.status === 'LOCKED').length;

  const columns = [
    {
      title: 'Học kỳ',
      dataIndex: 'term',
      key: 'term',
      width: 90,
      align: 'center',
      render: (t) => <Tag color="orange" style={{ fontWeight: 600 }}>Kỳ {t}</Tag>
    },
    {
      title: 'Mã môn',
      dataIndex: 'courseCode',
      key: 'courseCode',
      width: 120,
      render: (code, record) => (
        <a
          style={{ fontWeight: 700, color: PRIMARY_COLOR }}
          onClick={() => {
            setSelectedCourse(record);
            setDetailModalOpen(true);
          }}
        >
          {code}
        </a>
      )
    },
    {
      title: 'Tên môn học',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <Text strong>{name}</Text>
          {record.details?.classCode && (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              Lớp: {record.details.classCode} ({record.details.semester})
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Số TC',
      dataIndex: 'credits',
      key: 'credits',
      width: 80,
      align: 'center',
      render: (cr) => <Text strong>{cr} TC</Text>
    },
    {
      title: 'Môn tiên quyết (Prerequisite)',
      dataIndex: 'prerequisites',
      key: 'prerequisites',
      width: 220,
      render: (prereqs = [], record) => {
        if (!prereqs || prereqs.length === 0) {
          return <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 12 }}>Không có</Text>;
        }
        return (
          <Space wrap size={[4, 4]}>
            {prereqs.map(p => {
              const isMissing = record.missingPrerequisites?.includes(p);
              return (
                <Tooltip
                  key={p}
                  title={isMissing ? `Chưa hoàn thành môn tiên quyết ${p}` : `Đã hoàn thành ${p}`}
                >
                  <Tag color={isMissing ? 'error' : 'success'} style={{ cursor: 'pointer' }}>
                    {isMissing ? `⚠️ ${p}` : `✓ ${p}`}
                  </Tag>
                </Tooltip>
              );
            })}
          </Space>
        );
      }
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const conf = STATUS_CONFIG[record.status] || STATUS_CONFIG.LOCKED;
        return (
          <Tooltip title={conf.description}>
            <Tag color={conf.color} icon={conf.icon} style={{ padding: '4px 8px', fontWeight: 600 }}>
              {conf.label}
              {record.details?.totalScore !== undefined && record.details.totalScore !== null && (
                <span style={{ marginLeft: 6, fontWeight: 700 }}>({record.details.totalScore})</span>
              )}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'Ghi chú / Điều kiện',
      key: 'action',
      width: 180,
      render: (_, record) => {
        if (record.status === 'PASSED') {
          return <Text type="success">✓ Đã đạt môn</Text>;
        }
        if (record.status === 'STUDYING') {
          return <Text style={{ color: '#1890ff' }}>Đang học kỳ này</Text>;
        }
        if (record.status === 'ELIGIBLE') {
          return <Text type="warning" strong>Đủ điều kiện xếp lớp</Text>;
        }
        if (record.status === 'FAILED') {
          return <Text type="danger" style={{ fontSize: 12 }}>Cần học lại{record.details?.isBanned ? ' (cấm thi)' : ''}</Text>;
        }
        if (record.status === 'LOCKED') {
          return (
            <Text type="danger" style={{ fontSize: 12 }}>
              {record.missingPrerequisites?.length ? `Thiếu: ${record.missingPrerequisites.join(', ')}` : `Chưa tới kỳ ${record.term}`}
            </Text>
          );
        }
        return null;
      }
    }
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Tiêu đề trang & Chọn học viên nếu là Giáo vụ */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space align="center" size="middle">
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: '#FFF2E8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <BookOutlined style={{ fontSize: 26, color: PRIMARY_COLOR }} />
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  Khung Chương Trình Đào Tạo (Curriculum)
                </Title>
                <Text type="secondary">
                  Chuyên ngành: <strong>Kỹ thuật phần mềm (Software Engineering - SE)</strong> • Theo chuẩn FAP FPT
                </Text>
              </div>
            </Space>
          </Col>

          {/* Nếu là Admin/Giáo vụ: Cho phép tra cứu tiến độ của từng học viên */}
          {!isStudent && (
            <Col xs={24} md={10} style={{ textAlign: 'right' }}>
              <Space wrap>
                <Text strong>Tra cứu học viên:</Text>
                <Select
                  showSearch
                  style={{ width: 260 }}
                  placeholder="Chọn học viên cần xem"
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={allStudents.map(s => ({
                    value: s.id,
                    label: `${s.code} - ${s.fullName}`
                  }))}
                />
                <Button icon={<ReloadOutlined />} onClick={fetchCurriculum} />
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      {/* Thẻ Tiến độ Học tập của Sinh viên */}
      {curriculumData?.student && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card bordered={false} style={{ height: '100%', borderTop: `3px solid ${PRIMARY_COLOR}` }}>
              <Statistic
                title="Học viên"
                value={curriculumData.student.fullName}
                prefix={<UserOutlined style={{ color: PRIMARY_COLOR }} />}
                valueStyle={{ fontSize: 18, fontWeight: 700 }}
              />
              <div style={{ marginTop: 8 }}>
                <Tag color="blue">{curriculumData.student.code}</Tag>
                <Tag color="purple">{curriculumData.student.cohort} ({curriculumData.student.enrollmentYear})</Tag>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card bordered={false} style={{ height: '100%', borderTop: '3px solid #52c41a' }}>
              <Statistic
                title="Học kỳ hiện tại (Tiến độ học vụ)"
                value={`Học kỳ ${curriculumData.currentTerm}`}
                valueStyle={{ color: '#52c41a', fontWeight: 700 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Kỳ sớm nhất còn môn chưa có kết quả • {curriculumData.accumulatedCredits} TC đã đạt
              </Text>
              {curriculumData.retakeCourses?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <Text type="danger" style={{ fontSize: 12 }}>Cần học lại: {curriculumData.retakeCourses.join(', ')}</Text>
                </div>
              )}
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card bordered={false} style={{ height: '100%', borderTop: '3px solid #1890ff' }}>
              <Statistic
                title="Tín chỉ tích lũy"
                value={curriculumData.accumulatedCredits || 0}
                suffix={`/ ${curriculumData.totalProgramCredits} TC`}
                valueStyle={{ color: '#1890ff', fontWeight: 700 }}
              />
              <Progress
                percent={curriculumData.completionRate || 0}
                strokeColor={PRIMARY_COLOR}
                size="small"
                status="active"
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card bordered={false} style={{ height: '100%', borderTop: '3px solid #fa8c16' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>Trạng thái môn học</div>
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Badge color="#52c41a" text={`Đã qua: ${passedCount}`} />
                </Col>
                <Col span={12}>
                  <Badge color="#1890ff" text={`Đang học: ${studyingCount}`} />
                </Col>
                <Col span={12}>
                  <Badge color="#faad14" text={`Đủ điều kiện: ${eligibleCount}`} />
                </Col>
                <Col span={12}>
                  <Badge color="#d9d9d9" text={`Chưa đủ ĐK: ${lockedCount}`} />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* Giáo vụ: phân bố sinh viên theo kỳ khung chương trình */}
      {isAcademicStaff && termOverview && (
        <Card
          title={<Space><span>Phân bố sinh viên theo kỳ khung chương trình</span><Tag color="orange">{termOverview.totalStudents} sinh viên</Tag></Space>}
          extra={<Button icon={<ReloadOutlined />} onClick={fetchTermOverview} />}
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[8, 8]}>
            {termOverview.terms.map(t => (
              <Col key={t.term} xs={8} sm={6} md={4} lg={3} xl={2} style={{ minWidth: 96 }}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => setOverviewTerm(overviewTerm === t.term ? null : t.term)}
                  style={{ textAlign: 'center', borderColor: overviewTerm === t.term ? PRIMARY_COLOR : undefined }}
                >
                  <Statistic title={`Kỳ ${t.term}`} value={t.studentCount} valueStyle={{ color: PRIMARY_COLOR, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
          </Row>
          {overviewTerm && (
            <Table
              style={{ marginTop: 12 }}
              size="small"
              rowKey="id"
              pagination={{ pageSize: 10 }}
              dataSource={termOverview.terms[overviewTerm - 1].students}
              onRow={r => ({ onClick: () => setSelectedStudentId(r.id), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Mã SV', dataIndex: 'code', render: v => <Text strong>{v}</Text> },
                { title: 'Họ tên', dataIndex: 'fullName' },
                { title: 'Khóa', dataIndex: 'cohort' },
                { title: 'TC đã đạt', dataIndex: 'passedCredits' },
                { title: 'Đang học', dataIndex: 'studying', render: v => (v?.length ? v.join(', ') : <Text type="secondary">Chưa xếp lớp</Text>) },
                { title: 'Học lại', dataIndex: 'retakeCourses', render: v => (v?.length ? <Text type="danger">{v.join(', ')}</Text> : '—') }
              ]}
            />
          )}
        </Card>
      )}

      {/* Hướng dẫn nghiệp vụ Điều kiện tiên quyết */}
      <Alert
        message="Quy tắc chia kỳ & điều kiện tiên quyết"
        description="Kỳ hiện tại của sinh viên là kỳ sớm nhất trong khung còn môn chưa có kết quả (chưa học hoặc đang học). Môn trượt/cấm thi không giữ sinh viên ở lại kỳ cũ mà được đánh dấu 'HỌC LẠI'. Sinh viên chỉ được xếp lớp môn thuộc kỳ ≤ kỳ hiện tại và đã ĐẠT toàn bộ môn tiên quyết; Giáo vụ có thể ghi danh đặc cách khi cần."
        type="info"
        showIcon
        closable
        style={{ marginBottom: 16 }}
      />

      {/* Bảng Danh sách môn học theo Khung chương trình */}
      <Card
        title={
          <Space wrap>
            <span>Danh sách môn học theo 9 Học kỳ</span>
            <Tag color="cyan">{filteredCourses.length} môn</Tag>
          </Space>
        }
        extra={
          <Space wrap>
            <Input
              placeholder="Tìm mã hoặc tên môn..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              style={{ width: 150 }}
              value={selectedTerm}
              onChange={setSelectedTerm}
              options={[
                { value: 'ALL', label: 'Tất cả các kỳ' },
                ...Array.from({ length: 9 }, (_, i) => ({
                  value: String(i + 1),
                  label: `Học kỳ ${i + 1} (Term ${i + 1})`
                }))
              ]}
            />
            <Select
              style={{ width: 170 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                { value: 'PASSED', label: '✓ Đã qua môn' },
                { value: 'STUDYING', label: '⏳ Đang học' },
                { value: 'ELIGIBLE', label: '⚡ Đủ điều kiện học' },
                { value: 'LOCKED', label: '🔒 Chưa đủ điều kiện' },
                { value: 'FAILED', label: '❌ Học lại' }
              ]}
            />
          </Space>
        }
      >
        <Table
          rowKey="courseCode"
          loading={loading}
          dataSource={filteredCourses}
          columns={columns}
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description="Không có môn học phù hợp bộ lọc" /> }}
        />
      </Card>

      {/* Modal Chi tiết môn học */}
      <Modal
        title={selectedCourse ? `Chi tiết môn học: ${selectedCourse.courseCode}` : ''}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalOpen(false)}>
            Đóng
          </Button>
        ]}
        width={600}
      >
        {selectedCourse && (
          <Descriptions bordered column={1} size="small" style={{ marginTop: 12 }}>
            <Descriptions.Item label="Mã môn học">
              <Text strong style={{ color: PRIMARY_COLOR }}>{selectedCourse.courseCode}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tên môn học">
              {selectedCourse.name}
            </Descriptions.Item>
            <Descriptions.Item label="Học kỳ chuẩn">
              Kỳ {selectedCourse.term}
            </Descriptions.Item>
            <Descriptions.Item label="Số tín chỉ">
              {selectedCourse.credits} tín chỉ
            </Descriptions.Item>
            <Descriptions.Item label="Môn tiên quyết (Prerequisites)">
              {selectedCourse.prerequisites && selectedCourse.prerequisites.length > 0 ? (
                <Space>
                  {selectedCourse.prerequisites.map(p => (
                    <Tag key={p} color="volcano">{p}</Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">Không có (Có thể học ngay từ đầu)</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái của học viên">
              {(() => {
                const conf = STATUS_CONFIG[selectedCourse.status] || STATUS_CONFIG.LOCKED;
                return (
                  <Tag color={conf.color} icon={conf.icon} style={{ fontWeight: 600 }}>
                    {conf.label}
                  </Tag>
                );
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="Mô tả tóm tắt">
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {selectedCourse.description || 'Chưa có mô tả cho môn học này.'}
              </Paragraph>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default CurriculumPage;

