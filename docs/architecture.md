# TG News Reader — Architecture & Implementation Notes

> Detailed notes on implemented features. For the living codebase architecture see `AGENTS.md`.

---

## 1–4. Sidebar: Segmented, badges, splitter, adaptive buttons

### Toolbar: period buttons (Segmented)

- `[↻]` — standalone button, always clickable; on first fetch syncs read position via `readInboxMaxId` from Telegram; on subsequent fetches uses `lastFetchedAt` (DB boundary)
- `<Segmented>` with periods `[1d][3d][5d][7d][14d]` + `[↺]` (since last sync)
- Resets on channel switch; no initial selection — every click triggers a fetch

### Unread badges

- `unreadCount` in `GET /api/channels` (LEFT JOIN news WHERE is_read = 0)
- Badge = `unreadCount` from the channel list query
- **Refresh** button → `POST /api/channels/count-unread` — counts only, uses `lastFetchedAt`
- `lastFetchedAt` is the DB boundary: everything before it is already stored; only newer messages need to be fetched
- `lastReadAt` is the unread display boundary: used only on first-ever channel fetch to align with Telegram's read position
- ⚠️ `count-unread` uses `lastFetchedAt` directly — using `lastReadAt` would double-count already-fetched unread messages

### Splitter

`<Splitter>` from Ant Design 6, `defaultSize=280`, `min=200`, `max=500`.

### Adaptive buttons (text→icons)

Implemented via **CSS Container Queries** — native browser standard, no JS:

```css
/* container-type: inline-size on parent */
@container (max-width: 300px) {
  .btn-text {
    display: none;
  }
}
```

"Refresh" and "Add" labels hide when sidebar width ≤ 300px.

---

## 5–6. Channel groups with PIN

### DB Schema

```sql
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1677ff',
  pin_hash TEXT,        -- bcrypt(pin, saltRounds=10) or NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- channels: added group_id (FK → groups ON DELETE SET NULL) and sort_order
```

### Implementation

- `GroupPanel` — 72px left panel; buttons with `FolderFilled` in group color, radial-gradient bg via `color-mix`
- Group badge = sum of `unreadCount` for all channels in the group
- `selectedGroupId === null` → "General" (channels without group_id)
- PIN: `bcrypt(pin, 10)` → `POST /api/groups/:id/verify-pin` → `unlockGroup(id)` in uiStore (in-memory)
- After PIN verification, server updates `sessions.unlocked_group_ids` and issues a new access token

### API

```
GET    /api/groups
POST   /api/groups
PUT    /api/groups/:id          (pin: null = remove PIN)
DELETE /api/groups/:id          (channels → group_id = null)
POST   /api/groups/:id/verify-pin
```

---

## 9. Authentication (password + TOTP 2FA + JWT)

### DB Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- bcrypt(password, 12)
  totp_secret TEXT,              -- NULL = 2FA disabled
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID v4
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  unlocked_group_ids TEXT NOT NULL DEFAULT '[]',
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Token strategy

- **Access token**: JWT 15 min, in-memory only (NOT localStorage), payload: `{ sub, role, sessionId, unlockedGroupIds }`
- **Refresh token**: UUID 7 days, httpOnly cookie (`sessionId:token`), bcrypt hash in sessions

### Routes

```
POST   /api/auth/login           email + password [+ totp_code]
POST   /api/auth/refresh         refresh cookie → new access token
POST   /api/auth/logout          delete session + clear cookie
GET    /api/auth/totp/setup      QR code for 2FA
POST   /api/auth/totp/confirm    verify and activate
DELETE /api/auth/totp            disable 2FA
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
```

---

## 10. Service Worker media cache

`public/sw.js` — **Cache-First** for `GET /api/media/*`:

- Strips `?token=` from cache key — JWT rotation doesn't bust the cache
- Max 2000 entries, 30-day TTL (configurable via `postMessage`)
- Registers in production only (`import.meta.env.DEV` guard)
- `getSwStats()` → `SwStats`; "Clear media cache" button in AppHeader → `clearSwCache()`

---

## 11. Logging

Stack: `pino` (JSON in prod, pino-pretty in dev). Level: `LOG_LEVEL` env (default `debug`/`info`).

