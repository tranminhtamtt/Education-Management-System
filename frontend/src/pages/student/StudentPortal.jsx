import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Modal, Pagination, Progress, Row, Select, Space, Spin, Statistic, Table, Tag, Typography, message } from 'antd';
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
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ page: 1 }), [search, setSearch] = useState('');
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const { data, loading, error, reload } = useData(`/courses/catalog?${query}`);
  const [selectedId, setSelectedId] = useState(null), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState(false), [classId, setClassId] = useState(null), [buying, setBuying] = useState(false);
  useEffect(() => {
    let alive = true;
    setDetail(null); setClassId(null); setDetailError(false);
    if (selectedId) api.get(`/courses/catalog/${selectedId}`).then(res => { if (alive) setDetail(res.data); }).catch(() => { if (alive) setDetailError(true); });
    return () => { alive = false; };
  }, [selectedId]);
  const purchase = async () => {
    setBuying(true);
    try {
      const res = await api.post(`/courses/${detail.id}/purchase`, { classId });
      message.success(res.message);
      navigate(res.data.enrollment.status === 'ACTIVE' ? `/my-courses/${res.data.enrollment.id}` : '/tuition');
    } catch (error) { errorMessage(error); } finally { setBuying(false); }
  };
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <div><Title level={3}>Khám phá khóa học</Title><Text type="secondary">Chọn khóa môn FPT hoặc chứng chỉ phù hợp với mục tiêu của bạn.</Text></div>
    <Card><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Input.Search placeholder="Tên khóa học, mã môn…" value={search} onChange={e => setSearch(e.target.value)} onSearch={value => setFilters(f => ({ ...f, search: value.trim(), page: 1 }))} allowClear style={{ width: 280, maxWidth: '100%' }} />
      <Select aria-label="Danh mục" placeholder="Tất cả danh mục" allowClear options={categories} onChange={category => setFilters(f => ({ ...f, category, page: 1 }))} style={{ width: 210 }} />
      <Select aria-label="Hình thức học" placeholder="Tất cả hình thức" allowClear options={modes} onChange={deliveryMode => setFilters(f => ({ ...f, deliveryMode, page: 1 }))} style={{ width: 200 }} />
    </div></Card>
    {error ? <LoadError reload={reload} /> : <Spin spinning={loading}><Row gutter={[20, 20]}>
      {(data?.items || []).map(course => <Col xs={24} md={12} xl={8} key={course.id}><Card style={{ height: '100%' }} actions={[<Button key="detail" type="link" onClick={() => setSelectedId(course.id)}>Xem chi tiết & đăng ký</Button>]}>
        <BookOutlined style={{ color: '#F26F21', fontSize: 32, marginBottom: 16 }} /><div><CourseTags course={course} /></div>
        <Title level={4}>{course.name}</Title><Text type="secondary">{course.courseCode} · {course.instructor?.fullName || 'Giảng viên trung tâm'}</Text>
        <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 12 }}>{course.description || 'Xem đề cương và các lớp đang mở để chọn khóa học.'}</Paragraph>
        <Text strong style={{ fontSize: 20, color: '#F26F21' }}>{money(course.baseTuitionFee)}</Text>
      </Card></Col>)}
    </Row>{!loading && !data?.items?.length && <Empty description="Chưa có khóa học phù hợp" />}</Spin>}
    {!!data?.total && <Pagination current={filters.page} total={data.total} pageSize={12} showSizeChanger={false} onChange={page => setFilters(f => ({ ...f, page }))} />}
    <Modal open={!!selectedId} onCancel={() => !buying && setSelectedId(null)} width={820} title={detail?.name || 'Chi tiết khóa học'} footer={null}>
      {detailError ? <Alert type="error" message="Không thể tải chi tiết. Đóng cửa sổ và thử lại." /> : !detail ? <Spin /> : <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <CourseTags course={detail} /><Paragraph>{detail.description}</Paragraph>
        <Text>Giảng viên: {detail.instructor?.fullName || detail.classes[0]?.teacher?.fullName || 'Chưa phân công'}</Text>
        {safeUrl(detail.syllabusUrl) && <a href={safeUrl(detail.syllabusUrl)} target="_blank" rel="noreferrer">Xem đề cương khóa học</a>}
        <List header="Nội dung bài học" bordered dataSource={detail.lessons} locale={{ emptyText: 'Trung tâm chưa công bố danh sách bài giảng.' }} renderItem={lesson => <List.Item><Space direction="vertical"><Text>{lesson.orderIndex}. {lesson.title} {lesson.isPreview && <Tag color="green">Học thử</Tag>}</Text><Text type="secondary">{lesson.sectionTitle} · {lesson.durationMinutes} phút</Text>{lesson.isPreview && <VideoPlayer url={lesson.videoUrl} />}</Space></List.Item>} />
        {detail.deliveryMode === 'LIVE_ONLINE' && <><Text strong>Chọn lớp Live</Text><Select value={classId} onChange={setClassId} placeholder="Chọn lịch học phù hợp" style={{ width: '100%' }} options={detail.classes.map(c => ({ value: c.id, disabled: !c.remainingSeats, label: `${c.classCode} · ${c.teacher?.fullName || 'Chưa phân công'} · Còn ${c.remainingSeats} chỗ` }))} />
          {detail.classes.filter(c => c.id === classId).map(c => <List key={c.id} size="small" dataSource={c.schedules} locale={{ emptyText: 'Lớp chưa công bố lịch học' }} renderItem={s => <List.Item>{s.dayOfWeek === 8 ? 'Chủ nhật' : `Thứ ${s.dayOfWeek}`} · {s.startTime}–{s.endTime} · {s.room}</List.Item>} />)}</>}
        <Alert type="info" showIcon message="Thanh toán qua VietQR" description="Khóa học được mở khi hệ thống xác nhận đã nhận đủ học phí. Khóa miễn phí được mở ngay sau đăng ký." />
        <Space wrap><Text strong style={{ fontSize: 22 }}>{money(detail.baseTuitionFee)}</Text><Button type="primary" icon={<ShoppingCartOutlined />} loading={buying} disabled={detail.deliveryMode === 'LIVE_ONLINE' && !classId} onClick={purchase}>Đăng ký khóa học</Button></Space>
      </Space>}
    </Modal>
  </Space>;
}

