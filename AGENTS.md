# TG News Reader — AI Agent Instructions

## Project Overview

Full-stack personal Telegram news reader. **Backend**: Hono (Node.js) + SQLite via `@libsql/client` + Drizzle ORM. **Frontend**: React 19 + Ant Design 6 + TanStack Query v5 + Zustand. Server runs on port `3173`, Vite dev server on `5173`.

## Key Commands

```bash
npm run dev               # Start both server + client (concurrently)
npm run db:migrate        # Apply DB migrations (always run after schema changes)
npm run tg:auth           # Authenticate Telegram session (writes TG_SESSION to .env)
npm run auth:create-user  # Create a new app user account (interactive, writes to DB)
npm run lint              # ESLint check
npm run build             # Vite build + tsc
```

## Before Every Push

Run all four checks — push only if all pass:

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json (server type check)
npm run lint           # ESLint
npm run format:check   # Prettier (read-only check, use format to fix)
```

## Architecture

```
src/
  server/
    config.ts         # Centralised env/config constants (JWT, download limits, media sizes, news fetch)
    index.ts          # Hono app, registers all routers + calls startWorkerPool(DOWNLOAD_WORKER_CONCURRENCY)
    db/
      schema.ts       # Drizzle schema (source of truth for types)
      migrate.ts      # Manual migration runner (CREATE TABLE IF NOT EXISTS + ALTER TABLE)
      index.ts        # libsql client + drizzle instance
    middleware/       # auth.ts (JWT verify), cors.ts, rateLimit.ts (production only, 120 req/min)
    routes/           # channels.ts, news.ts, filters.ts, groups.ts, media.ts, content.ts, downloads.ts, auth.ts
    services/         # telegram.ts (gramjs), readability.ts, channelStrategies.ts,
                      # downloadManager.ts, downloadProgress.ts, mediaProgress.ts
    logger.ts         # Single pino instance — import { logger } from '../logger.js'
  client/
    components/       # Auth/ (AuthGate, LoginPage), Channels/, News/, Filters/, Layout/
                      # Channels/: ChannelSidebar, ChannelItem, ChannelFormModal, ChannelFetchModal,
                      #            GroupPanel (coordinator), GroupItem, GroupFormModal, GroupPinModal
                      # Layout/:   AppLayout (shell + URL sync), AppHeader (header + user menu + lang switcher),
                      #            TotpSetupModal (2FA flow), DownloadsPanel (badge + Drawer + SSE),
                      #            DownloadsPinnedContent (inline sidebar), DownloadTaskList (shared task list)
                      # News/:     NewsFeed (coordinator), NewsFeedToolbar, NewsFeedList, NewsAccordionList,
                      #            NewsAccordionItem, NewsListItem, NewsDetail (state+hotkeys),
                      #            NewsDetailToolbar, NewsDetailBody (media+text+modal), NewsDetailMedia,
                      #            NewsDetailTopPanel; hooks: useHashTagSync, useMobileBreakpoint, useNewsHotkeys
    api/              # React Query hooks + helpers: channels.ts, news.ts, groups.ts, filters.ts, downloads.ts,
                      # mediaProgress.ts, mediaUrl.ts; central fetch client: client.ts
    services/
      serviceWorker.ts  # SW registration (prod-only) + messaging helpers (getSwStats, clearSwCache)
    store/
      uiStore.ts      # Zustand UI store (selectedChannelId, selectedGroupId, selectedNewsId, theme, etc.)
      authStore.ts    # Zustand auth store (accessToken, user, unlockedGroupIds, isCheckingAuth)
    i18n.ts           # i18next init: EN default, RU fallback, persisted in localStorage
    locales/
      en/translation.json   # English strings (primary)
      ru/translation.json   # Russian strings (fallback)
    styles.css        # Global reset only (10 lines) — all component styles live in createStyles
  shared/types.ts     # Shared TS interfaces (Channel, Group, NewsItem, Filter, DownloadTask)