| Level   | Event                                                          |
| ------- | -------------------------------------------------------------- |
| `info`  | Server start, channel fetch (inserted/total), download done    |
| `warn`  | Task failed, Telegram unavailable, auth fail (no email in log) |
| `error` | Unhandled exception, worker crash                              |
| `debug` | (dev only) Telegram request details                            |

Structure: `{ level, time, module, ...fields, msg }`. In Azure Container Apps, stdout → Log Analytics automatically.

---

## 12. Localization (i18n)

- **react-i18next** + **i18next-browser-languagedetector**
- English by default, Russian fallback; language stored in `localStorage`
- Ant Design locale via `<ConfigProvider locale={antdLocale}>`
- Key namespaces: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `auth.*`, `header.*`, `downloads.*`, `filters.*`, `common.*`

---

## 13. Download Manager

### DB Schema

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES news ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'media' | 'article'
  url TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at INTEGER,
  processed_at INTEGER,
  UNIQUE(news_id, type)
);
```

### Worker pool architecture

`downloadManager.ts` is a **coordinator** (main thread); actual work runs in `worker_threads`:

```
Main thread (DownloadCoordinator)
  ├── polls DB for pending tasks
  ├── dispatches { type:'task', payload } to an available worker
  ├── routes tg:* IPC messages → telegramBridge (gramjs lives in main thread)
  └── emits SSE events via downloadProgressEmitter

Worker thread (downloadWorker.ts / downloadWorkerShim.mjs)
  ├── 'article' task: fetch HTML → parseHtml() with jsdom + Readability (CPU-bound,
  │    does NOT block main event loop) → writes fullContent to DB via own libsql connection
  └── 'media' task:   sends tg:downloadMedia IPC → awaits tg:result/tg:error reply
                       → writes localMediaPath(s) to DB
```

**File-reference freshness** (`telegramBridge.ts`): every `tg:downloadMedia` IPC call starts with `fetchMessageById(channelTelegramId, msgId)` to get a fresh `rawMedia` object before calling `downloadMedia()`. Telegram file references have a TTL; re-fetching on every attempt (not just on retry) means stale references are never used and the "file reference expired" error cannot occur.

**Dev vs prod worker entry-point:**

- **Dev**: `downloadWorkerShim.mjs` — plain `.mjs` that calls `register('tsx/esm')` then dynamically imports `downloadWorker.ts`; the only reliable way to activate tsx hooks in `worker_threads` with Node.js 22.12+.
- **Prod**: `downloadWorker.js` (compiled) — loaded directly, no loader needed.

**jsdom / Readability loading**: lazy-loaded on first article task per worker (avoids ~2 s / ~100 MB startup cost for media-only workers); each thread has its own module scope — no shared state.

### Public API

- `enqueueTask(newsId, type, url?, priority=0)` — INSERT with `onConflictDoUpdate`, resets failed → pending, keeps MAX(priority)
- `startWorkerPool(n)` — called in `server/index.ts`; resets `processing → pending` on startup (crash recovery)
- Priorities: 0 = background (size limits apply), 10 = user-initiated (size limits bypassed)
- Pool circuit breaker: ≥ ⌈N × ratio⌉ crashes in sliding window → `logger.fatal` + `sendAlert` + `process.exit(1)`
- Auto-cleanup of done tasks after `DOWNLOAD_TASK_CLEANUP_DELAY_MS` ms (default 30 s)
- SSE: `GET /api/downloads/stream` — `init` + `task_update` events
- `DownloadsPanel` / `DownloadsPinnedContent`: when both `media` and `article` tasks are active, the task list renders two sections ("Media" / "Articles") separated by a labelled divider.

---

## 16. Azure deployment

- `newsViewMode: 'list' | 'accordion'` in `uiStore` (persisted to localStorage)
- `effectiveViewMode` in `NewsFeed` — forces accordion on mobile (`< 768px`)
- `NewsDetail` variant: `'panel'` (list mode) and `'inline'` (accordion)
- Sticky accordion header: `position: sticky; top: 0; z-index: 10`

---

## 15. Adaptive layout

- BP constants: `BP_SM/MD/LG/XL/XXL` = Ant Design breakpoints
- `<Splitter>` only on `xxl` (≥ 1600px); sidebar in `<Drawer>` on `< xxl`
- `DownloadsPanel` pinned mode only on `xxl`
- Open issues: touch targets (hashtag tags and checkbox); Safari iOS Splitter not active on touch

---

## 16. Azure deployment

### Stack

| Component             | Service                          | ~Cost/mo |
| --------------------- | -------------------------------- | -------- |
| Backend (Hono + Node) | Container Apps                   | ~$5–15   |
| DB                    | Turso                            | $0–29    |
| Images                | Azure Container Registry (Basic) | $5       |
| SSL                   | Container Apps TLS               | ~$0.5    |

### Container App configuration

- Scale: `minReplicas=0`, `maxReplicas=10`, **`cooldownPeriod=1800`** (30 min — updated 2026-03-28)
- Base image: `node:22-bookworm-slim` (glibc — compatible with `@libsql/client` and `jsdom`)
- Multi-stage Dockerfile: builder → runner (prodDeps only + `dist/`)
- Full env vars reference: [docs/azure.md](azure.md)

### Turso note

`db/index.ts` runs `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;` **only when `DATABASE_URL` is not set** (i.e. local SQLite). On Turso, `client.executeMultiple` with PRAGMA statements returns HTTP 400 — these settings are managed server-side on Turso anyway.

---

## 17. Monitoring & fail detection

### Azure Monitor Alerts (deployed in `personal-apps-rg`)

| Rule                   | Trigger                | Window                          | Delay   |
| ---------------------- | ---------------------- | ------------------------------- | ------- |
| `tg-reader-error-logs` | KQL: `log.level >= 50` | 5 min                           | 1–5 min |
| `tg-reader-restart`    | `RestartCount > 1`     | **15 min** (updated 2026-03-28) | 1–5 min |

Recreate: `scripts/setup-monitoring.sh`. PowerShell: `az rest --body @file.json`.

### alertBot

`src/server/services/alertBot.ts` — no-op when env vars absent. Fires on:
`uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, server startup (prod).

