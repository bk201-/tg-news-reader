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

/** Extract YouTube video ID from any YouTube URL variant. Returns null if not a valid YT URL. */
export function getYouTubeEmbedId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('?')[0];
      return id || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      return u.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ` : `${(bytes / 1024).toFixed(0)} КБ`;
}
