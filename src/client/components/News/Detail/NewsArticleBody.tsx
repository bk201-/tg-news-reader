import React from 'react';
import { Typography } from 'antd';
import { createStyles } from 'antd-style';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Paragraph } = Typography;

const useStyles = createStyles(({ css, token }) => ({
  wrapper: css`
    width: 100%;
    max-width: 680px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    padding: 16px 20px;
    background: ${token.colorBgContainer};
    word-break: break-word;
  `,
  markdown: css`
    font-size: 14px;
    line-height: 1.8;
    color: ${token.colorText};

    & h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px;
      color: ${token.colorTextHeading};
      line-height: 1.35;
    }
    & h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0 8px;
      color: ${token.colorTextHeading};
      line-height: 1.4;
    }
    & h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 16px 0 6px;
      color: ${token.colorTextHeading};
    }
    & p {
      margin: 0 0 12px;
      &:last-child {
        margin-bottom: 0;
      }
    }
    & blockquote {
      border-left: 3px solid ${token.colorPrimary};
      margin: 12px 0;
      padding: 4px 0 4px 14px;
      color: ${token.colorTextSecondary};
      font-style: italic;
      & p {
        margin: 0;
      }
    }
    & hr {
      border: none;
      border-top: 1px solid ${token.colorBorderSecondary};
      margin: 20px 0;
    }
    & ul,
    & ol {
      padding-left: 20px;
      margin: 0 0 12px;
    }
    & li {
      margin-bottom: 4px;
    }
    & a {
      color: ${token.colorLink};
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
    & code {
      background: ${token.colorFillAlter};
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 13px;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    & pre {
      background: ${token.colorFillAlter};
      border-radius: 6px;
      padding: 12px 14px;
      overflow-x: auto;
      margin: 0 0 12px;
      & code {
        background: none;
        padding: 0;
        font-size: 13px;
      }
    }
    & em {
      font-style: italic;
    }
    & strong {
      font-weight: 600;
    }
    & table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 12px;
      font-size: 13px;
    }
    & th,
    & td {
      border: 1px solid ${token.colorBorderSecondary};
      padding: 6px 10px;
      text-align: left;
    }
    & th {
      background: ${token.colorFillAlter};
      font-weight: 600;
    }
  `,
  plainText: css`
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.8;
  `,
}));

interface NewsArticleBodyProps {
  content: string;
  format: 'text' | 'markdown';
}

/** Renders extracted article content — Markdown (new) or plain text (legacy). */
export function NewsArticleBody({ content, format }: NewsArticleBodyProps) {
  const { styles } = useStyles();

  return (
    <div className={styles.wrapper}>
      {format === 'markdown' ? (
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <Paragraph className={styles.plainText}>{content}</Paragraph>
      )}
    </div>
  );
}