### Alert stack

| Event                                             | Channel                                 | Delay     |
| ------------------------------------------------- | --------------------------------------- | --------- |
| `uncaughtException` / worker crash / circuit OPEN | alertBot → Telegram                     | immediate |
| Deploy failed (CI)                                | GitHub Actions → Telegram               | immediate |
| `logger.error/fatal`                              | Azure Monitor KQL → email               | 1–5 min   |
| Container restart / OOM                           | Azure Monitor Metric → email            | 1–5 min   |
| Server unreachable                                | UptimeRobot → Telegram/email (optional) | ≤5 min    |

---

## 18. Accessibility (a11y)

### Implemented

- **Tab navigation**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter/Space) on `ChannelItem`, `GroupItem`, `NewsListItem`
- **ARIA**: `<nav aria-label>` on `ChannelSidebar` and `GroupPanel`; `role="listbox"` on news lists; `aria-expanded` on `NewsAccordionItem`
- **Focus-visible**: `outline: 2px solid token.colorPrimary`; double ring for primary buttons; Segmented via `:has(input:focus-visible)`
- **Touch**: `MaybeTooltip` — renders only children without tooltip on `pointer: coarse` (9 files)

### Left for future

- [ ] Skip-link (`<a href="#main-content">`)
- [ ] Focus management on Drawer open/close
- [ ] `DownloadsPanel`: `aria-live="polite"` on task counter
- [ ] `NewsDetailMedia`: `tabIndex` on Prev/Next buttons in album carousel
- [ ] Lighthouse / axe audit (target ≥ 90)

---

## 19. AI digest

### Provider

Single code, two providers via `baseURL`:

