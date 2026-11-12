import React, { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async ({ fullName, email, password }) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post('/auth/register', { fullName, email, password });
      navigate('/login', { replace: true, state: { email: data.email, studentCode: data.code } });
    } catch (err) {
      setError(err.response?.data?.message || 'Không đăng ký được tài khoản. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#fff4eb' }}>
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={3}>Đăng ký tài khoản học viên</Typography.Title>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, max: 100 }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', max: 100 }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 8, message: 'Nhập mật khẩu ít nhất 8 ký tự.' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="Nhập lại mật khẩu" dependencies={['password']} rules={[
            { required: true, message: 'Vui lòng nhập lại mật khẩu.' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || value === getFieldValue('password')
                  ? Promise.resolve()
                  : Promise.reject(new Error('Mật khẩu nhập lại chưa khớp.'));
              }
            })
          ]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Đăng ký</Button>
          </Form.Item>
        </Form>
        <Link to="/login">Quay lại đăng nhập</Link>
      </Card>
    </main>
  );
}
