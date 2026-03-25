import { logger } from '../logger.js';

// Lazy runtime references — jsdom adds ~2s to cold start but is only needed
// when the user clicks "Load article", so defer until first actual use.
let JSDOMClass: (typeof import('jsdom'))['JSDOM'] | null = null;
let ReadabilityClass: (typeof import('@mozilla/readability'))['Readability'] | null = null;

async function getLibs() {
  if (JSDOMClass && ReadabilityClass) return { JSDOM: JSDOMClass, Readability: ReadabilityClass };
  const t = performance.now();
  const [{ JSDOM }, { Readability }] = await Promise.all([import('jsdom'), import('@mozilla/readability')]);
  JSDOMClass = JSDOM;
  ReadabilityClass = Readability;
  logger.info(
    { module: 'readability', ms: Math.round(performance.now() - t) },
    `jsdom loaded lazily in ${Math.round(performance.now() - t)}ms`,
  );
  return { JSDOM, Readability };
}

export interface ExtractedContent {
  title?: string;
  content: string;
  textContent: string;
  excerpt?: string;
  siteName?: string;
  byline?: string;
}

/** Removes empty lines, collapses whitespace, strips leftover HTML tags */
function cleanText(raw: string): string {
  // Strip any leftover HTML tags (fallback for when content is used instead of textContent)
  const stripped = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');

  return stripped
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => {
      if (line.length > 0) return true;
      // Allow at most one consecutive empty line (paragraph break)
      return i > 0 && arr[i - 1].length > 0;
    })
    .join('\n')
    .trim();
}

/** Prepends the article title to the text, but only if it's not already present */
export function buildFullContent(extracted: ExtractedContent): string {
  const text = extracted.textContent || extracted.content;
  const title = extracted.title?.trim();

  if (!title || !text) return text;

  // Check if title already appears near the start of the text (first 300 chars)
  if (text.slice(0, 300).toLowerCase().includes(title.toLowerCase())) return text;

  return `${title}\n\n${text}`;
}

export async function extractContentFromUrl(url: string): Promise<ExtractedContent> {
  const { JSDOM, Readability } = await getLibs();

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} for URL: ${url}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    // Fallback: try to extract body text
    const bodyText = dom.window.document.body?.textContent || '';
    return {
      content: '',
      textContent: bodyText.trim().substring(0, 5000),
    };
  }

  return {
    title: article.title ?? undefined,
    content: cleanText(article.content ?? ''),
    textContent: cleanText(article.textContent ?? ''),
    excerpt: article.excerpt ?? undefined,
    siteName: article.siteName ?? undefined,
    byline: article.byline ?? undefined,
  };
}
