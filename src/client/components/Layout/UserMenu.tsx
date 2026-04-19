import React from 'react';
import { Typography, Button, Modal } from 'antd';
import {
  LogoutOutlined,
  SafetyCertificateOutlined,
  QrcodeOutlined,
  ClearOutlined,
  TranslationOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { FlagRU, FlagUS } from '../Flags';
import { clearSwCache } from '../../services/serviceWorker';
import { APP_VERSION } from '../../appVersion';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import type { App } from 'antd';

const { Text } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  emailText: css`
    font-size: 12px;
  `,
  totpActiveIcon: css`
    color: ${token.colorSuccess};
  `,
  langSwitcher: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  langLabel: css`
    margin-right: 4px;
  `,
  langBtn: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `,
}));

interface UserMenuProps {
  message: ReturnType<typeof App.useApp>['message'];
  onOpenTotp: () => void;
}

export function useUserMenuItems({ message, onOpenTotp }: UserMenuProps) {
  const { user, clearAuth, updateUser } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { styles } = useStyles();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAuth();
  };

  const handleClearMediaCache = () => {
    Modal.confirm({
      title: t('header.user_menu.clear_cache_confirm_title'),
      content: t('header.user_menu.clear_cache_confirm_content'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await clearSwCache();
        void message.success(t('header.user_menu.clear_cache_success'));
      },
    });
  };

  const handleDisableTOTP = () => {
    Modal.confirm({
      title: t('header.user_menu.disable_2fa_confirm_title'),
      content: t('header.user_menu.disable_2fa_confirm_content'),
      okText: t('header.user_menu.disable_2fa_ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await api.delete('/auth/totp');
        updateUser({ hasTOTP: false });
      },
    });
  };

  return [
    {
      key: 'email',
      label: (
        <Text type="secondary" className={styles.emailText}>
          {user?.email}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'totp',
      icon: user?.hasTOTP ? <SafetyCertificateOutlined className={styles.totpActiveIcon} /> : <QrcodeOutlined />,
      label: user?.hasTOTP ? t('header.user_menu.manage_2fa') : t('header.user_menu.enable_2fa'),
      onClick: user?.hasTOTP ? handleDisableTOTP : onOpenTotp,
    },
    { type: 'divider' as const },
    {
      key: 'clear-cache',
      icon: <ClearOutlined />,
      label: t('header.user_menu.clear_cache'),
      onClick: handleClearMediaCache,
    },
    { type: 'divider' as const },
    {
      key: 'language',
      icon: <TranslationOutlined />,
      label: (
        <div className={styles.langSwitcher} onClick={(e) => e.stopPropagation()}>
          <span className={styles.langLabel}>{t('header.user_menu.language')}:</span>
          <Button
            size="small"
            type={!i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('en');
            }}
            className={styles.langBtn}
          >
            <FlagUS size={18} /> EN
          </Button>
          <Button
            size="small"
            type={i18n.language.startsWith('ru') ? 'primary' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              void i18n.changeLanguage('ru');
            }}
            className={styles.langBtn}
          >
            <FlagRU size={18} /> RU
          </Button>
        </div>
      ),
    },
    { type: 'divider' as const },
    {
      key: 'version',
      icon: <TagOutlined />,
      label: (
        <Text type="secondary" className={styles.emailText}>
          {t('header.user_menu.version', { version: APP_VERSION })}
        </Text>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('header.user_menu.logout'),
      danger: true,
      onClick: () => void handleLogout(),
    },
  ];
}
