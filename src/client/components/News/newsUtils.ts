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
