import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, Form, Input, List, Modal, Pagination, Progress, Row, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { BookOutlined, PlayCircleOutlined, ShoppingCartOutlined, CheckCircleOutlined, CommentOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;
const money = amount => `${Number(amount || 0).toLocaleString('vi-VN')} đ`;
const errorMessage = error => message.error(error.response?.data?.message || 'Không thể tải dữ liệu. Vui lòng thử lại.');
const categories = [{ value: 'FPT_SUBJECT', label: 'Môn chuyên ngành FPT' }, { value: 'CERTIFICATE', label: 'Chứng chỉ' }];
const modes = [{ value: 'RECORDED', label: 'Video quay sẵn' }, { value: 'LIVE_ONLINE', label: 'Lớp Live Online' }];
const modeName = value => modes.find(m => m.value === value)?.label || 'Lớp Live Online';
function useData(path) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false); setData(null);
    api.get(path).then(res => { if (alive) setData(res.data); }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [path, revision]);
  return { data, loading, error, reload: () => setRevision(r => r + 1) };
}
const LoadError = ({ reload }) => <Alert type="error" showIcon message="Không thể tải dữ liệu" action={<Button onClick={reload}>Thử lại</Button>} />;
const CourseTags = ({ course }) => <Space wrap><Tag color="orange">{modeName(course.deliveryMode)}</Tag><Tag color="blue">{course.category === 'CERTIFICATE' ? 'Chứng chỉ' : 'Môn FPT'}</Tag></Space>;
const safeUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value, window.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};

export function CatalogPage() {
  // Khám phá theo Môn / Chứng chỉ: hiển thị gọn, bấm vào mới xem các khóa học của môn đó.
  const navigate = useNavigate();
  const fpt = useData('/subjects?category=FPT_SUBJECT');
  const certs = useData('/subjects?category=CERTIFICATE');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('FPT_SUBJECT');
  const [page, setPage] = useState(1);
  const [courseId, setCourseId] = useState(null);
  const unclassified = useData(`/courses/catalog?unclassified=true&page=${page}&search=${encodeURIComponent(search.trim())}`);
  const keyword = search.trim().toLowerCase();
  const match = s => !keyword || s.code.toLowerCase().includes(keyword) || s.name.toLowerCase().includes(keyword);
  const fptList = (fpt.data || []).filter(match);
  const certList = (certs.data || []).filter(match);
  const terms = [...new Set(fptList.map(s => s.term))].sort((a, b) => a - b);
  const open = subject => navigate(`/catalog/subjects/${subject.id}`);
  const grid = list => <Row gutter={[12, 12]}>{list.map(s => <Col xs={24} sm={12} lg={8} xxl={6} key={s.id} className="equal-height-col"><SubjectCard subject={s} onClick={() => open(s)} /></Col>)}</Row>;

  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <div><Title level={3} style={{ marginBottom: 4 }}>Khám phá khóa học</Title><Text type="secondary">Chọn môn học hoặc chứng chỉ để xem các khóa học: video quay sẵn hoặc lớp học online cùng giảng viên.</Text></div>
    <Input.Search placeholder="Tìm theo mã hoặc tên khóa học" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} allowClear style={{ maxWidth: 460 }} />
    <Tabs activeKey={tab} onChange={setTab} items={[
      {
        key: 'FPT_SUBJECT',
        label: `🎓 Môn chuyên ngành FPT (${fptList.length})`,
        children: fpt.error ? <LoadError reload={fpt.reload} /> : <Spin spinning={fpt.loading}>
          {!fpt.loading && !fptList.length ? <Empty description="Không tìm thấy môn phù hợp" /> :
            <Collapse defaultActiveKey={keyword ? terms.map(String) : terms.slice(0, 2).map(String)} key={keyword || 'all'} items={terms.map(term => {
              const list = fptList.filter(s => s.term === term);
              return { key: String(term), label: <Space><Text strong>Kỳ {term}</Text><Text type="secondary">{list.length} môn · {list.reduce((n, s) => n + s.courseCount, 0)} khóa học</Text></Space>, children: grid(list) };
            })} />}
        </Spin>
      },
      {
        key: 'CERTIFICATE',
        label: `🏅 Chứng chỉ quốc tế (${certList.length})`,
        children: certs.error ? <LoadError reload={certs.reload} /> : <Spin spinning={certs.loading}>
          {!certs.loading && !certList.length ? <Empty description="Không tìm thấy chứng chỉ phù hợp" /> : grid(certList)}
        </Spin>
      },
      {
        key: 'UNCLASSIFIED',
        label: 'Khóa học khác',
        children: unclassified.error ? <LoadError reload={unclassified.reload} /> : <Spin spinning={unclassified.loading}>
          <List grid={{ gutter: 12, xs: 1, md: 2, xl: 3 }} dataSource={unclassified.data?.items || []} rowKey="id"
            locale={{ emptyText: 'Không tìm thấy khóa học' }}
            renderItem={item => <List.Item><Card size="small" title={item.name}>
              <Space direction="vertical">
                <CourseTags course={item} />
                <Text strong>{money(item.baseTuitionFee)}</Text>
                <Button type="primary" onClick={() => setCourseId(item.id)}>Xem chi tiết</Button>
              </Space>
            </Card></List.Item>} />
          <Pagination current={page} pageSize={unclassified.data?.pageSize || 12} total={unclassified.data?.total || 0}
            onChange={setPage} showSizeChanger={false} hideOnSinglePage />
        </Spin>
      }
    ]} />
    <CourseDetailModal courseId={courseId} onClose={() => setCourseId(null)} />
  </Space>;
}

