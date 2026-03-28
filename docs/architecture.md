# TG News Reader — Architecture & Implementation Notes

> Detailed notes on implemented features. For the living codebase architecture see `AGENTS.md`.

---

## 1–4. Sidebar: Segmented, badges, splitter, adaptive buttons

### Toolbar: period buttons (Segmented)

- `[↻]` — standalone button, always clickable; fetches with `readInboxMaxId` from Telegram (fallback via `getSinceDate`)
- `<Segmented>` with periods `[1d][3d][5d][7d][14d]` + `[↺]` (since last sync)
- Resets on channel switch; no initial selection — every click triggers a fetch

### Unread badges

- `unreadCount` in `GET /api/channels` (LEFT JOIN news WHERE is_read = 0)
- `pendingCounts` in `uiStore` — Telegram messages not yet fetched to DB
- Badge = `unreadCount + pendingCounts[channelId]`
- **Refresh** button → `POST /api/channels/count-unread` — counts only, uses `lastFetchedAt`
- `getSinceDate(channel)` — shared helper for fetch route: `lastReadAt` → `lastFetchedAt` → `-N days`
- ⚠️ `count-unread` intentionally **does NOT** use `lastReadAt` — otherwise already-fetched unread messages would be double-counted

### Splitter

`<Splitter>` from Ant Design 6, `defaultSize=280`, `min=200`, `max=500`.

### Adaptive buttons (text→icons)

Implemented via **CSS Container Queries** — native browser standard, no JS:

```css
/* container-type: inline-size on parent */
@container (max-width: 300px) {
  .btn-text { display: none; }
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
- Group badge = sum of `unreadCount + pendingCounts` for all channels in the group
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

| Level | Event |
|-------|-------|
| `info`  | Server start, channel fetch (inserted/total), download done |
| `warn`  | Task failed, Telegram unavailable, auth fail (no email in log) |
| `error` | Unhandled exception, worker crash |
| `debug` | (dev only) Telegram request details |

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

### Details

- `enqueueTask(newsId, type, url?, priority=0)` — INSERT with `onConflictDoUpdate`, resets failed → pending, keeps MAX(priority)
- `startWorkerPool(n)` — N workers, crash recovery on startup (processing → pending)
- Priorities: 0 = background (size limits apply), 10 = user-initiated (size limits bypassed)
- Auto-cleanup of done tasks after `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` sec (default 30)
- SSE: `GET /api/downloads/stream` — `init` + `task_update` events

---

## 14. Accordion view mode

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

| Component | Service | ~Cost/mo |
|---|---|---|
| Backend (Hono + Node) | Container Apps | ~$5–15 |
| DB | Turso | $0–29 |
| Images | Azure Container Registry (Basic) | $5 |
| SSL | Container Apps TLS | ~$0.5 |

### Container App configuration

- Scale: `minReplicas=0`, `maxReplicas=10`, **`cooldownPeriod=1800`** (30 min — updated 2026-03-28)
- Base image: `node:22-bookworm-slim` (glibc — compatible with `@libsql/client` and `jsdom`)
- Multi-stage Dockerfile: builder → runner (prodDeps only + `dist/`)
- Full env vars reference: [docs/azure.md](azure.md)

---

## 17. Monitoring & fail detection

### Azure Monitor Alerts (deployed in `personal-apps-rg`)

| Rule | Trigger | Window | Delay |
|---|---|---|---|
| `tg-reader-error-logs` | KQL: `log.level >= 50` | 5 min | 1–5 min |
| `tg-reader-restart` | `RestartCount > 1` | **15 min** (updated 2026-03-28) | 1–5 min |

Recreate: `scripts/setup-monitoring.sh`. PowerShell: `az rest --body @file.json`.

### alertBot

`src/server/services/alertBot.ts` — no-op when env vars absent. Fires on:
`uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, server startup (prod).

### Alert stack

| Event | Channel | Delay |
|---|---|---|
| `uncaughtException` / worker crash / circuit OPEN | alertBot → Telegram | immediate |
| Deploy failed (CI) | GitHub Actions → Telegram | immediate |
| `logger.error/fatal` | Azure Monitor KQL → email | 1–5 min |
| Container restart / OOM | Azure Monitor Metric → email | 1–5 min |
| Server unreachable | UptimeRobot → Telegram/email (optional) | ≤5 min |

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

- Sends only `text` (no `fullContent`, no media)
- If news count > 200 — takes the latest 200
- UI: "Digest ✨" button in toolbar, streams into `<Drawer>` with `react-markdown`

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