```

## DB Migration Pattern

**No Drizzle migrations folder** — uses `src/server/db/migrate.ts` directly:
1. `CREATE TABLE IF NOT EXISTS` blocks for initial schema
2. `alterMigrations` array with `ALTER TABLE` statements wrapped in try/catch (idempotent)
3. One-time data fixups after the loop
4. Always run `npm run db:migrate` after editing `schema.ts`

## Routing Convention

- All API routes mounted under `/api/` in `server/index.ts`
- Each route file exports a Hono `router` as default
- `/api/auth/*` is **public** (login/refresh/logout) — no auth middleware applied
- `/api/health` is public; all other `/api/*` routes require a valid JWT
- `channels.ts` exports `getSinceDate()` helper (used by the fetch route). `count-unread` intentionally does **not** use `getSinceDate` — it uses `lastFetchedAt` directly to avoid double-counting already-fetched unread messages.

## Auth System

JWT-based auth with httpOnly refresh-cookie rotation and optional TOTP:

- **`users` table**: `id, email, password_hash, totp_secret (null=disabled), role, created_at`
- **`sessions` table**: `id (UUID), user_id, refresh_token_hash, expires_at, unlocked_group_ids (JSON), user_agent, ip, created_at`
- **Access token**: short-lived JWT (15 min), signed HS256 — payload: `{ sub, role, sessionId, unlockedGroupIds, exp }`. Secret: `JWT_SECRET` env var (throws in production if unset).
- **Refresh token**: UUID stored as bcrypt hash in `sessions`; sent/read as httpOnly `refresh_token` cookie (`sessionId:token` format).
- **Flow**: `POST /api/auth/login` → returns `{ accessToken }` + sets cookie; `POST /api/auth/refresh` → reads cookie, issues new access token; `POST /api/auth/logout` → deletes session + clears cookie.
- **TOTP**: `GET /api/auth/totp/setup` (generate QR), `POST /api/auth/totp/confirm` (verify + save), `DELETE /api/auth/totp` (disable). Uses `otpauth` + `qrcode`.
- **Session management**: `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` (protected).
- **Client `authStore`** (`src/client/store/authStore.ts`): holds `accessToken | null`, `user`, `unlockedGroupIds: number[]` (parsed from JWT payload), `isCheckingAuth`.
- **`AuthGate`** (`src/client/components/Auth/AuthGate.tsx`): wraps the whole app; on mount calls `POST /api/auth/refresh` to restore session from cookie; shows `<LoginPage>` when unauthenticated.
- **`client.ts`** (`src/client/api/client.ts`): central `api.{get,post,patch,delete}` wrapper — automatically retries with a refreshed token on 401 (one retry only, not for `/auth` paths).
- **Create first user**: `npm run auth:create-user` (interactive CLI, writes to DB).

## Channel Strategy Pattern

Channel post-processing is implemented as the Strategy pattern in `src/server/services/channelStrategies.ts`:

| Strategy class | `channelType` | `postProcess` behaviour | `requiresMediaProcessing` |
|---|---|---|---|
| `NoneStrategy` | `'none'` | no-op | always `false` |
| `LinkContinuationStrategy` | `'link_continuation'` | no-op (content loaded on demand) | always `false` |
| `MediaContentStrategy` | `'media_content'` | calls `enqueueTask(newsId, 'media', undefined, 0)` for each media post | `true` when any message has `rawMedia` |

Use `getChannelStrategy(channelType)` factory to get the right instance. Adding a new channel type = new class + one line in `strategyMap`. The fetch route returns `{ inserted, total, mediaProcessing }` — `mediaProcessing: true` signals the client to open the media-progress SSE.

## Download Manager

All async work (media downloads, article extraction) goes through `src/server/services/downloadManager.ts`:

- **`downloads` table**: `id, news_id (→ news ON DELETE CASCADE), type ('media'|'article'), url, priority (0=background, 10=user), status, error, created_at, processed_at` + `UNIQUE(news_id, type)`
- **`enqueueTask(newsId, type, url?, priority=0)`** — INSERT with `onConflictDoUpdate` that keeps `MAX(priority)` and resets `failed → pending`
- **`startWorkerPool(n)`** — called in `server/index.ts` with `DOWNLOAD_WORKER_CONCURRENCY` (env, default 10); resets `processing → pending` on startup (crash recovery)
- **Priority**: background=0 (media strategy auto-queue), user-initiated=10 (Download button); size limits bypassed for priority≥10
- **Auto-cleanup**: done tasks deleted after `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` seconds (env, default 30)
- **SSE stream**: `GET /api/downloads/stream` — sends `init` event on connect, then `task_update` events; consumed by `useDownloadsSSE()` in `DownloadsPanel`
- **REST**: `GET/POST /api/downloads`, `PATCH /api/downloads/:id/prioritize`, `DELETE /api/downloads/:id`

Client: `src/client/api/downloads.ts` — `useDownloads()`, `useCreateDownload()`, `usePrioritizeDownload()`, `useCancelDownload()`, `useNewsDownloadTask(newsId, type)`, `useDownloadsSSE()`

`DownloadsPanel` (in `AppLayout` header) mounts `useDownloadsSSE()` once for the whole app lifetime.

## Media Progress SSE

Real-time progress for bulk media fetches (used by `media_content` channels):

- **`mediaProgressEmitter`** (`src/server/services/mediaProgress.ts`): process-wide `EventEmitter`; emits on `channel:{id}` with events `item | complete | aborted`.
- **Endpoint**: `GET /api/channels/:id/media-progress` — SSE stream; closes on `complete`/`aborted` or 5-min timeout.
- **Client hook**: `useMediaProgressSSE(channelId, key, onProgress?, onComplete?)` in `src/client/api/mediaProgress.ts` — updates `['news', channelId]` cache in-place as each item arrives; `key` forces reconnect on each fetch.

## State Management

`uiStore` (Zustand, `src/client/store/uiStore.ts`) holds:
- `selectedChannelId` / `selectedGroupId` (null = "Общее") / `selectedNewsId`
- `showAll`, `filterPanelOpen`, `hashTagFilter`
- `downloadsPanelPinned` — persisted in `localStorage`; when true, panel renders as inline sidebar
- `pendingCounts` — messages in Telegram fetched after `lastFetchedAt`, not yet in DB; used in **both** `ChannelSidebar` and `GroupPanel` badge calculations (`unreadCount + pendingCounts[channelId]`)
- `isDarkTheme` — persisted in `localStorage`

`authStore` (Zustand, `src/client/store/authStore.ts`) holds:
- `accessToken: string | null` — JWT access token (in-memory only)
- `user: { id, email, role, hasTOTP }` — current user
- `unlockedGroupIds: number[]` — groups whose PIN was verified (decoded from JWT, survives refresh)
- `isCheckingAuth: boolean` — true during initial session restore

## Groups System

- `groups` table: `id, name, color, pin_hash, sort_order, created_at`
- `channels.group_id` → FK to `groups.id` ON DELETE SET NULL
- `GroupPanel` (72px wide) is a coordinator component — rendering is split into:
  - `GroupItem` — single group button (icon, badge, context menu); mirrors `ChannelItem` pattern
  - `GroupFormModal` — create/edit modal; exports `PRESET_COLORS` and `GroupFormValues`
  - `GroupPinModal` — PIN unlock modal with `Input.OTP`; auto-submits on 4th digit, passes `val` directly to avoid React state batching issues
- Group badge = `unreadCount (DB) + pendingCounts[channelId]` — same formula as `ChannelSidebar`; **both** must be summed or badge will be stale after "Обновить"
- `selectedGroupId === null` → "Общее" (channels where `group_id IS NULL`)
- PIN hashed with `bcryptjs` (saltRounds=10), verified via `POST /api/groups/:id/verify-pin`
- On successful PIN verification the server updates `sessions.unlocked_group_ids` and issues a **new access token** with the updated `unlockedGroupIds` list — unlocked groups persist across page refreshes for the duration of the session. Client receives `{ success, accessToken, unlockedGroupIds }` and calls `authStore.updateToken()`.

## Client API Pattern

Each entity has a dedicated file in `src/client/api/` using TanStack Query:
```ts
export function useThings() { return useQuery(...) }
export function useCreateThing() { return useMutation({ onSuccess: () => qc.invalidateQueries(...) }) }
```

All fetch calls go through `api` from `src/client/api/client.ts`, which attaches `Authorization: Bearer <token>` and auto-refreshes on 401.

## Component Size & Splitting Rules

**Keep components small and focused — this is non-negotiable.**

- **One component per file.** Never put multiple exported components in one file unless they are tiny private helpers (< 10 lines) used only by that file.
- **200-line hard limit.** A screen shows ~60–64 lines at a time. A 200-line component already spans 3+ screens — it's hard to read and reason about. If a component approaches or exceeds 200 lines, split it.
- **Split proactively.** If a JSX block can be meaningfully extracted — do it. Prefer more files over larger files.
- **Refactoring is always welcome.** Don't hesitate to create new files and move code around. Examples from this codebase:
  - `GroupPanel` → `GroupItem` + `GroupFormModal` + `GroupPinModal` + slim coordinator
  - `AppLayout` → `AppHeader` + `TotpSetupModal` + slim layout shell
  - `DownloadsPanel` → `DownloadTaskList` + `DownloadsPinnedContent` + slim panel
- **Coordinator pattern**: when a component has complex state + multiple visual regions, extract each region into its own component and keep the parent as a thin coordinator (state + handlers + composition only).

## CSS Conventions

**All component styles use `createStyles` from `antd-style` — no global CSS classes.**  
`styles.css` contains only a global reset (`* { box-sizing: border-box }` + `body` defaults).

### Standard pattern

```tsx
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, token }) => ({
  item: css`
    background: ${token.colorBgContainer};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    &:hover { background: ${token.colorFillTertiary}; }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
  `,
}));

function MyComponent() {
  const { styles, cx } = useStyles();
  return <div className={cx(styles.item, isActive && styles.itemActive)} />;
}
```

- Use `token.*` for all theme-aware values (colors, borders, etc.) — **never** hardcode hex colors
- Use `cx(styles.a, condition && styles.b)` for conditional class merging
- Use `theme.useToken()` from `antd` to access tokens in component logic (e.g. inline styles)

 ### No inline `style={{}}` — use `createStyles` instead

**All styles must live in `createStyles`, including layout and structural styles.** The only permitted exceptions for `style={{}}` are truly runtime-dynamic values that can't be expressed as static CSS:

```tsx
// ✅ OK — value is a runtime variable (group color from DB)
<FolderFilled style={{ color: group.color }} />

// ✅ OK — conditional cursor based on prop
<Tag style={{ cursor: onTagClick ? 'pointer' : 'default' }} />

// ❌ Wrong — hardcoded color, must use token
<WarningOutlined style={{ color: '#ff4d4f' }} />   // → token.colorError in createStyles

// ❌ Wrong — structural layout, must use createStyles
<div style={{ display: 'flex', gap: 8 }} />

// ❌ Wrong — CSS variable fallback, must use token in createStyles
<span style={{ color: 'var(--some-var, #666)' }} />  // → token.colorTextSecondary
```

Token equivalents for common hardcoded values:
- `#fff` on colored backgrounds → `token.colorTextLightSolid`
- `'green'` for success icons → `token.colorSuccess`
- `'#ff4d4f'` for error/warning → `token.colorError`
- `'#888'` / `'#666'` secondary text → `token.colorTextSecondary`
- `'#f5f5f5'` background fills → `token.colorFillAlter`

### Dynamic param styles (used in AppHeader, GroupItem)

When styles depend on a boolean flag or runtime value that changes the layout, pass it as a second argument:

```tsx
// AppHeader: sidebarInDrawer changes padding/gap/color
const useStyles = createStyles(({ css, token }, sidebarInDrawer: boolean) => ({
  header: css`
    background: ${token.colorPrimary};
    padding: ${sidebarInDrawer ? '0 12px' : '0 24px'};
  `,
}));
const { styles } = useStyles(sidebarInDrawer);  // antd-style caches per unique param

// GroupItem: group color drives radial-gradient background
const useGroupItemStyles = createStyles(({ css, token }, color?: string) => {
  const c = color ?? token.colorPrimary;
  return { item: css`background: color-mix(in srgb, ${c} 15%, transparent);` };
});
const { styles } = useGroupItemStyles(group.color);
```

### Cross-component child targeting

To remove a border from a child component inside a wrapper (e.g. accordion), use the structural selector — **not** a class name, since `createStyles` generates hashed class names:

```tsx
item: css`
  border-bottom: 1px solid ${token.colorBorderSecondary};
  & > div:first-child { border-bottom: none; }  /* removes child's own border */