export function MyLearningPage() {
  const { data, loading, error, reload } = useData('/my-courses');
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><Title level={3}>Khóa học của tôi</Title>
    {error ? <LoadError reload={reload} /> : <Spin spinning={loading}><Row gutter={[20, 20]}>{(data || []).map(e => <Col xs={24} md={12} xl={8} key={e.id}><Card title={e.class.course.name}>
      <CourseTags course={e.class.course} /><Paragraph style={{ marginTop: 12 }}>{e.class.classCode} · {e.class.teacher?.fullName || 'Giảng viên trung tâm'}</Paragraph>
      {e.status === 'PENDING_PAYMENT' ? <><Tag color="gold">Chờ thanh toán</Tag><Paragraph>Còn thiếu: {money(Math.max(0, (e.tuitionInvoice?.amount || 0) - (e.tuitionInvoice?.paidAmount || 0)))}</Paragraph><Link to="/tuition"><Button type="primary">Thanh toán VietQR</Button></Link></> : <>
        <Tag color={e.class.status === 'COMPLETED' ? 'green' : 'blue'}>{e.class.status === 'COMPLETED' ? 'Lớp đã kết thúc' : e.class.status === 'UPCOMING' ? 'Sắp khai giảng' : 'Đang học'}</Tag>
        {e.class.course.deliveryMode === 'RECORDED' && <Progress percent={e.progressPercent || 0} />}
        <div style={{ marginTop: 12 }}><Link to={`/my-courses/${e.id}`}><Button type="primary" icon={<PlayCircleOutlined />}>Vào học</Button></Link></div>
      </>}
    </Card></Col>)}</Row>{!loading && !data?.length && <Empty description="Bạn chưa đăng ký khóa học nào"><Link to="/catalog"><Button type="primary">Khám phá khóa học</Button></Link></Empty>}</Spin>}
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
    <Card title="Bài tập, kết quả & trao đổi"><Space wrap><Link to="/assignments"><Button>Bài tập & nộp bài</Button></Link><Link to="/grades"><Button>Kết quả học tập</Button></Link><Link to={`/questions?classId=${data.classId}`}><Button icon={<CommentOutlined />}>Hỏi đáp với giảng viên</Button></Link></Space></Card>
  </Space>;
}

