import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Typography,
  message,
  Tooltip,
  Popconfirm,
  Radio,
  Row,
  Col
} from 'antd';
import {
  SearchOutlined,
  LockOutlined,
  UnlockOutlined,
  UserSwitchOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Text } = Typography;

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal đổi vai trò
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('STUDENT');
  const [updatingRole, setUpdatingRole] = useState(false);

  const fetchUsers = useCallback(async (
    page = pagination.current,
    pageSize = pagination.pageSize,
    searchKey = search,
    role = roleFilter,
    status = statusFilter
  ) => {
    try {
      setLoading(true);
      const res = await apiClient.get('/users', {
        params: {
          page,
          pageSize,
          search: searchKey || undefined,
          role: role || undefined,
          status: status || undefined
        }
      });
      if (res.success) {
        setData(res.data.items);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.pageSize,
          total: res.data.pagination.total
        });
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers(1, 10);
  }, []);

  const handleSearch = () => {
    fetchUsers(1, pagination.pageSize, search, roleFilter, statusFilter);
  };

  const handleTableChange = (pag) => {
    fetchUsers(pag.current, pag.pageSize, search, roleFilter, statusFilter);
  };

  // Khóa / Mở khóa tài khoản
  const handleToggleStatus = async (user, targetStatus) => {
    try {
      const res = await apiClient.patch(`/users/${user.id}/status`, {
        status: targetStatus
      });
      if (res.success) {
        message.success(res.message || 'Cập nhật trạng thái thành công');
        fetchUsers(pagination.current, pagination.pageSize);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi cập nhật trạng thái');
    }
  };

  // Mở modal đổi vai trò
  const handleOpenRoleModal = (user) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setRoleModalOpen(true);
  };

  // Xác nhận đổi vai trò
  const handleSaveRole = async () => {
    if (!selectedUser) return;
    try {
      setUpdatingRole(true);
      const res = await apiClient.patch(`/users/${selectedUser.id}/status`, {
        role: newRole
      });
      if (res.success) {
        message.success(`Đã đổi vai trò của [${selectedUser.code}] sang ${newRole}`);
        setRoleModalOpen(false);
        fetchUsers(pagination.current, pagination.pageSize);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Lỗi khi đổi vai trò');
    } finally {
      setUpdatingRole(false);
    }
  };

  const getRoleTag = (role) => {
    switch (role) {
      case 'ADMIN':
        return <Tag color="red" icon={<SafetyCertificateOutlined />}>ADMIN (Quản trị)</Tag>;
      case 'TEACHER':
        return <Tag color="blue">GIẢNG VIÊN</Tag>;
      case 'STUDENT':
        return <Tag color="orange">HỌC VIÊN</Tag>;
      case 'ACCOUNTANT':
        return <Tag color="green">KẾ TOÁN</Tag>;
      default:
        return <Tag>{role}</Tag>;
    }
  };

  const getStatusTag = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Tag color="success">Đang hoạt động</Tag>;
      case 'INACTIVE':
        return <Tag color="default">Tạm ngưng</Tag>;
      case 'SUSPENDED':
        return <Tag color="error">Đang bị khóa</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Mã người dùng',
      dataIndex: 'code',
      width: 140,
      render: (code) => (
        <Space>
          <Text strong style={{ color: code === 'ADM001' ? '#ff4d4f' : '#F26F21' }}>
            {code}
          </Text>
          {code === 'ADM001' && (
            <Tooltip title="Tài khoản Quản trị hệ thống gốc (Root Admin)">
              <Tag color="magenta" style={{ fontSize: 10, padding: '0 4px' }}>Root</Tag>
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'fullName',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Email',
      dataIndex: 'email'
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      render: (phone) => phone || '-'
    },
    {
      title: 'Vai trò (Role)',
      dataIndex: 'role',
      width: 160,
      render: (role) => getRoleTag(role)
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (st) => getStatusTag(st)
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 130,
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '-')
    },
    {
      title: 'Hành động',
      width: 200,
      render: (_, record) => {
        const isRootAdmin = record.code === 'ADM001';
        const isSelf = record.id === currentUser?.id;
        const cannotLock = isRootAdmin || isSelf;

        return (
          <Space size="small">
            {/* Nút Khóa / Mở khóa */}
            {record.status === 'ACTIVE' ? (
              cannotLock ? (
                <Tooltip title={isRootAdmin ? 'Không thể khóa Root Admin (ADM001)' : 'Không thể tự khóa chính mình'}>
                  <Button size="small" danger disabled icon={<LockOutlined />}>
                    Khóa
                  </Button>
                </Tooltip>
              ) : (
                <Popconfirm
                  title="Khóa tài khoản người dùng?"
                  description={`Bạn có chắc muốn tạm khóa tài khoản [${record.code}] ${record.fullName}?`}
                  okText="Khóa tài khoản"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleToggleStatus(record, 'SUSPENDED')}
                >
                  <Button size="small" danger icon={<LockOutlined />}>
                    Khóa
                  </Button>
                </Popconfirm>
              )
            ) : (
              <Button
                size="small"
                style={{ color: '#52c41a', borderColor: '#52c41a' }}
                icon={<UnlockOutlined />}
                onClick={() => handleToggleStatus(record, 'ACTIVE')}
              >
                Mở khóa
              </Button>
            )}

            {/* Nút Đổi vai trò */}
            {isRootAdmin ? (
              <Tooltip title="Không được phép đổi vai trò của Root Admin">
                <Button size="small" disabled icon={<UserSwitchOutlined />}>
                  Đổi Role
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="small"
                icon={<UserSwitchOutlined />}
                onClick={() => handleOpenRoleModal(record)}
              >
                Đổi Role
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#F26F21', fontSize: 20 }} />
            <span>Quản lý Toàn bộ Tài khoản Hệ thống (System Admin)</span>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers(1, pagination.pageSize)}>
            Làm mới
          </Button>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Tìm theo Mã, Tên, Email, SĐT..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Lọc Vai trò (Role)"
              value={roleFilter || undefined}
              onChange={(val) => {
                setRoleFilter(val || '');
                fetchUsers(1, pagination.pageSize, search, val || '', statusFilter);
              }}
              allowClear
              style={{ width: '100%' }}
              options={[
                { label: 'Tất cả vai trò', value: '' },
                { label: 'Admin (Quản trị)', value: 'ADMIN' },
                { label: 'Giảng viên', value: 'TEACHER' },
                { label: 'Học viên', value: 'STUDENT' },
                { label: 'Kế toán', value: 'ACCOUNTANT' }
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Lọc Trạng thái"
              value={statusFilter || undefined}
              onChange={(val) => {
                setStatusFilter(val || '');
                fetchUsers(1, pagination.pageSize, search, roleFilter, val || '');
              }}
              allowClear
              style={{ width: '100%' }}
              options={[
                { label: 'Tất cả trạng thái', value: '' },
                { label: 'Đang hoạt động (ACTIVE)', value: 'ACTIVE' },
                { label: 'Tạm ngưng (INACTIVE)', value: 'INACTIVE' },
                { label: 'Đang bị khóa (SUSPENDED)', value: 'SUSPENDED' }
              ]}
            />
          </Col>
          <Col xs={24} sm={2} md={4} style={{ textAlign: 'right' }}>
            <Button type="primary" onClick={handleSearch} style={{ backgroundColor: '#F26F21', borderColor: '#F26F21' }}>
              Tìm kiếm
            </Button>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
        />
      </Card>

      {/* Modal Đổi Vai Trò (Role) */}
      <Modal
        title={
          <Space>
            <UserSwitchOutlined style={{ color: '#F26F21' }} />
            <span>Phân quyền Vai trò: {selectedUser?.fullName} ({selectedUser?.code})</span>
          </Space>
        }
        open={roleModalOpen}
        onCancel={() => setRoleModalOpen(false)}
        onOk={handleSaveRole}
        confirmLoading={updatingRole}
        okText="Lưu vai trò"
        cancelText="Hủy"
        okButtonProps={{ style: { backgroundColor: '#F26F21', borderColor: '#F26F21' } }}
      >
        <div style={{ padding: '16px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Chọn vai trò mới cho tài khoản người dùng này trong hệ thống:
          </Text>
          <Radio.Group
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <Radio value="STUDENT">
              <Space>
                <Tag color="orange">HỌC VIÊN</Tag>
                <span>Học viên mua khóa học, học video, vào lớp Meet và làm bài tập</span>
              </Space>
            </Radio>
            <Radio value="TEACHER">
              <Space>
                <Tag color="blue">GIẢNG VIÊN</Tag>
                <span>Giảng viên dạy lớp Live, điểm danh, giao bài và trả lời Q&A</span>
              </Space>
            </Radio>
            <Radio value="ACCOUNTANT">
              <Space>
                <Tag color="green">KẾ TOÁN</Tag>
                <span>Kế toán đối soát giao dịch, theo dõi sai lệch và báo cáo tài chính</span>
              </Space>
            </Radio>
            <Radio value="ADMIN">
              <Space>
                <Tag color="red">ADMIN</Tag>
                <span>Quản trị viên toàn quyền quản lý hệ thống</span>
              </Space>
            </Radio>
          </Radio.Group>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
