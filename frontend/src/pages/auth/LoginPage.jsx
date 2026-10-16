import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Alert, message, Divider } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;

const LoginPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleFinish = async (values) => {
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

  // Nút đăng nhập nhanh mẫu để kiểm thử
  const quickFill = (email, password) => {
    form.setFieldsValue({ email, password });
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
        padding: '20px'
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(242, 111, 33, 0.12)',
          border: '1px solid #FFE7BA'
        }}
        bodyStyle={{ padding: '36px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              display: 'inline-block',
              background: '#F26F21',
              color: '#fff',
              fontSize: 22,
              fontWeight: 800,
              padding: '8px 20px',
              borderRadius: 8,
              letterSpacing: 2,
              marginBottom: 12
            }}
          >
            FPT • EMS
          </div>
          <Title level={3} style={{ margin: '8px 0 4px', color: '#1f1f1f' }}>
            Cổng Quản Lý Đào Tạo
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Education Management System (Chuẩn quy chế FAP)
          </Text>
        </div>

        {errorMsg && (
          <Alert
            message={errorMsg}
            type="error"
            showIcon
            style={{ marginBottom: 20, borderRadius: 8 }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập Email' },
              { type: 'email', message: 'Email không đúng định dạng' }
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#BFBFBF' }} />}
              placeholder="Email tài khoản (vd: admin@fpt.edu.vn)"
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

          <Form.Item style={{ marginTop: 24 }}>
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

        <Divider plain style={{ margin: '18px 0', fontSize: 12, color: '#8c8c8c' }}>
          Tài khoản kiểm thử nhanh (1-Click Fill)
        </Divider>

        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Button
            size="small"
            block
            onClick={() => quickFill('admin@fpt.edu.vn', '123456')}
          >
            🔑 <b>Admin</b>: admin@fpt.edu.vn (123456)
          </Button>
          <Button
            size="small"
            block
            onClick={() => quickFill('thaynam@fpt.edu.vn', '123456')}
          >
            👨‍🏫 <b>Giảng viên</b>: thaynam@fpt.edu.vn (123456)
          </Button>
          <Button
            size="small"
            block
            onClick={() => quickFill('namnvhe170001@fpt.edu.vn', '123456')}
          >
            🎓 <b>Sinh viên</b>: namnvhe170001@fpt.edu.vn (123456)
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default LoginPage;
