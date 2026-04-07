import React from 'react';
import { Tag, Dropdown } from 'antd';
import { FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';

const useStyles = createStyles(({ css }) => ({
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  tag: css`
    margin: 0;
  `,
}));

interface NewsHashtagsProps {
  hashtags: string[];
  /** If provided, tags show a dropdown menu (show / addFilter) and stop click propagation. */
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
  /** Extra class on the wrapper div */
  className?: string;
  /** Limit visible tags (rest shown as "+N") */
  maxVisible?: number;
}

/**
 * Shared hashtag component used in NewsListItem (collapsed) and NewsDetailToolbar (expanded).
 * When `onTagClick` is provided each tag shows a dropdown instead of plain text.
 * Clicks always call `stopPropagation` so parent clickable areas (accordion collapse) are not triggered.
 */
export function NewsHashtags({ hashtags, onTagClick, className, maxVisible }: NewsHashtagsProps) {
  const { styles, cx } = useStyles();
  const { t } = useTranslation();

  if (hashtags.length === 0) return null;

  const visible = maxVisible !== undefined ? hashtags.slice(0, maxVisible) : hashtags;
  const overflow = maxVisible !== undefined ? hashtags.length - maxVisible : 0;

  return (
    <div className={cx(styles.tags, className)}>
      {visible.map((tag) =>
        onTagClick ? (
          <Dropdown
            key={tag}
            trigger={['click']}
            menu={{
              items: [
                { key: 'show', label: t('news.list.tag_show'), icon: <FilterOutlined /> },
                { key: 'addFilter', label: t('news.list.tag_add_filter'), icon: <PlusOutlined /> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                onTagClick(tag, key as 'show' | 'addFilter');
              },
            }}
          >
            <Tag color="blue" className={styles.tag} style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
              {tag}
            </Tag>
          </Dropdown>
        ) : (
          <Tag key={tag} color="blue" className={styles.tag} onClick={(e) => e.stopPropagation()}>
            {tag}
          </Tag>
        ),
      )}
      {overflow > 0 && <Tag className={styles.tag}>+{overflow}</Tag>}
    </div>
  );
}
