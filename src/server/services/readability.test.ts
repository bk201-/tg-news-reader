import { describe, it, expect } from 'vitest';
import { buildFullContent, type ExtractedContent } from './readability.js';

function makeExtracted(partial: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    content: partial.content ?? 'cleaned content',
    textContent: partial.textContent ?? 'plain text content',
    ...partial,
  };
}

describe('buildFullContent', () => {
  // ── Markdown path (rawHtml present) ─────────────────────────────────

  it('converts rawHtml to markdown', () => {
    const result = buildFullContent(makeExtracted({ rawHtml: '<p>Hello <strong>world</strong></p>' }));
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('**world**');
  });

  it('prepends title to markdown when not already in content', () => {
    const result = buildFullContent(
      makeExtracted({
        title: 'Breaking News',
        rawHtml: '<p>Some article body text here</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toMatch(/^# Breaking News/);
  });

  it('does not prepend title when already in first 300 chars', () => {
    const result = buildFullContent(
      makeExtracted({
        title: 'Hello',
        rawHtml: '<h1>Hello</h1><p>World</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    // Title should NOT appear twice
    const count = (result.content.match(/Hello/gi) || []).length;
    expect(count).toBe(1);
  });

  it('falls through to text when rawHtml produces empty markdown', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '   ', // whitespace-only
        textContent: 'fallback text',
      }),
    );
    expect(result.format).toBe('text');
    expect(result.content).toBe('fallback text');
  });

  // ── Plain text path ─────────────────────────────────────────────────

  it('returns plain text when no rawHtml', () => {
    const result = buildFullContent(makeExtracted({ textContent: 'plain text' }));
    expect(result.format).toBe('text');
    expect(result.content).toBe('plain text');
  });

  it('prepends title to plain text when not in first 300 chars', () => {
    const result = buildFullContent(makeExtracted({ title: 'Big Title', textContent: 'body text here' }));
    expect(result.format).toBe('text');
    expect(result.content).toMatch(/^Big Title\n\nbody text here$/);
  });

  it('does not prepend title when already present in text', () => {
    const result = buildFullContent(makeExtracted({ title: 'body', textContent: 'body text here' }));
    expect(result.format).toBe('text');
    expect(result.content).toBe('body text here');
  });

  it('uses content as fallback when textContent is empty', () => {
    const result = buildFullContent(makeExtracted({ textContent: '', content: 'fallback content' }));
    expect(result.content).toBe('fallback content');
  });

  // ── Figure handling ─────────────��─────────────────────────────────────

  it('preserves text content from figure elements (no img)', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '<p>Before</p><figure><p>Caption text</p></figure><p>After</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('Before');
    expect(result.content).toContain('Caption text');
    expect(result.content).toContain('After');
  });

  it('strips figure with img but keeps surrounding text', () => {
    const result = buildFullContent(
      makeExtracted({
        rawHtml: '<p>Before</p><figure><img src="x.jpg"><figcaption>cap</figcaption></figure><p>After</p>',
      }),
    );
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('Before');
    expect(result.content).toContain('After');
  });
});
