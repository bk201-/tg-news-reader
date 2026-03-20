import type { NewsItem } from '@shared/types.ts';

/** Full title from first line of text, no truncation (for accordion header). */
export function getNewsTitle(item: NewsItem): string {
  const text = item.text || '';
  const firstLine = text.split('\n')[0]?.trim() || '';
  return firstLine || `Сообщение #${item.telegramMsgId}`;
}

/** Extract a short readable label from a URL (domain without www). */
export function getLinkLabel(url: string, index: number): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === 't.me' && pathname.length > 1) return `t.me${pathname.split('/').slice(0, 2).join('/')}`;
    return host;
  } catch {
    return `Ссылка ${index + 1}`;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return /youtu\.be\/|youtube\.com\/(watch|shorts|embed)/i.test(url);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${(bytes / 1024).toFixed(0)} КБ`;
}