`,
```

### Container Queries

Declare `container-type: inline-size` on the parent in its `createStyles`, then use `@container` in child component styles:

```tsx
// parent
header: css`container-type: inline-size;`

// child (separate createStyles)
btnText: css`@container (max-width: 540px) { display: none; }`
```

- Ant Design dark/light theme toggled via `ConfigProvider` in `main.tsx`

## Security — NEVER Read or Print

**NEVER read, display, or include in output the contents of `.env`** — it contains `TG_SESSION` (a live Telegram auth token equivalent to full account access), `TG_API_HASH`, and other secrets.

If a task requires knowing env variable names, refer to the list in `ROADMAP.md` (section 9, "Переменные окружения") — names only, never values.  
To rotate the session: `npm run tg:auth` (interactive), then terminate the old session in Telegram → Settings → Active Sessions.

## Auth for Browser-Native Requests

**`EventSource`, `<img src>`, `<video src>` cannot send `Authorization` headers.** Use `?token=` query param instead — `authMiddleware` accepts both forms:

```ts
// ✅ correct pattern (see mediaUrl.ts, useDownloadsSSE)
const token = useAuthStore.getState().accessToken;
const url = `/api/some/stream?token=${encodeURIComponent(token)}`;
const es = new EventSource(url);

// ❌ wrong — EventSource ignores custom headers
new EventSource('/api/some/stream', { headers: { Authorization: '...' } });
```

