# TG News Reader — AI Agent Instructions

## Project Overview

Full-stack personal Telegram news reader. **Backend**: Hono (Node.js) + SQLite via `@libsql/client` + Drizzle ORM. **Frontend**: React 19 + Ant Design 6 + TanStack Query v5 + Zustand. Server runs on port `3173`, Vite dev server on `5173`.

## Key Commands

```bash
npm run dev          # Start both server + client (concurrently)
npm run db:migrate   # Apply DB migrations (always run after schema changes)
npm run tg:auth      # Authenticate Telegram session (writes TG_SESSION to .env)
npm run lint         # ESLint check
npm run build        # Vite build + tsc
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
    index.ts          # Hono app, registers all routers + calls startWorkerPool(10)
    db/
      schema.ts       # Drizzle schema (source of truth for types)
      migrate.ts      # Manual migration runner (CREATE TABLE IF NOT EXISTS + ALTER TABLE)
      index.ts        # libsql client + drizzle instance
    routes/           # channels.ts, news.ts, filters.ts, groups.ts, media.ts, content.ts, downloads.ts
    services/         # telegram.ts (gramjs), readability.ts, channelStrategies.ts,
                      # downloadManager.ts, downloadProgress.ts
  client/
    components/       # Channels/, News/, Filters/, Layout/ (includes DownloadsPanel.tsx)
    api/              # React Query hooks: channels.ts, news.ts, groups.ts, filters.ts, downloads.ts
    store/uiStore.ts  # Zustand store (selectedChannelId, selectedGroupId, theme, etc.)
    styles.css        # All CSS (BEM-like, CSS custom props for theming)
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
- `channels.ts` exports `getSinceDate()` helper (used by count-unread)

## Channel Strategy Pattern

Channel post-processing is implemented as the Strategy pattern in `src/server/services/channelStrategies.ts`:

| Strategy class | `channelType` | `postProcess` behaviour |
|---|---|---|
| `NoneStrategy` | `'none'` | no-op |
| `LinkContinuationStrategy` | `'link_continuation'` | no-op (content loaded on demand) |
| `MediaContentStrategy` | `'media_content'` | calls `enqueueTask(newsId, 'media', undefined, 0)` for each media post |

Use `getChannelStrategy(channelType)` factory to get the right instance. Adding a new channel type = new class + one line in `strategyMap`.

## Download Manager

All async work (media downloads, article extraction) goes through `src/server/services/downloadManager.ts`:

- **`downloads` table**: `id, news_id (→ news ON DELETE CASCADE), type ('media'|'article'), url, priority (0=background, 10=user), status, error, created_at, processed_at` + `UNIQUE(news_id, type)`
- **`enqueueTask(newsId, type, url?, priority=0)`** — INSERT with `onConflictDoUpdate` that keeps `MAX(priority)` and resets `failed → pending`
- **`startWorkerPool(10)`** — called in `server/index.ts`; 10 concurrent workers; resets `processing → pending` on startup (crash recovery)
- **Priority**: background=0 (media strategy auto-queue), user-initiated=10 (Download button); size limits bypassed for priority≥10
- **Auto-cleanup**: done tasks deleted after 30 s
- **SSE stream**: `GET /api/downloads/stream` — sends `init` event on connect, then `task_update` events; consumed by `useDownloadsSSE()` in `DownloadsPanel`
- **REST**: `GET/POST /api/downloads`, `PATCH /api/downloads/:id/prioritize`, `DELETE /api/downloads/:id`

Client: `src/client/api/downloads.ts` — `useDownloads()`, `useCreateDownload()`, `usePrioritizeDownload()`, `useCancelDownload()`, `useNewsDownloadTask(newsId, type)`, `useDownloadsSSE()`

`DownloadsPanel` (in `AppLayout` header) mounts `useDownloadsSSE()` once for the whole app lifetime.

## State Management

`uiStore` (Zustand) holds:
- `selectedChannelId` / `selectedGroupId` (null = "Общее")
- `unlockedGroups: Set<number>` — PIN-verified groups (in-memory, resets on reload)
- `pendingCounts` — unread counts from Telegram not yet fetched
- `isDarkTheme` — persisted in `localStorage`

## Groups System

- `groups` table: `id, name, color, pin_hash, sort_order, created_at`
- `channels.group_id` → FK to `groups.id` ON DELETE SET NULL
- `GroupPanel` component (72px wide) renders before `ChannelSidebar` in `AppLayout`
- `selectedGroupId === null` → "Общее" (channels where `group_id IS NULL`)
- PIN hashed with `bcryptjs` (saltRounds=10), verified via `POST /api/groups/:id/verify-pin`

## Client API Pattern

Each entity has a dedicated file in `src/client/api/` using TanStack Query:
```ts
export function useThings() { return useQuery(...) }
export function useCreateThing() { return useMutation({ onSuccess: () => qc.invalidateQueries(...) }) }
```

## CSS Conventions

- CSS variables: `--tgr-color-*` (mapped from Ant Design tokens via inline styles)
- BEM-like classes: `.channel-item`, `.channel-item--active`, `.channel-item__info`
- CSS Container Queries used for responsive sidebar buttons (`.channel-sidebar__header`)
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

## Media Files

- Downloaded to `data/{telegramId}/{filename}` on server disk
- Served via `GET /api/media/:channel/:filename`
- Downloads managed by `downloadManager.ts` — background tasks use size limits (photos ≤ 5 MB, videos ≤ 75 MB); user-initiated (`priority ≥ 10`) bypass limits
- Progress visible in `DownloadsPanel` (header badge + Drawer) via SSE
