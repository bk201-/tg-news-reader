# PRD: Стилизация блоков просмотра

> Статус: Draft · Дата: апрель 2026

---

## Problem Statement

При открытии новости в `NewsDetail` все зоны контента выглядят одинаково — плоско, без
визуальной иерархии. Медиа, текст Telegram-поста и загруженная полная статья отображаются
в одном потоке, одинаковым шрифтом, без разграничения. Читателю сложно понять, где кончается
превью канала и начинается полноценный текст статьи. Fullcontent хранится как plain text —
заголовки, цитаты и разделители, выданные Readability, теряются при сохранении.

---

## Solution

Ввести три визуально различимые зоны в `NewsDetail`:

1. **Медиа** — без обёрток и фонов; изображение/видео «плавает» само по себе.
2. **Текст поста** — блок-карточка ("infoblock"): бордер + фоновая подложка, как информационная
   плашка. Это текст из Telegram-поста (`item.text`).
3. **Полная статья** — Markdown-рендеринг с типографикой в стиле Telegram Instant View:
   заголовки H1–H3, цитаты с левым бордером, горизонтальные разделители, параграфы.

На сервере изменить pipeline: сохранять `full_content` в формате Markdown (через `turndown`),
а не plain text. Добавить в БД поле `full_content_format` для backward-compatible рендеринга.

---

## User Stories

1. As a reader, I want the media (photo/video) to appear without any background box or border so
   that images feel immersive and not trapped in a frame.
2. As a reader, I want the Telegram post text to be visually separated in an info-card so that
   I can tell at a glance where the channel's own text ends.
3. As a reader, I want extracted full articles to be rendered with formatted headings, blockquotes,
   and dividers so that long-read articles are pleasant and scannable to read.
4. As a reader, I want article headings (H1–H3) to be visually prominent so that I can quickly
   jump to sections of a long article.
5. As a reader, I want blockquotes in articles to have a left-border accent so that cited text
   is distinguishable from the main body.
6. As a reader, I want horizontal rules in articles to visually separate major sections, the same
   way Telegram Instant View uses dividers.
7. As a reader, I want the article rendered with Ant Design theme colors so that it respects my
   chosen light/dark theme without any hardcoded colors breaking the look.
8. As a reader opening a `news_link` item that has no fullContent yet, I want to see the preview
   text in the info-card style with the "Load article" button below it, consistent with the rest
   of the UI.
9. As a reader, I want `media`-channel posts (where post text is in the overlay top panel) to
   not show an empty text infoblock, since the text is accessible via the overlay.
10. As a reader, I want old articles (stored as plain text before this change) to continue
    rendering gracefully as plain text, without broken formatting.
11. As a reader, I want the visual treatment to be the same in both view modes (list + detail
    panel, and accordion/mobile) because `NewsDetail` is shared between them.
12. As a developer, I want the three visual zones to be implemented as separate small components
    (`NewsTextBlock`, `NewsArticleBody`) so the code stays under the 200-line limit and each zone
    can evolve independently.

---

## Implementation Decisions

### Scope
- All changes live exclusively in `NewsDetail` and its sub-components (`NewsDetailBody`,
  `NewsDetailMedia`). `NewsListItem` and feed-level components are untouched.
- Both view modes (list-panel and accordion) are covered automatically because they share
  `NewsDetail`.

### Server — Markdown extraction pipeline

- Add `turndown` npm dependency (server-only).
- Modify `readability.ts → buildFullContent`:
  - Use `article.content` (Readability HTML output) as the source instead of `textContent`.
  - Convert HTML → Markdown via `new TurndownService()` with GFM preset.
  - Keep `buildFullContent(extracted)` signature; now returns a Markdown string.
- Add `full_content_format TEXT NOT NULL DEFAULT 'text'` column to the `news` table:
  - `schema.ts` gets the new column.
  - `migrate.ts` gets an `ALTER TABLE news ADD COLUMN full_content_format TEXT NOT NULL DEFAULT 'text'` statement in `alterMigrations`.
- `content.ts` route (`POST /api/content/news/:id`) saves `full_content_format: 'markdown'`
  alongside `full_content`.
- Download worker (`downloadManager.ts`) also saves `full_content_format: 'markdown'` when
  writing article task result to DB.

### Shared types

- `NewsItem` gets `fullContentFormat?: 'text' | 'markdown'` field (optional for backward compat).
- `ChannelType` is already in `shared/types.ts`; no change needed.

### Threading `channelType` down

Currently `NewsDetail` doesn't receive `channelType`. Add `channelType: ChannelType` prop to:
- `NewsDetail` → `NewsDetailBody` → (used for zone 2 suppression when `textInPanel === 1`)

Callers to update: `NewsFeed` (passes `channel.channelType`) and `NewsAccordionItem` (which
needs it from `NewsAccordionList`, which needs it from `NewsFeed`).

### New client components

**`NewsTextBlock`** (new file):
- Props: `text: string`
- Renders an infoblock card: `border: 1px solid token.colorBorderSecondary`,
  `background: token.colorFillAlter`, `border-radius: 8px`, `padding: 16px 20px`.