```ts
// src/server/services/openaiClient.ts
const client = process.env.AZURE_OPENAI_ENDPOINT
  ? new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### API & limits

```
POST /api/digest
Body: { channelIds?: number[], groupId?: number | null, since?: string, until?: string }
Response: SSE stream (text/event-stream)
```

- If news count > 200 — takes the latest 200
- UI: "Digest ✨" button in toolbar, streams into `<Drawer>` with `react-markdown`

### Content enrichment for `news_link` channels

The digest route joins `channels` and selects `fullContent`, `links`, `canLoadArticle`, `channelType` alongside each news row. Prompt content per item uses `COALESCE(fullContent, text)`:

- Items with `fullContent` already populated → up to `DIGEST_ARTICLE_CONTENT_LIMIT` chars (env, default 1500)
- Items without `fullContent` → `text` capped at 500 chars (legacy behaviour)

### Article prefetch phase (Phase 1)

For `news_link` items where `fullContent IS NULL` and `canLoadArticle = 1`, the digest route runs a prefetch phase **before** starting the AI call:

1. Enqueues an `article` download task at `priority=10` for each such item via `enqueueTask()` — these tasks appear in `DownloadsPanel` automatically.
2. Emits `prefetch_progress { done, total, errors }` SSE events every 500 ms while polling `downloads` + `news` tables.
3. Exits when all tasks settle (`remaining = 0`) or `DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC` elapses (env, default 30 s).
4. Re-fetches `fullContent` for all prefetch items; remaining failures fall back to `text`.
5. Only then begins Phase 2 (AI generation): `ref_map → chunk* → done`.

Client: `DigestDrawer` shows an Ant Design `<Progress type="circle" />` (80 px) during Phase 1 with live `done / total` counter and an error hint when `errors > 0`. Clears on first `chunk` event, transitions to streaming text.

Config: `DIGEST_ARTICLE_CONTENT_LIMIT` (default 1500), `DIGEST_ARTICLE_PREFETCH_TIMEOUT_SEC` (default 30).

### Source link chips

The digest prompt instructs the model to annotate each mentioned news item with `[N]` references (1-based index). The `<Drawer>` renders these as clickable Ant Design `<Tag>` chips — clicking calls `setSelectedNewsId(items[N-1].id)` to navigate directly to the source item in the feed.

---

## 20. Client-side gramjs download (deferred)

**Implementation options:**

- **A**: server returns `{ fileId, accessHash, dcId, fileReference }`, client downloads via gramjs
- **B**: server returns a signed proxy URL

Session sharing: sharing the main session is simpler but less secure. Decide at implementation time.

---

## 21. Media folder download (deferred)

- **File System Access API**: `showDirectoryPicker()` → user picks folder
- Browsers: Chrome/Edge ✅, Safari 15.2+ ✅, **Firefox ❌**
- Depends on item 20 (at least partially)

---

## 22. Filters — hit_count sorting

`filters` table has a `hit_count INTEGER NOT NULL DEFAULT 0` column incremented each time a filter matches a news item during fetch. The Filters panel (`src/client/components/Filters/`) displays a **Hits** column sorted descending by default so the most active filters surface to the top. No extra API changes — `GET /api/filters` returns `hit_count` and sorting is done client-side via the Ant Design `Table` `defaultSortOrder`.

---

## 23. Channel t.me links

Both `ChannelItem` (sidebar) and `NewsFeedToolbar` show an external-link icon button that opens `https://t.me/{channel.telegramId}` in a new tab. The URL is constructed from the `telegramId` field already present on every channel object — no extra API fields required.

---

## 24. Boss key (double Esc)

Double-pressing `Escape` within 500 ms immediately re-locks **all** PIN-protected groups for the current session:

- Listener registered in `AppLayout` (or a top-level hook) on `keydown` with `{ capture: true }`.
- First `Escape` within the window records `lastEscTime`; second `Escape` within 500 ms calls `authStore.lockAllGroups()`.
- `lockAllGroups()` calls `POST /api/auth/sessions/lock-groups` which clears `unlocked_group_ids` in the DB session and returns a new access token with an empty `unlockedGroupIds` list.
- `authStore.updateToken()` replaces the in-memory access token; Zustand `unlockedGroupIds` resets to `[]`.
- Groups whose PIN was not verified become inaccessible again until re-entered.

---

## 25. Error pages

### React crash boundary (`AppErrorBoundary` + `ErrorPage`)

`src/client/components/AppErrorBoundary.tsx` wraps the entire React tree in `main.tsx`. On an unhandled render error it shows `ErrorPage` — a centered card with a floating emoji animation, the error message, and a **Retry** button that calls `window.location.reload()`. The boundary also logs the error via the client logger (`logger.error`).

