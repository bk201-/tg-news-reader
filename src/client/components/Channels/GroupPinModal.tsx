import React from 'react';
import { Modal, Input, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import type { Group } from '@shared/types.ts';

const { Text } = Typography;

const useStyles = createStyles(({ css }) => ({
  body: css`
    margin-top: 16px;
    text-align: center;
  `,
  lockIcon: css`
    margin-right: 8px;
  `,
  pinError: css`
    display: block;
    margin-top: 8px;
  `,
}));

interface GroupPinModalProps {
  open: boolean;
  pinTarget: Group | null;
  pinValue: string;
  pinError: string;
  confirmLoading: boolean;
  onClose: () => void;
  /** Called on manual OK click (no arg) or auto-submit with the completed PIN value */
  onConfirm: (pin?: string) => void;
  onPinChange: (val: string) => void;
}

export function GroupPinModal({
  open,
  pinTarget,
  pinValue,
  pinError,
  confirmLoading,
  onClose,
  onConfirm,
  onPinChange,
}: GroupPinModalProps) {
  const { t } = useTranslation();
  const { styles } = useStyles();
  return (
    <Modal
      open={open}
      title={
        <span>
          <LockOutlined className={styles.lockIcon} style={{ color: pinTarget?.color }} />
          {t('groups.pin_modal.title', { name: pinTarget?.name })}
        </span>
      }
      onCancel={onClose}
      onOk={() => onConfirm()}
      okText={t('groups.pin_modal.ok_text')}
      cancelText={t('common.cancel')}
      confirmLoading={confirmLoading}
      afterOpenChange={(visible) => {
        if (visible) onPinChange('');
      }}
    >
      <div
        className={styles.body}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
        }}
      >
        <Input.OTP
          length={4}
          autoFocus
          value={pinValue}
          onChange={(val) => {
            onPinChange(val);
            if (val.length === 4) onConfirm(val);
          }}
          styles={{ root: { justifyContent: 'center' }, input: { width: 56, height: 56, fontSize: 24 } }}
        />
        {pinError && (
          <Text type="danger" className={styles.pinError}>
            {pinError}
          </Text>
        )}
      </div>
    </Modal>
  );
}