- Used in `NewsDetailBody` in place of the bare `<Paragraph>` for `item.text`.
- Not rendered when `textInPanel === 1` (media channels already show text in the overlay).
- Not rendered when text is empty (`item.text` is falsy) or when `canLoadArticle === 1` and
  `fullContent` is already loaded (article replaces preview entirely).

**`NewsArticleBody`** (new file):
- Props: `content: string`, `format: 'text' | 'markdown'`
- When `format === 'markdown'`: renders with `react-markdown` + `remark-gfm`.
- When `format === 'text'`: renders as `<Paragraph className={styles.paragraph}>` (backward compat).
- All Markdown elements styled via `createStyles` with `token.*`:
  - `h1/h2/h3`: font-size scale, `font-weight: 600`, `margin: 1.2em 0 0.4em`
  - `blockquote`: `border-left: 3px solid ${token.colorPrimary}`, `padding-left: 12px`,
    `color: ${token.colorTextSecondary}`, `margin: 8px 0`
  - `hr`: `border: none; border-top: 1px solid ${token.colorBorderSecondary}; margin: 20px 0`
  - `p`: `line-height: 1.8; margin: 0 0 12px`
  - `a`: `color: ${token.colorLink}`
  - `code/pre`: `background: ${token.colorFillAlter}`, `border-radius: 4px`
- Wraps in the same `styles.fullContent` card that `NewsDetailBody` currently uses for the
  full-content box (border + rounded corners).

### Updated `NewsDetailBody`

- Replace bare `<Paragraph>` for `item.text` with `<NewsTextBlock>`.
- Replace `<Paragraph>{item.fullContent}</Paragraph>` with
  `<NewsArticleBody content={item.fullContent} format={item.fullContentFormat ?? 'text'} />`.
- The existing Divider between text and full content is kept but restyled if needed.
- The "Load article" button lives inside `NewsTextBlock`'s context (below the text card),
  not inside `NewsArticleBody`.

### Backward compatibility

- Existing `full_content` rows have `full_content_format = 'text'` (DB DEFAULT).
- `NewsItem.fullContentFormat` is optional; if absent (old API response), defaults to `'text'`.
- No bulk re-extraction of old articles — users who want Markdown formatting can hit
  "Load article" again (the route overwrites `full_content` + sets `full_content_format`).

### Dependencies to install

```
npm install turndown @types/turndown          # server (HTML → Markdown)
npm install react-markdown remark-gfm         # client
```

---

## Testing Decisions

There are **no existing automated tests** in this codebase. Given that, testing decisions are:

### What constitutes a good test for this feature

A good test verifies *observable output* of a module given known input — not internal structure.
For `buildFullContent`, that means: given an `ExtractedContent` with known HTML, assert the
Markdown string output has correct headings/blockquotes/links. It does **not** test which
library is used internally.

### Modules worth unit-testing (when a test suite is introduced)

- **`readability.ts → buildFullContent`** — pure function, no I/O. Input: `ExtractedContent`
  with HTML fragments. Assertions: headings become `#`, blockquotes become `>`, links preserved.
- **`NewsArticleBody`** — if a component test harness is set up (Vitest + Testing Library):
  given `format='markdown'` input with `## Title`, assert an `<h2>` appears in the DOM;
  given `format='text'` input, assert plain `<p>` appears without heading markup.

### Modules not worth testing in isolation

- `NewsTextBlock` — purely presentational (wraps text in a div with CSS classes); visual
  correctness is verified by human review.
- DB migration (`migrate.ts`) — idempotent ALTER TABLE; verified by running `npm run db:migrate`
  twice and checking no error.

---

## Out of Scope

- **Telegram Instant View (MTProto IV protocol)** — fetching actual IV content via the Telegram
  API is a separate feature requiring MTProto IV calls. This PRD only targets web-article
  extraction styled *like* IV, not actual IV.
- **Bulk re-migration of existing `full_content` rows** — old plain-text articles continue to
  render as plain text. Users trigger re-extraction manually.
- **`NewsListItem` restyling** — list items are for navigation/scanning, not reading.
- **`DigestBody` updates** — Digest already has its own rendering; Markdown in full_content
  can be addressed in a separate tech-debt ticket ("Дайджест для `news_link`").
- **Code/syntax highlighting** — `remark-highlight` or Prism are out of scope; basic
  `` `inline code` `` and ` ```blocks``` ` via GFM are sufficient.

---

## Further Notes

- `turndown` output quality depends on the source HTML. News sites often have noisy HTML;
  consider adding a `turndown` rule to strip `<figure>` and `<aside>` elements that Readability
  sometimes includes.
- `react-markdown` renders to native HTML elements — the `createStyles` component selector
  approach (e.g., `& h1 { ... }`) works well here since we can't add `className` to markdown
  children directly.
- The `full_content_format` column should be indexed only if future query plans need it —
  currently it's only read by the news GET endpoint, so no index needed.
- Consider `DOMPurify` on the server before passing HTML to `turndown` — though `article.content`
  from Readability is already sanitized, explicit sanitization is defense-in-depth.

