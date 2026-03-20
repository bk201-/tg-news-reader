import React from 'react';

interface FlagProps {
  size?: number;
}

/** Russian flag: white / blue / red horizontal stripes */
export function FlagRU({ size = 20 }: FlagProps) {
  const h = Math.round((size * 2) / 3);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 3 2"
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2, border: '1px solid rgba(0,0,0,.12)' }}
    >
      <rect width="3" height="0.667" y="0" fill="#fff" />
      <rect width="3" height="0.667" y="0.667" fill="#003da5" />
      <rect width="3" height="0.667" y="1.333" fill="#da291c" />
    </svg>
  );
}
