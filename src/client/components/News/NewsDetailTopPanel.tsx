import React from 'react';
import { Button } from 'antd';
import { CloseOutlined, LinkOutlined } from '@ant-design/icons';
import { getLinkLabel } from './newsUtils';

interface NewsDetailTopPanelProps {
  panel: 'links' | 'text';
  links: string[];
  text?: string;
  onClose: () => void;
}

export function NewsDetailTopPanel({ panel, links, text, onClose }: NewsDetailTopPanelProps) {
  return (
    <div className="news-detail__panel-anchor">
      <div className="news-detail__top-panel">
        <div className="news-detail__top-panel-header">
          <span>{panel === 'links' ? `Ссылки (${links.length})` : 'Текст новости'}</span>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ color: 'rgba(255,255,255,0.8)' }}
          />
        </div>
        <div className="news-detail__top-panel-body">
          {panel === 'links' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {links.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-detail__panel-link-row"
                >
                  <span className="news-detail__panel-link-label">
                    <LinkOutlined style={{ marginRight: 6, opacity: 0.7 }} />
                    {getLinkLabel(link, i)}
                  </span>
                  <span className="news-detail__panel-link-url">{link}</span>
                </a>
              ))}
            </div>
          ) : (
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65, margin: 0 }}>{text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