### Server HTML error pages (Hono)

`src/server/index.ts` registers:

```ts
app.notFound((c) => c.html(errorHtml('404', 'Page not found'), 404));
app.onError((err, c) => c.html(errorHtml('500', err.message, stack), 500));
```

`errorHtml()` is a template literal that:

- Respects `prefers-color-scheme` (dark/light) via a `<style>` media query
- Shows the stack trace only when `NODE_ENV !== 'production'`
- Returns a minimal styled HTML page (no external dependencies)

---

## 27. Mobile UX: pull-to-refresh & compact toolbar

### Pull-to-refresh (`usePullToRefresh`)

`src/client/hooks/usePullToRefresh.ts` — vanilla touch-event hook, no library:

- Activates only at `scrollTop === 0` to avoid conflicting with native browser PTR
- `touchmove` registered as **non-passive** so `preventDefault()` can be called when pulling (skipped if already non-cancelable)
- Direct DOM style mutations on `indicatorRef` — no React re-render during the pull gesture
- Arrow icon rotates 180° when pull distance crosses `THRESHOLD = 72px`; `DAMPEN = 0.55` gives a springy feel
- On `touchend`: if threshold crossed → `onRefresh()`; always snaps indicator back with CSS transition
- Used in `NewsAccordionList` (accordion / mobile mode only, `enabled` prop gates the listeners)

### Compact accordion toolbar (`NewsDetailToolbar` inline variant)

When `variant='inline'` (accordion expanded item), replaces the full button row with a layout that mirrors `NewsListItem` structure:

```
[☐ checkbox]  [title (2-line clamp)]      [✓ primary] [⋯ dropdown]
              [date DD.MM.YY HH:mm]                   [#tags]
```

- **Checkbox** (left, `flex-shrink:0`) — left-hand mark-read, visually identical to collapsed item
- **`✓` button** (right, primary when unread) — right-hand mark-read
- **`⋯` Dropdown** — contains: Refresh, Links (if any, checkmark when active), Text (if any, checkmark when active), Load Article (if applicable), Open
- Date uses `11px / white-space:nowrap` matching `NewsListItem.metaDate` exactly
- Title uses same 2-line `-webkit-line-clamp` as `NewsListItem.title`
- Desktop panel variant (`variant='panel'`) is unchanged

---

## 26. Telegram session expiry (AUTH_KEY_UNREGISTERED)

Three-layer response when gramjs throws `AUTH_KEY_UNREGISTERED`:

### Layer 1 — Auto-reconnect (server, `telegramCircuitBreaker.ts`)

`handleAuthKeyUnregistered()` runs before marking the session as expired:

```
1. Calls _reconnectFn() — injected by telegram.ts via setReconnectCallback()
2. _reconnectFn() = () => getTelegramClient()  →  new TelegramClient + client.connect()
3. On success: _sessionExpired stays false, circuit stays closed
4. On failure: _sessionExpired = true  →  sendAlert() + GET /api/health returns sessionExpired: true
```

`_reconnectFn` is a plain `() => Promise<void>` injected at startup to avoid a circular import (`telegram.ts` → `telegramCircuitBreaker.ts` → `telegram.ts`).

### Layer 2 — Push alert (server, `alertBot.ts`)

When auto-reconnect fails, `sendAlert('Telegram session expired …', 'auth-key-unregistered')` fires (5-min dedup). The message includes the remediation command.

### Layer 3 — In-app banner (client)

`TelegramSessionBanner` (`src/client/components/Layout/TelegramSessionBanner.tsx`) is placed in `AppLayout` directly below `AppHeader`:

```tsx
<AppHeader />
<TelegramSessionBanner />   {/* null unless sessionExpired */}
```

- Uses `useHealthStatus()` from `src/client/api/health.ts` — polls `GET /api/health` every **60 s** via TanStack Query
- Health response shape: `{ status, db, telegram: { circuit, sessionExpired } }`
- Renders `<Alert type="error" banner showIcon>` with i18n key `header.session_expired_banner` only when `data.telegram.sessionExpired === true`
- Disappears automatically once `sessionExpired` goes back to `false` (e.g. after redeploy)

---
