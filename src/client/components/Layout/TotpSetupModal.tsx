import React, { useState } from 'react';
import { Modal, Input, Button, Alert, Flex, Spin, Typography } from 'antd';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

interface TotpSetupModalProps {
  open: boolean;
  onClose: () => void;
}

export function TotpSetupModal({ open, onClose }: TotpSetupModalProps) {
  const { updateUser } = useAuthStore();

  const [step, setStep] = useState<'scan' | 'confirm'>('scan');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQr = async () => {
    setStep('scan');
    setCode('');
    setError(null);
    setFetchError(null);
    setQr(null);
    setSecret(null);
    try {
      const data = await api.get<{ qrCode: string; secret: string }>('/auth/totp/setup');
      setQr(data.qrCode);
      setSecret(data.secret);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Не удалось загрузить QR-код');
    }
  };

  const handleAfterOpen = (visible: boolean) => {
    if (visible) void fetchQr();
  };

  const handleConfirm = async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/totp/confirm', { secret, code });
      updateUser({ hasTOTP: true });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Настройка двухфакторной аутентификации"
      onCancel={onClose}
      afterOpenChange={handleAfterOpen}
      footer={null}
      width={440}
    >
      {step === 'scan' ? (
        <Flex vertical gap={16}>
          <Text>Отсканируйте QR-код в приложении Google Authenticator, Microsoft Authenticator или аналогичном:</Text>
          {fetchError ? (
            <Alert
              type="error"
              description={fetchError}
              showIcon
              action={
                <Button size="small" onClick={() => void fetchQr()}>
                  Повторить
                </Button>
              }
            />
          ) : qr ? (
            <div style={{ textAlign: 'center' }}>
              <img src={qr} alt="TOTP QR Code" style={{ width: 200, height: 200 }} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          )}
          <Button type="primary" block onClick={() => setStep('confirm')} disabled={!qr}>
            Я отсканировал, ввести код →
          </Button>
        </Flex>
      ) : (
        <Flex vertical gap={16}>
          <Text>Введите 6-значный код из приложения для подтверждения:</Text>
          <Input.OTP length={6} value={code} onChange={setCode} size="large" />
          {error && <Alert type="error" description={error} showIcon />}
          <Flex justify="space-between">
            <Button onClick={() => setStep('scan')}>← Назад</Button>
            <Button type="primary" onClick={() => void handleConfirm()} loading={loading} disabled={code.length < 6}>
              Подтвердить и включить 2FA
            </Button>
          </Flex>
        </Flex>
      )}
    </Modal>
  );
}
