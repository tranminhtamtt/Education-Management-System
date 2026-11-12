import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Alert, message, Divider, Tabs, Select, DatePicker } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  UserAddOutlined,
  PhoneOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../api/client';

const { Title, Text, Paragraph } = Typography;

const LoginPage = () => {
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [regSuccessInfo, setRegSuccessInfo] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (values) => {
    try {
      setLoading(true);
      setErrorMsg('');
      await login(values.email, values.password);
      message.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    try {
      setRegLoading(true);
      setErrorMsg('');
      const payload = {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: values.phone,
        gender: values.gender || 'OTHER',
        dob: values.dob ? values.dob.format('YYYY-MM-DD') : undefined
      };
      const res = await apiClient.post('/auth/register', payload);
      if (res.success) {
        setRegSuccessInfo(res.data.user);
        message.success('Đăng ký tài khoản học viên mới thành công!');
        registerForm.resetFields();
        loginForm.setFieldsValue({ email: res.data.user.email, password: values.password });
        setActiveTab('login');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Đăng ký thất bại');
    } finally {
      setRegLoading(false);
    }
  };

  // Nút đăng nhập nhanh mẫu để kiểm thử
  const quickFill = (email, password) => {
    loginForm.setFieldsValue({ email, password });
    setErrorMsg('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFF0E6 0%, #F0F2F5 100%)',
        padding: '24px 16px'
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(242, 111, 33, 0.12)',
          border: '1px solid #FFE7BA'
        }}
        bodyStyle={{ padding: '32px 28px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              display: 'inline-block',
              background: '#F26F21',
              color: '#fff',
              fontSize: 22,
              fontWeight: 800,
              padding: '6px 20px',
              borderRadius: 8,
              letterSpacing: 2,
              marginBottom: 10
            }}
          >
            FPT • EMS
          </div>
          <Title level={3} style={{ margin: '4px 0', color: '#1f1f1f' }}>
            Cổng Quản Lý Đào Tạo
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Education Management System (Chuẩn quy chế FAP)
          </Text>
        </div>

        {regSuccessInfo && (
          <Alert
            message="Đăng ký thành công!"
            description={
              <div>
                Học viên: <b>{regSuccessInfo.fullName}</b> | Mã SV: <b style={{ color: '#F26F21' }}>{regSuccessInfo.code}</b>
                <br />
                Đã điền sẵn tài khoản vào ô đăng nhập.
              </div>
            }
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            closable
            onClose={() => setRegSuccessInfo(null)}
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {errorMsg && (
          <Alert
            message={errorMsg}
            type="error"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setErrorMsg('');
          }}
          centered
          items={[
            {
              key: 'login',
              label: (
                <span>
                  <LoginOutlined /> Đăng nhập
                </span>
              ),
              children: (
                <>
                  <Form form={loginForm} layout="vertical" onFinish={handleLogin} requiredMark={false}>
                    <Form.Item
                      name="email"
                      rules={[{ required: true, message: 'Vui lòng nhập Email hoặc Mã học viên' }]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: '#BFBFBF' }} />}
                        placeholder="Email hoặc Mã tài khoản (vd: admin@fpt.edu.vn / HE170001)"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: 'Vui lòng nhập Mật khẩu' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#BFBFBF' }} />}
                        placeholder="Mật khẩu"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item style={{ marginTop: 20 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        loading={loading}
                        icon={<LoginOutlined />}
                        style={{
                          height: 44,
                          backgroundColor: '#F26F21',
                          borderColor: '#F26F21',
                          fontWeight: 600
                        }}
                      >
                        ĐĂNG NHẬP
                      </Button>
                    </Form.Item>
                  </Form>

                  <Divider plain style={{ margin: '16px 0', fontSize: 12, color: '#8c8c8c' }}>
                    Tài khoản kiểm thử nhanh (Mật khẩu: 123456)
                  </Divider>

                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Button
                      size="small"
                      block
                      onClick={() => quickFill('admin@fpt.edu.vn', '123456')}
                    >
                      🔑 <b>Admin / Giáo vụ</b>: admin@fpt.edu.vn
                    </Button>
                    <Button
                      size="small"
                      block
                      onClick={() => quickFill('ketoan@fpt.edu.vn', '123456')}
                    >
                      💰 <b>Kế toán</b>: ketoan@fpt.edu.vn
                    </Button>
                    <Button
                      size="small"
                      block
                      onClick={() => quickFill('thaynam@fpt.edu.vn', '123456')}
                    >
                      👨‍🏫 <b>Giảng viên</b>: thaynam@fpt.edu.vn
                    </Button>
                    <Button
                      size="small"
                      block
                      onClick={() => quickFill('namnvhe170001@fpt.edu.vn', '123456')}
                    >
                      🎓 <b>Sinh viên</b>: namnvhe170001@fpt.edu.vn
                    </Button>
                  </Space>
                </>
              )
            },
            {
              key: 'register',
              label: (
                <span>
                  <UserAddOutlined /> Đăng ký Học viên
                </span>
              ),
              children: (
                <Form form={registerForm} layout="vertical" onFinish={handleRegister} requiredMark={false}>
                  <Form.Item
                    name="fullName"
                    label="Họ và tên"
                    rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
                  >
                    <Input
                      prefix={<UserOutlined style={{ color: '#BFBFBF' }} />}
                      placeholder="Nguyễn Văn A"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Vui lòng nhập Email' },
                      { type: 'email', message: 'Email không đúng định dạng' }
                    ]}
                  >
                    <Input
                      placeholder="student@example.com"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item
                    name="phone"
                    label="Số điện thoại"
                  >
                    <Input
                      prefix={<PhoneOutlined style={{ color: '#BFBFBF' }} />}
                      placeholder="0912345678"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label="Mật khẩu"
                    rules={[
                      { required: true, message: 'Vui lòng nhập mật khẩu' },
                      { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: '#BFBFBF' }} />}
                      placeholder="Tối thiểu 6 ký tự"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    label="Xác nhận mật khẩu"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                        }
                      })
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: '#BFBFBF' }} />}
                      placeholder="Nhập lại mật khẩu"
                      size="large"
                    />
                  </Form.Item>

                  <Form.Item style={{ marginTop: 20 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      size="large"
                      block
                      loading={regLoading}
                      icon={<UserAddOutlined />}
                      style={{
                        height: 44,
                        backgroundColor: '#F26F21',
                        borderColor: '#F26F21',
                        fontWeight: 600
                      }}
                    >
                      TẠO TÀI KHOẢN HỌC VIÊN
                    </Button>
                  </Form.Item>
                </Form>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
};

export default LoginPage;