function SubjectCard({ subject, onClick }) {
  // Bố cục cố định 3 tầng (mã môn · tên 2 dòng · hình thức & giá) để các thẻ cùng hàng thẳng nhau.
  return <Card hoverable size="small" onClick={onClick} styles={{ body: { padding: 14, gap: 8 } }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Tag color={subject.category === 'CERTIFICATE' ? 'purple' : 'orange'} style={{ marginRight: 0, fontWeight: 600 }}>{subject.code}</Tag>
      {subject.term && <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Kỳ {subject.term}</Text>}
    </div>
    <Text strong className="clamp-2" title={subject.name} style={{ minHeight: 44, lineHeight: '22px' }}>{subject.name}</Text>
    <div style={{ marginTop: 'auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {subject.modes.includes('RECORDED') && <Tag color="geekblue" style={{ marginRight: 0 }}>🎥 Video</Tag>}
        {subject.modes.includes('LIVE_ONLINE') && <Tag color="green" style={{ marginRight: 0 }}>👨‍🏫 Live</Tag>}
      </div>
      <Text type="secondary" style={{ fontSize: 13 }}>{subject.courseCount ? <>{subject.courseCount} khóa học · từ <Text strong style={{ color: '#F26F21' }}>{money(subject.minPrice)}</Text></> : 'Sắp mở khóa học'}</Text>
    </div>
  </Card>;
}

export function SubjectDetailPage() {
  const { subjectId } = useParams();
  const { data, loading, error, reload } = useData(`/subjects/${subjectId}`);
  const [courseId, setCourseId] = useState(null);
  if (loading) return <Spin />;
  if (error) return <LoadError reload={reload} />;
  if (!data) return null;
  const recorded = data.courses.filter(c => c.deliveryMode === 'RECORDED');
  const live = data.courses.filter(c => c.deliveryMode === 'LIVE_ONLINE');
  const section = (title, hint, list) => <Card title={title} extra={<Text type="secondary" style={{ fontSize: 13 }}>{hint}</Text>}>
    {!list.length ? <Empty description="Chưa có khóa học hình thức này" /> : <Row gutter={[16, 16]}>{list.map(c => <Col xs={24} md={12} key={c.id} className="equal-height-col">
      <Card size="small" styles={{ body: { gap: 8 } }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <Text strong style={{ flex: '1 1 200px' }}>{c.name}</Text>
          {c.isOwned && <Tag color="success" style={{ marginRight: 0 }}>Đã đăng ký</Tag>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <Tag style={{ marginRight: 0 }}>{LEVELS[c.level] || 'Cơ bản'}</Tag>
          <Tag color="blue" style={{ marginRight: 0 }}>{c.deliveryMode === 'RECORDED' ? `${c.lessonCount} bài · ${c.totalMinutes} phút` : `${c.totalSessions} buổi · ${c.openClassCount} lớp đang mở`}</Tag>
        </div>
        <Text type="secondary">Giảng viên: {c.teachers?.length ? c.teachers.map(t => t.fullName).join(' · ') : (c.instructor?.fullName || 'Giảng viên trung tâm')}</Text>
        <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text strong style={{ fontSize: 18, color: '#F26F21' }}>{money(c.baseTuitionFee)}</Text>
          {c.isOwned ? <Link to="/my-courses"><Button>Vào khóa học</Button></Link> : <Button type="primary" onClick={() => setCourseId(c.id)}>Xem chi tiết</Button>}
        </div>
      </Card>
    </Col>)}</Row>}
  </Card>;
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Link to="/catalog">← Khám phá khóa học</Link>
    <div>
      <Space wrap><Tag color={data.category === 'CERTIFICATE' ? 'purple' : 'orange'}>{data.code}</Tag>{data.term && <Tag>Kỳ {data.term} khung FPT</Tag>}{data.credits && <Tag>{data.credits} tín chỉ</Tag>}</Space>
      <Title level={3} style={{ margin: '8px 0 4px' }}>{data.name}</Title>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>{data.description}</Paragraph>
    </div>
    {section('🎥 Khóa video quay sẵn', 'Mua xong học ngay, tự theo dõi tiến độ', recorded)}
    {section('👨‍🏫 Khóa học cùng giảng viên (Live online)', 'Học theo lịch qua Google Meet, hỏi đáp trực tiếp', live)}
    <CourseDetailModal courseId={courseId} onClose={() => setCourseId(null)} />
  </Space>;
}

const LEVELS = { BEGINNER: 'Cơ bản', INTERMEDIATE: 'Trung cấp', ADVANCED: 'Nâng cao' };

function CourseDetailModal({ courseId, onClose }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null), [detailError, setDetailError] = useState(false), [classId, setClassId] = useState(null), [buying, setBuying] = useState(false);
  useEffect(() => {
    let alive = true;
    setDetail(null); setClassId(null); setDetailError(false);
    if (courseId) api.get(`/courses/catalog/${courseId}`).then(res => { if (alive) setDetail(res.data); }).catch(() => { if (alive) setDetailError(true); });
    return () => { alive = false; };
  }, [courseId]);
  const purchase = async () => {
    setBuying(true);
    try {
      const res = await api.post(`/courses/${detail.id}/purchase`, { classId });
      message.success(res.message);
      const { enrollment, invoice } = res.data;
      if (invoice && invoice.amount > invoice.paidAmount) {
        navigate('/tuition', { state: { invoiceId: invoice.id } });
      } else if (enrollment.status === 'ACTIVE') {
        navigate(`/my-courses/${enrollment.id}`);
      } else {
        navigate('/tuition');
      }
    } catch (error) { errorMessage(error); } finally { setBuying(false); }
  };
  return <Modal open={!!courseId} onCancel={() => !buying && onClose()} width={820} title={detail?.name || 'Chi tiết khóa học'} footer={null}>
      {detailError ? <Alert type="error" message="Không thể tải chi tiết. Đóng cửa sổ và thử lại." /> : !detail ? <Spin /> : <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <CourseTags course={detail} /><Paragraph>{detail.description}</Paragraph>
        <Text>Giảng viên: {detail.instructor?.fullName || detail.classes[0]?.teacher?.fullName || 'Chưa phân công'}</Text>
        {safeUrl(detail.syllabusUrl) && <a href={safeUrl(detail.syllabusUrl)} target="_blank" rel="noreferrer">Xem đề cương khóa học</a>}
        {detail.deliveryMode === 'RECORDED' && <List header="Nội dung bài học" bordered dataSource={detail.lessons} locale={{ emptyText: 'Trung tâm chưa công bố danh sách bài giảng.' }} renderItem={lesson => <List.Item><Space direction="vertical"><Text>{lesson.orderIndex}. {lesson.title} {lesson.isPreview && <Tag color="green">Học thử</Tag>}</Text><Text type="secondary">{lesson.sectionTitle} · {lesson.durationMinutes} phút</Text>{lesson.isPreview && <VideoPlayer url={lesson.videoUrl} />}</Space></List.Item>} />}
        {detail.deliveryMode === 'LIVE_ONLINE' && <><Text strong>Chọn lớp Live</Text><Select value={classId} onChange={setClassId} placeholder="Chọn lịch học phù hợp" style={{ width: '100%' }} notFoundContent="Hiện chưa có lớp mở đăng ký" options={detail.classes.map(c => ({ value: c.id, disabled: !c.remainingSeats, label: `${c.classCode} · ${c.status === 'UPCOMING' ? 'Sắp khai giảng' : 'Đang học'} · ${c.teacher?.fullName || 'Chưa phân công'} · Còn ${c.remainingSeats} chỗ` }))} />
          {detail.classes.filter(c => c.id === classId).map(c => <List key={c.id} size="small" dataSource={c.schedules} locale={{ emptyText: 'Lớp chưa công bố lịch học' }} renderItem={s => <List.Item>{s.dayOfWeek === 8 ? 'Chủ nhật' : `Thứ ${s.dayOfWeek}`} · {s.startTime}–{s.endTime}</List.Item>} />)}</>}
        <Alert type="info" showIcon message="Thanh toán qua VietQR" description="Khóa học được mở khi hệ thống xác nhận đã nhận đủ học phí. Khóa miễn phí được mở ngay sau đăng ký." />
        <Space wrap><Text strong style={{ fontSize: 22 }}>{money(detail.baseTuitionFee)}</Text><Button type="primary" icon={<ShoppingCartOutlined />} loading={buying} disabled={detail.deliveryMode === 'LIVE_ONLINE' && !classId} onClick={purchase}>Mua khóa học</Button></Space>
      </Space>}
    </Modal>;
}

const DAY_SHORT = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };
// Tóm tắt lịch học của một lớp, giải thích vì sao khóa có / không có trong thời khóa biểu.
export function scheduleSummary(e) {
  const course = e.class.course;
  if (course.deliveryMode === 'RECORDED') return { color: 'geekblue', text: 'Tự học qua video – không có lịch cố định' };
  if (e.status === 'PENDING_PAYMENT') return { color: 'gold', text: 'Lịch học hiện trong Thời khóa biểu sau khi thanh toán' };
  const s = e.class.schedules || [];
  const when = s.length ? `${[...new Set(s.map(x => DAY_SHORT[x.dayOfWeek]))].join('-')} · ${s[0].startTime}–${s[0].endTime}` : 'Chưa công bố lịch';
  if (e.class.status === 'UPCOMING') return { color: 'purple', text: `Sắp khai giảng · ${when}` };
  if (e.class.status === 'COMPLETED') return { color: 'default', text: 'Lớp đã kết thúc' };
  return { color: 'green', text: `Lịch Live: ${when}` };
}

export function MyLearningPage() {
  const { data, loading, error, reload } = useData('/my-courses');
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><Title level={3} style={{ marginBottom: 0 }}>Khóa học của tôi</Title>
    {error ? <LoadError reload={reload} /> : <Spin spinning={loading}><Row gutter={[16, 16]}>{(data || []).map(e => {
      const sum = scheduleSummary(e);
      return <Col xs={24} md={12} xl={8} key={e.id} className="equal-height-col"><Card styles={{ body: { gap: 10 } }}>
        <Text strong className="clamp-2" style={{ fontSize: 16, minHeight: 44 }}>{e.class.course.name}</Text>
        <CourseTags course={e.class.course} />
        <Text type="secondary">{e.class.course.deliveryMode === 'RECORDED' ? 'Khóa video' : e.class.classCode} · {e.class.teacher?.fullName || 'Giảng viên trung tâm'}</Text>
        <Tag color={sum.color} style={{ marginRight: 0, alignSelf: 'flex-start' }}>{sum.text}</Tag>
        <div style={{ marginTop: 'auto' }}>
          {e.status === 'PENDING_PAYMENT' ? <>
            <Paragraph style={{ marginBottom: 8 }}>Còn thiếu: <Text strong style={{ color: '#F26F21' }}>{money(Math.max(0, (e.tuitionInvoice?.amount || 0) - (e.tuitionInvoice?.paidAmount || 0)))}</Text></Paragraph>
            <Link to="/tuition" state={{ invoiceId: e.tuitionInvoice?.id }}><Button type="primary" block>Thanh toán VietQR</Button></Link>
          </> : <>
            {e.class.course.deliveryMode === 'RECORDED' && <Progress percent={e.progressPercent || 0} />}
            <Link to={`/my-courses/${e.id}`}><Button type="primary" icon={<PlayCircleOutlined />} block style={{ marginTop: 8 }}>Vào học</Button></Link>
          </>}
        </div>
      </Card></Col>;
    })}</Row>{!loading && !data?.length && <Empty description="Bạn chưa đăng ký khóa học nào"><Link to="/catalog"><Button type="primary">Khám phá khóa học</Button></Link></Empty>}</Spin>}
  </Space>;
}

function VideoPlayer({ url }) {
  const safe = safeUrl(url);
  if (!url || !safe) return <Alert type="info" message="Chưa có video bài giảng. Vui lòng xem tài liệu hoặc liên hệ giảng viên." />;
  const parsed = new URL(safe);
  const youtube = ['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(parsed.hostname);
  const videoId = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
  if (youtube && /^[\w-]{11}$/.test(videoId || '')) return <iframe title="Video bài giảng" src={`https://www.youtube-nocookie.com/embed/${videoId}`} style={{ width: '100%', aspectRatio: '16/9', border: 0 }} allow="fullscreen; picture-in-picture" allowFullScreen />;
  if (/\.(mp4|webm|ogg)$/i.test(parsed.pathname)) return <video key={safe} src={safe} controls style={{ width: '100%', maxHeight: 520 }} />;
  return <Button href={safe} target="_blank" rel="noreferrer" icon={<PlayCircleOutlined />}>Mở video bài giảng</Button>;
}

export function CoursePlayerPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useData(`/my-courses/${id}`);
  const [lessonId, setLessonId] = useState(null), [saving, setSaving] = useState(false);
  useEffect(() => setLessonId(null), [id]);
  if (loading) return <Spin />;
  if (error) return <LoadError reload={reload} />;
  if (!data) return null;
  const course = data.class.course, lesson = data.lessons.find(l => l.id === lessonId) || data.lessons[0];
  const complete = async () => {
    setSaving(true);
    try { await api.post(`/lessons/${lesson.id}/complete`, { enrollmentId: data.id }); message.success('Đã hoàn thành bài học'); reload(); } catch (error) { errorMessage(error); } finally { setSaving(false); }
  };
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Link to="/my-courses">← Khóa học của tôi</Link><div><Title level={3}>{course.name}</Title><CourseTags course={course} /></div>
    {course.deliveryMode === 'RECORDED' ? <><Progress percent={data.progressPercent || 0} /><Row gutter={[20, 20]}><Col xs={24} lg={16}><Card title={lesson?.title || 'Bài giảng'}>
      {lesson ? <Space direction="vertical" style={{ width: '100%' }} size="middle"><VideoPlayer url={lesson.videoUrl} />{safeUrl(lesson.materialUrl) && <Button href={safeUrl(lesson.materialUrl)} target="_blank" rel="noreferrer">Tải tài liệu / mã nguồn</Button>}
        <Button type="primary" icon={<CheckCircleOutlined />} disabled={lesson.isCompleted} loading={saving} onClick={complete}>{lesson.isCompleted ? 'Đã hoàn thành' : 'Hoàn thành bài học'}</Button></Space> : <Empty description="Giảng viên chưa công bố bài giảng" />}
    </Card></Col><Col xs={24} lg={8}><Card title="Nội dung khóa học"><List dataSource={data.lessons} renderItem={item => <List.Item><Button type={lesson?.id === item.id ? 'primary' : 'text'} style={{ whiteSpace: 'normal', height: 'auto', textAlign: 'left' }} onClick={() => setLessonId(item.id)}>{item.isCompleted ? '✓ ' : ''}{item.orderIndex}. {item.title}</Button></List.Item>} /></Card></Col></Row></> : <Card title={`Lớp ${data.class.classCode}`}>
      <Paragraph>Giảng viên: {data.class.teacher?.fullName || 'Chưa phân công'}</Paragraph>
      {safeUrl(data.class.meetUrl) && data.class.status === 'ONGOING' ? <Button type="primary" href={safeUrl(data.class.meetUrl)} target="_blank" rel="noreferrer">Vào phòng học Online</Button> : <Alert type="info" message={data.class.status === 'COMPLETED' ? 'Lớp đã kết thúc' : 'Phòng học sẽ được mở khi lớp bắt đầu và giảng viên cung cấp đường dẫn.'} />}
      <List dataSource={data.class.schedules} renderItem={s => <List.Item>{s.dayOfWeek === 8 ? 'Chủ nhật' : `Thứ ${s.dayOfWeek}`} · {s.startTime}–{s.endTime}</List.Item>} />
      <Link to="/schedule">Xem thời khóa biểu</Link>
    </Card>}
    <Card title="Bài tập & trao đổi với giảng viên"><Space wrap><Link to="/assignments"><Button>Bài tập & nộp bài</Button></Link><Link to={`/questions?classId=${data.classId}`}><Button icon={<CommentOutlined />}>Hỏi giảng viên {data.class.teacher?.fullName || ''}</Button></Link></Space></Card>
  </Space>;
}

export function QuestionsPage() {
  const { user } = useAuth();
  const student = user?.role === 'STUDENT';
  const teacherRole = user?.role === 'TEACHER';
  const { data, loading, error, reload } = useData('/questions');
  // Học viên chỉ được hỏi giảng viên đang dạy khóa mình đã mở khóa.
  const teachers = useData(student ? '/questions/my-teachers' : '/classes');
  const [open, setOpen] = useState(false), [answering, setAnswering] = useState(null), [saving, setSaving] = useState(false);
  const [form] = Form.useForm(), [answerForm] = Form.useForm();
  const selectedClassId = Form.useWatch('classId', form);
  const target = student ? (teachers.data || []).find(t => t.classId === selectedClassId) : null;
  const classId = Number(new URLSearchParams(window.location.search).get('classId')) || undefined;
  const submit = async values => {
    setSaving(true);
    try {
      if (answering) await api.patch(`/questions/${answering.id}/answer`, values);
      else await api.post('/questions', values);
      message.success(answering ? 'Đã gửi câu trả lời' : 'Đã gửi câu hỏi'); setOpen(false); setAnswering(null); form.resetFields(); answerForm.resetFields(); reload();
    } catch (error) { errorMessage(error); } finally { setSaving(false); }
  };
  const canAsk = student && (teachers.data || []).length > 0;
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><Space wrap><Title level={3} style={{ margin: 0 }}>{student ? 'Hỏi đáp với giảng viên' : 'Hỏi đáp khóa học'}</Title>{student && <Button type="primary" disabled={!canAsk} onClick={() => { form.resetFields(); form.setFieldsValue({ classId: (teachers.data || []).some(t => t.classId === classId) ? classId : undefined }); setOpen(true); }}>Đặt câu hỏi</Button>}</Space>
    {student && !teachers.loading && !canAsk && <Alert type="info" showIcon message="Bạn chỉ có thể hỏi giảng viên của khóa học đã mở khóa." description="Hãy mua và thanh toán một khóa học để trao đổi với giảng viên phụ trách." />}
    {error ? <LoadError reload={reload} /> : <Card loading={loading}><List dataSource={data || []} locale={{ emptyText: 'Chưa có câu hỏi nào' }} renderItem={q => <List.Item actions={teacherRole ? [<Button key="answer" onClick={() => { setAnswering(q); answerForm.setFieldsValue({ teacherAnswer: q.teacherAnswer || '' }); }}>Trả lời</Button>] : []}>
      <Space direction="vertical" style={{ width: '100%' }}><Space wrap><Text strong>{q.questionTitle}</Text><Tag color={q.status === 'PENDING' ? 'gold' : 'green'}>{q.status === 'PENDING' ? 'Chờ trả lời' : 'Đã trả lời'}</Tag></Space>
        <Text type="secondary">{q.class?.course?.name || q.class?.classCode}{student ? ` · Gửi tới: ${q.teacher?.fullName || 'Giảng viên phụ trách'}` : ` · ${q.student?.fullName}`} · {dayjs(q.createdAt).format('DD/MM/YYYY HH:mm')}</Text><Paragraph style={{ whiteSpace: 'pre-wrap' }}>{q.questionContent}</Paragraph>
        {q.teacherAnswer && <Alert type="success" message={`Phản hồi của ${q.teacher?.fullName || 'giảng viên'}`} description={<span style={{ whiteSpace: 'pre-wrap' }}>{q.teacherAnswer}</span>} />}
        {safeUrl(q.attachmentUrl) && <a href={safeUrl(q.attachmentUrl)} target="_blank" rel="noreferrer">Xem tài liệu đính kèm</a>}
      </Space>
    </List.Item>} /></Card>}
    <Modal open={open} title="Đặt câu hỏi cho giảng viên" onCancel={() => !saving && setOpen(false)} footer={null} destroyOnClose><Form form={form} layout="vertical" onFinish={submit}>
      <Form.Item name="classId" label="Khóa học bạn đang học" rules={[{ required: true, message: 'Chọn khóa học' }]}><Select loading={teachers.loading} placeholder="Chọn khóa học" options={(teachers.data || []).map(t => ({ value: t.classId, label: `${t.courseName} (${t.deliveryMode === 'RECORDED' ? 'Video' : t.classCode})` }))} /></Form.Item>
      {target && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<span>Gửi tới: <b>{target.teacherName}</b></span>} description="Giảng viên đang dạy khóa học này sẽ nhận và trả lời câu hỏi của bạn." />}
      <Form.Item name="questionTitle" label="Tiêu đề" rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item><Form.Item name="questionContent" label="Nội dung câu hỏi" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={5} maxLength={10000} showCount /></Form.Item><Form.Item name="attachmentUrl" label="Link ảnh / tài liệu / mã nguồn" rules={[{ type: 'url' }]}><Input placeholder="https://..." /></Form.Item><Button type="primary" htmlType="submit" loading={saving}>Gửi câu hỏi</Button>
    </Form></Modal>
    <Modal open={!!answering} title={answering?.questionTitle} onCancel={() => !saving && setAnswering(null)} footer={null}><Form form={answerForm} layout="vertical" onFinish={submit}><Form.Item name="teacherAnswer" label="Câu trả lời" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={5} maxLength={10000} /></Form.Item><Button type="primary" htmlType="submit" loading={saving}>Gửi phản hồi</Button></Form></Modal>
  </Space>;
}

export function StudentDashboard() {
  const { data, loading, error, reload } = useData('/analytics/student-overview');
  const courses = useData('/my-courses');
  const schedule = useData('/schedules/my-schedule');
  if (loading) return <Spin />;
  if (error) return <LoadError reload={reload} />;
  const today = dayjs().day() === 0 ? 8 : dayjs().day() + 1;
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><div><Title level={3}>Không gian học tập</Title><Text type="secondary">Tiếp tục khóa học và theo dõi kế hoạch học tập của bạn.</Text></div>
    <Row gutter={[16, 16]}>{[['Khóa đang học', data?.enrolledClassesCount || 0, ''], ['Tiến độ khóa video', data?.averageProgress || 0, '%'], ['Buổi Live mỗi tuần', data?.liveWeeklySessions || 0, ''], ['Khóa chờ thanh toán', data?.pendingPaymentCount || 0, '']].map(([title, value, suffix]) => <Col xs={12} lg={6} key={title}><Card><Statistic title={title} value={value} suffix={suffix} /></Card></Col>)}</Row>
    {!!data?.pendingPaymentCount && <Alert type="warning" showIcon message={`Bạn có ${data.pendingPaymentCount} khóa học đang chờ thanh toán`} description="Khóa học sẽ được mở ngay khi hệ thống nhận đủ học phí qua VietQR." action={<Link to="/tuition"><Button type="primary">Thanh toán ngay</Button></Link>} />}
    <Space wrap><Link to="/catalog"><Button type="primary" icon={<ShoppingCartOutlined />}>Khám phá khóa học</Button></Link><Link to="/my-courses"><Button icon={<BookOutlined />}>Khóa học của tôi</Button></Link></Space>
    <Row gutter={[20, 20]}><Col xs={24} lg={14}><Card title="Lịch học Live hôm nay" loading={schedule.loading}>{schedule.error ? <LoadError reload={schedule.reload} /> : <List dataSource={(schedule.data || []).filter(s => s.dayOfWeek === today)} locale={{ emptyText: 'Hôm nay bạn không có buổi học Live.' }} renderItem={s => <List.Item extra={safeUrl(s.meetUrl) ? <Button type="primary" href={safeUrl(s.meetUrl)} target="_blank" rel="noreferrer">Vào học</Button> : null}><List.Item.Meta title={s.courseName} description={`${s.startTime}–${s.endTime} · ${s.classCode} · ${s.teacherName}`} /></List.Item>} />}</Card></Col>
    <Col xs={24} lg={10}><Card title="Bài tập sắp đến hạn"><List dataSource={data?.upcomingDeadlines || []} locale={{ emptyText: 'Không có bài tập chưa nộp sắp đến hạn.' }} renderItem={a => <List.Item><Link to="/assignments">{a.title}</Link><Text type="secondary">{dayjs(a.dueDate).format('DD/MM HH:mm')}</Text></List.Item>} /></Card></Col></Row>
    <Card title="Tiếp tục học" loading={courses.loading}>{courses.error ? <LoadError reload={courses.reload} /> : <Table rowKey="id" pagination={{ pageSize: 5 }} dataSource={(courses.data || []).filter(e => e.status === 'ACTIVE')} columns={[
      { title: 'Khóa học', render: (_, e) => e.class.course.name }, { title: 'Hình thức', render: (_, e) => modeName(e.class.course.deliveryMode) },
      { title: 'Tiến độ', render: (_, e) => e.class.course.deliveryMode === 'RECORDED' ? <Progress percent={e.progressPercent || 0} /> : 'Theo lịch Live' },
      { title: '', render: (_, e) => <Link to={`/my-courses/${e.id}`}>Vào học →</Link> }
    ]} scroll={{ x: 600 }} />}</Card>
  </Space>;
}
