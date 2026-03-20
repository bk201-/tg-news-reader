import React, { useState } from 'react';
import { Form, Input, Button, Typography, Card, Alert, Space } from 'antd';
import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import type { AuthUser } from '../../store/authStore';

const { Title, Text } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [totpCode, setTotpCode] = useState('');
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<LoginFormValues>();
  const { t } = useTranslation();

  const doLogin = async (email: string, password: string, totpCodeVal?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, ...(totpCodeVal ? { totpCode: totpCodeVal } : {}) }),
      });

      const data = (await res.json()) as {
        accessToken?: string;
        user?: AuthUser;
        error?: string;
        requiresTOTP?: boolean;
      };

      if (!res.ok) {
        if (data.requiresTOTP) {
          setPending({ email, password });
          setStep('totp');
          setError(null);
        } else {
          setError(data.error ?? 'Login failed');
        }
        return;
      }

      setAuth(data.accessToken!, data.user!);
    } finally {
      setLoading(false);
    }
  };

  const handleCredentials = async (values: LoginFormValues) => {
    await doLogin(values.email, values.password);
  };

  const handleTOTP = async () => {
    if (!pending) return;
    await doLogin(pending.email, pending.password, totpCode);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }} variant="outlined">
        <Space direction="vertical" style={{ width: '100%' }} size={24}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 40 }}>📰</span>
            <Title level={3} style={{ margin: '8px 0 4px' }}>
              TG News Reader
            </Title>
            <Text type="secondary">{step === 'credentials' ? t('auth.sign_in') : t('auth.two_fa')}</Text>
          </div>

          {error && <Alert type="error" message={error} showIcon />}

          {step === 'credentials' ? (
            <Form form={form} layout="vertical" onFinish={handleCredentials} autoComplete="off">
              <Form.Item name="email" rules={[{ required: true, type: 'email', message: t('auth.email_required') }]}>
                <Input
                  prefix={<MailOutlined />}
                  placeholder={t('auth.email_placeholder')}
                  autoComplete="username"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[{ required: true, message: t('auth.password_required') }]}
                style={{ marginBottom: 24 }}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder={t('auth.password_placeholder')}
                  autoComplete="current-password"
                  size="large"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                  {t('auth.login_button')}
                </Button>
              </Form.Item>
            </Form>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Text>{t('auth.totp_prompt')}</Text>
              <Input.OTP length={6} value={totpCode} onChange={setTotpCode} size="large" />
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Button
                  onClick={() => {
                    setStep('credentials');
                    setError(null);
                  }}
                >
                  {t('auth.back')}
                </Button>
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={handleTOTP}
                  loading={loading}
                  disabled={totpCode.length < 6}
                  size="large"
                >
                  {t('auth.confirm_totp')}
                </Button>
              </Space>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
}
