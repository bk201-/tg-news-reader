import React, { memo } from 'react';
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
  track: css`
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    z-index: 11;
    pointer-events: none;
  `,
  bar: css`
    height: 100%;
    background: ${token.colorPrimary};
    transition: width 0.1s linear;
    border-radius: 0 1px 1px 0;
  `,
}));

interface ScrollProgressBarProps {
  progress: number; // 0..1
}

export const ScrollProgressBar = memo(function ScrollProgressBar({ progress }: ScrollProgressBarProps) {
  const { styles } = useStyles();
  const pct = Math.round(progress * 100);

  if (pct <= 0) return null;

  return (
    <div className={styles.track}>
      <div className={styles.bar} style={{ width: `${pct}%` }} />
    </div>
  );
});
