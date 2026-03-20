import React from 'react';
import { Modal, DatePicker } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

interface ChannelFetchModalProps {
  open: boolean;
  fetchSince: dayjs.Dayjs | null;
  loading: boolean;
  onChangeSince: (val: dayjs.Dayjs | null) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ChannelFetchModal({
  open,
  fetchSince,
  loading,
  onChangeSince,
  onClose,
  onConfirm,
}: ChannelFetchModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={t('channels.fetch_modal.title')}
      onCancel={onClose}
      onOk={onConfirm}
      okText={t('channels.fetch_modal.ok_text')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
    >
      <div style={{ marginTop: 16 }}>
        <p>{t('channels.fetch_modal.label')}</p>
        <DatePicker
          showTime
          value={fetchSince}
          onChange={onChangeSince}
          placeholder={t('channels.fetch_modal.date_placeholder')}
          style={{ width: '100%' }}
          format="DD.MM.YYYY HH:mm"
        />
        <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          {t('channels.fetch_modal.hint')}
        </p>
      </div>
    </Modal>
  );
}