export function QuestionsPage() {
  const { user } = useAuth();
  const student = user?.role === 'STUDENT';
  const { data, loading, error, reload } = useData('/questions');
  const courses = useData(student ? '/my-courses' : '/classes');
  const [open, setOpen] = useState(false), [answering, setAnswering] = useState(null), [saving, setSaving] = useState(false);
  const [form] = Form.useForm(), [answerForm] = Form.useForm();
  const classId = Number(new URLSearchParams(window.location.search).get('classId')) || undefined;
  const submit = async values => {
    setSaving(true);
    try {
      if (answering) await api.patch(`/questions/${answering.id}/answer`, values);
      else await api.post('/questions', values);
      message.success(answering ? 'Đã gửi câu trả lời' : 'Đã gửi câu hỏi'); setOpen(false); setAnswering(null); form.resetFields(); answerForm.resetFields(); reload();
    } catch (error) { errorMessage(error); } finally { setSaving(false); }
  };
  return <Space direction="vertical" size="large" style={{ width: '100%' }}><Space wrap><Title level={3} style={{ margin: 0 }}>Hỏi đáp khóa học</Title>{student && <Button type="primary" onClick={() => { form.resetFields(); form.setFieldsValue({ classId }); setOpen(true); }}>Đặt câu hỏi</Button>}</Space>
    {error ? <LoadError reload={reload} /> : <Card loading={loading}><List dataSource={data || []} locale={{ emptyText: 'Chưa có câu hỏi nào' }} renderItem={q => <List.Item actions={!student ? [<Button key="answer" onClick={() => { setAnswering(q); answerForm.setFieldsValue({ teacherAnswer: q.teacherAnswer || '' }); }}>Trả lời</Button>] : []}>
      <Space direction="vertical" style={{ width: '100%' }}><Space wrap><Text strong>{q.questionTitle}</Text><Tag color={q.status === 'PENDING' ? 'gold' : 'green'}>{q.status === 'PENDING' ? 'Chờ trả lời' : 'Đã trả lời'}</Tag></Space>
        <Text type="secondary">{q.class?.classCode} · {q.student?.fullName} · {dayjs(q.createdAt).format('DD/MM/YYYY HH:mm')}</Text><Paragraph style={{ whiteSpace: 'pre-wrap' }}>{q.questionContent}</Paragraph>
        {q.teacherAnswer && <Alert type="success" message="Phản hồi của giảng viên" description={<span style={{ whiteSpace: 'pre-wrap' }}>{q.teacherAnswer}</span>} />}
        {safeUrl(q.attachmentUrl) && <a href={safeUrl(q.attachmentUrl)} target="_blank" rel="noreferrer">Xem tài liệu đính kèm</a>}
      </Space>
    </List.Item>} /></Card>}
    <Modal open={open} title="Đặt câu hỏi cho giảng viên" onCancel={() => !saving && setOpen(false)} footer={null} destroyOnClose><Form form={form} layout="vertical" onFinish={submit}>
      <Form.Item name="classId" label="Khóa học / lớp học" rules={[{ required: true }]}><Select loading={courses.loading} options={(courses.data || []).filter(e => e.status === 'ACTIVE').map(e => ({ value: e.classId, label: `${e.class.classCode} · ${e.class.course.name}` }))} /></Form.Item>
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
    <Row gutter={[16, 16]}>{[['Khóa đang học', data?.enrolledClassesCount || 0, ''], ['Tiến độ trung bình', data?.averageProgress || 0, '%'], ['Điểm trung bình', data?.gpa || 0, '/10'], ['Khóa đạt', data?.passedCourses || 0, '']].map(([title, value, suffix]) => <Col xs={12} lg={6} key={title}><Card><Statistic title={title} value={value} suffix={suffix} /></Card></Col>)}</Row>
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
