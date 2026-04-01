import React from 'react';
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
  block: css`
    width: 100%;
    max-width: 680px;
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillAlter};
    border-radius: 8px;
    padding: 16px 20px;
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.75;
    color: ${token.colorText};
    word-break: break-word;
  `,
}));

interface NewsTextBlockProps {
  text: string;
  children?: React.ReactNode;
}

/** Infoblock card that wraps the Telegram post text (item.text). */
export function NewsTextBlock({ text, children }: NewsTextBlockProps) {
  const { styles } = useStyles();
  return (
    <div className={styles.block}>
      {text}
      {children}
    </div>
  );
}
