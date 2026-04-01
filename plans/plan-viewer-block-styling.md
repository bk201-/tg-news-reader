# Plan: Стилизация блоков просмотра

> Source PRD: `plans/prd-viewer-block-styling.md`

## Architectural decisions

- **Schema**: новое поле `full_content_format TEXT NOT NULL DEFAULT 'text'` в таблице `news`
- **Key model**: `NewsItem.fullContentFormat?: 'text' | 'markdown'` (optional, backward compat)
- **Server dep**: `turndown` — конвертация HTML → Markdown на сервере
- **Client deps**: `react-markdown` + `remark-gfm` — рендеринг Markdown
- **New components**: `NewsTextBlock` (infoblock-карточка), `NewsArticleBody` (Markdown/text рендерер)
- **No prop threading**: `item.textInPanel === 1` уже достаточно для подавления зоны 2; `channelType` не нужен
- **Backward compat**: старые строки с `full_content_format = 'text'` рендерятся как plain text без изменений

---

## Phase 1: DB + API foundation

**User stories**: #10 (backward compat)

### What to build

Добавить поле `full_content_format` в БД и прокинуть его до клиента через shared type и news endpoint.
После фазы все существующие новости возвращают `fullContentFormat: 'text'` — никакого UI, но
фундамент для следующих фаз готов.

### Acceptance criteria

- [ ] `full_content_format TEXT NOT NULL DEFAULT 'text'` присутствует в `schema.ts`
- [ ] `migrate.ts` содержит идемпотентный ALTER TABLE для нового поля
- [ ] `npm run db:migrate` проходит без ошибок
- [ ] `NewsItem` в `shared/types.ts` содержит `fullContentFormat?: 'text' | 'markdown'`
- [ ] GET `/api/news` возвращает `fullContentFormat: 'text'` для всех существующих записей
- [ ] `npm run build && npm run build:server && npm run lint` — все зелёные

---

## Phase 2: Server Markdown extraction

**User stories**: #3, #4, #5, #6, #10

### What to build

Изменить pipeline извлечения статей: `buildFullContent` теперь возвращает Markdown (через `turndown`
из `article.content` Readability). При сохранении результата в БД проставляется `full_content_format = 'markdown'`.
После фазы: загрузить новую статью → в БД `full_content` содержит `# Heading`, `> quote`; старые
записи не затронуты.

### Acceptance criteria

- [ ] `turndown` и `@types/turndown` установлены как зависимости
- [ ] `buildFullContent` возвращает Markdown-строку из `article.content` (HTML) через `turndown`
- [ ] Заголовки HTML (`<h1>`–`<h3>`) конвертируются в `#`/`##`/`###`
- [ ] Blockquotes (`<blockquote>`) конвертируются в `>`
- [ ] Fallback: если `article.content` пуст — использовать `textContent` как plain text (format остаётся `'text'`)
- [ ] `POST /api/content/news/:id` сохраняет `full_content_format: 'markdown'` в БД
- [ ] Download worker (article task) сохраняет `full_content_format: 'markdown'` в БД
- [ ] Повторный вызов для уже сохранённой записи перезаписывает `full_content` и `full_content_format`
- [ ] `npm run build && npm run build:server && npm run lint` — все зелёные

---

## Phase 3: NewsTextBlock — infoblock для текста поста

**User stories**: #2, #8, #9, #11

### What to build

Новый компонент `NewsTextBlock`: bordered infoblock-карточка для `item.text`.
Заменяет голый `<Paragraph>` в `NewsDetailBody`. Подавляется при `textInPanel === 1` (медиа-каналы)
и когда текст пустой. Кнопка "Загрузить статью" остаётся ниже карточки.
Работает в обоих view mode без изменений (list-panel и accordion).

### Acceptance criteria

- [ ] `NewsTextBlock` — отдельный файл, принимает `{ text, children? }` (children = кнопка/ошибка)
- [ ] Стилизован через `createStyles`: `border`, `background: token.colorFillAlter`, `border-radius: 8px`
- [ ] Не рендерится когда `item.textInPanel === 1` (медиа-канал)
- [ ] Не рендерится когда `item.text` пустой
- [ ] Не рендерится когда `canLoadArticle === 1` и `fullContent` уже загружен
- [ ] Кнопка "Загрузить статью" и ошибка отображаются внутри карточки (переданы через `children`)
- [ ] Визуально одинаково в list-panel и accordion режимах
- [ ] `npm run build && npm run lint` — зелёные

---

## Phase 4: NewsArticleBody — Markdown rendering

**User stories**: #3, #4, #5, #6, #7, #10, #12

### What to build

Новый компонент `NewsArticleBody`: рендерит `fullContent` как Markdown (`react-markdown` + `remark-gfm`)
или plain text в зависимости от `format`. Все элементы стилизованы через `createStyles` с токенами
Ant Design — работает в light и dark теме. Заменяет `<Paragraph>` для `fullContent` в `NewsDetailBody`.

### Acceptance criteria

- [ ] `react-markdown` и `remark-gfm` установлены как зависимости
- [ ] `NewsArticleBody` — отдельный файл, props: `{ content: string, format: 'text' | 'markdown' }`
- [ ] `format='markdown'`: заголовки H1–H3 рендерятся с визуальной иерархией
- [ ] `format='markdown'`: blockquotes имеют левый цветной бордер (`token.colorPrimary`)
- [ ] `format='markdown'`: `<hr>` отображается как горизонтальный разделитель
- [ ] `format='markdown'`: ссылки кликабельны, цвет `token.colorLink`
- [ ] `format='text'`: рендерится как `<Paragraph>` — без деградации старых записей
- [ ] Нет hardcoded hex-цветов — только `token.*`
- [ ] В dark theme нет сломанных контрастов
- [ ] `NewsDetailBody` использует `NewsArticleBody` вместо `<Paragraph>` для `fullContent`
- [ ] Существующий Divider между текстом поста и статьёй сохранён
- [ ] `npm run build && npm run lint` — зелёные