Always add `accessToken` to `useEffect` deps so the connection re-creates on token refresh.

Use `mediaUrl(localMediaPath)` from `src/client/api/mediaUrl.ts` to generate authenticated `/api/media/…` URLs for `<img>`/`<video>` tags.

## Media Files

- Downloaded to `data/{telegramId}/{filename}` on server disk
- Served via `GET /api/media/:channel/:filename` — supports **HTTP Range requests** (`206 Partial Content`) so browsers can seek videos; always returns `Accept-Ranges: bytes`
- Downloads managed by `downloadManager.ts` — background tasks use size limits (photos ≤ `MAX_PHOTO_SIZE_MB` MB, videos ≤ `MAX_VIDEO_SIZE_MB` MB, image-docs ≤ `MAX_IMG_DOC_SIZE_MB` MB; all env-configurable, defaults 5/75/5); user-initiated (`priority ≥ 10`) bypass limits
- Progress visible in `DownloadsPanel` (header badge + Drawer) via SSE

## Logging

All server-side logging goes through `src/server/logger.ts` — a single **pino** instance:

```ts
import { logger } from '../logger.js'; // adjust relative path

logger.info({ module: 'channels', channelId, inserted }, 'fetch done');
logger.warn({ module: 'telegram', channelId, err }, 'channel unavailable');
logger.error({ module: 'download', workerId, err }, 'worker crashed');
```

