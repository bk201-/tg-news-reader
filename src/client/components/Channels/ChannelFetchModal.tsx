import React from 'react';
import { Modal, DatePicker } from 'antd';
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
  return (
    <Modal
      open={open}
      title="Загрузить новости"
      onCancel={onClose}
      onOk={onConfirm}
      okText="Загрузить"
      cancelText="Отмена"
      confirmLoading={loading}
    >
      <div style={{ marginTop: 16 }}>
        <p>Загрузить новости начиная с:</p>
        <DatePicker
          showTime
          value={fetchSince}
          onChange={onChangeSince}
          placeholder="Дата (оставьте пустым для последней)"
          style={{ width: '100%' }}
          format="DD.MM.YYYY HH:mm"
        />
        <p style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          Если дата не выбрана, будет использована дата последней выгрузки.
        </p>
      </div>
    </Modal>
  );
}