- **Dev**: pino-pretty (colourised, `HH:MM:ss`, no pid/hostname)
- **Prod**: JSON to stdout → consumed by Azure Log Analytics automatically
- **Level**: `LOG_LEVEL` env var (default: `debug` in dev, `info` in prod)
- Always include `module` field (`'http'`, `'auth'`, `'channels'`, `'download'`, `'telegram'`, etc.)
- **Never log**: tokens, passwords, email addresses, `TG_SESSION` — only IDs and status codes
- `index.ts` registers `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers
- `rateLimit.ts` logs rate-limit hits with IP + path at `warn` level
- `routes/auth.ts` logs login failures with IP + `reason` field (no credentials in log)

## Service Worker (Media Cache)

`public/sw.js` — vanilla JS Service Worker, **Cache-First** strategy for `/api/media/*`:

- Strips `?token=` from cache key so JWT rotation doesn't bust the cache
- Max 2000 entries, 30-day TTL (configurable via `postMessage`)
- `src/client/services/serviceWorker.ts` — typed registration helper; **only registers in `PROD`** (`import.meta.env.DEV` check) to avoid interfering with Vite HMR
- Registered in `main.tsx` via `registerMediaServiceWorker()`
- **"Clear media cache"** button in `AppHeader` user menu calls `clearSwCache()` with confirm dialog
- Message API: `GET_STATS` → `SwStats`, `CLEAR_CACHE`, `SET_LIMITS { maxEntries, maxAgeDays }`

## Localization (i18n)

**Stack**: `react-i18next` + `i18next` + `i18next-browser-languagedetector`

- **Default language: English (`en`)**, Russian (`ru`) as fallback
- Language choice persisted in `localStorage` key `i18nextLng`
- Config: `src/client/i18n.ts` — imported as side effect in `main.tsx` (`import './i18n'`)
- Translation files: `src/client/locales/en/translation.json` (primary) and `ru/translation.json` (fallback)
- Ant Design locale switches reactively in `main.tsx`: `i18n.language.startsWith('ru') ? ruRU : enUS`
- Language switcher in `AppHeader` user menu — `TranslationOutlined` + `Select`

**Pattern — every component with UI strings must use `useTranslation`:**
```tsx
import { useTranslation } from 'react-i18next';
function MyComponent() {
  const { t } = useTranslation();
  return <Button>{t('mySection.myKey')}</Button>;
}
```

**Rules:**
- Always add new keys to **both** `en/translation.json` AND `ru/translation.json`
- Keys are namespaced by section: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `filters.*`, `downloads.*`, `auth.*`, `header.*`, `common.*`
- For `Modal.confirm` use `t()` for `title`, `content`, `okText`, `cancelText`
- Interpolation: `t('channels.updated', { date })` → `"updated": "Updated: {{date}}"`
ся- **Never hardcode Russian or English UI strings directly in JSX** — always use `t()`. This includes button labels, tooltips, aria-labels, Modal strings, and `message.success()` toasts.

## News View Architecture

Two view modes toggled by `newsViewMode` in `uiStore` (persisted to `localStorage`):

| Mode | Layout | Default |
|---|---|---|
| `'list'` | 2-pane: `NewsFeedList` (380px) + `NewsDetail` panel | Desktop |
| `'accordion'` | Single column: `NewsAccordionList` → `NewsAccordionItem` | Mobile (< 768px) |

**Responsive override**: `useMobileBreakpoint(768)` in `NewsFeed` → `effectiveViewMode = isMobile ? 'accordion' : newsViewMode`. View-toggle buttons are hidden on mobile.

**Shared components** — both modes reuse: `NewsListItem` (collapsed accordion row), `NewsDetail` (expanded accordion body), all `NewsDetail*` sub-components.

**`NewsDetail` variant pattern**:
```tsx
// panel (default): sticky header, fixed height, date+tags in toolbar left
<NewsDetail item={item} channelType={...} variant="panel" />

// inline (accordion expanded): static header, auto-height, title+date+tags in toolbar left,
// left area is clickable to collapse the accordion item
<NewsDetail item={item} channelType={...} variant="inline" onHeaderClick={() => onSelect(null)} />
```

**Known keyboard caveat**: `NewsDetail`'s `keydown` handler excludes `input / textarea / button / a` but NOT `video`. `useNewsHotkeys` intercepts `ArrowUp`/`ArrowDown` globally and calls `e.preventDefault()` — this blocks native video volume-control keys when the `<video>` element has focus. Arrow Left/Right (seek) are not blocked. If editing hotkey logic, add `tag === 'video'` to the exclusion check.

**Component decomposition** (`src/client/components/News/`):
- `NewsDetail` — state coordinator (queries, album index, top panel, hotkeys, handlers)
- `NewsDetailBody` — pure display: `NewsDetailMedia` + text body + link-select Modal
- `NewsDetailToolbar` — header row; `variant='inline'` shows full title + clickable meta area
- `useHashTagSync(channelId)` — URL hash ↔ `hashTagFilter` sync
- `useMobileBreakpoint(n)` — resize-reactive boolean
- `useNewsHotkeys(items, selectedId, setId, onSpace)` — ↑↓Space keyboard nav

**`uiStore` fields added for news view**:
- `newsViewMode: 'list' | 'accordion'` — user preference, persisted
- `NewsViewMode` type exported from `uiStore.ts`

