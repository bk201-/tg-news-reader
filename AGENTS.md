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
    index.ts          # Hono app, registers all routers
    db/
      schema.ts       # Drizzle schema (source of truth for types)
      migrate.ts      # Manual migration runner (CREATE TABLE IF NOT EXISTS + ALTER TABLE)
      index.ts        # libsql client + drizzle instance
    routes/           # channels.ts, news.ts, filters.ts, groups.ts, media.ts, content.ts
    services/         # telegram.ts (gramjs), readability.ts, mediaProgress.ts
  client/
    components/       # Channels/, News/, Filters/, Layout/
    api/              # React Query hooks: channels.ts, news.ts, groups.ts, filters.ts
    store/uiStore.ts  # Zustand store (selectedChannelId, selectedGroupId, theme, etc.)
    styles.css        # All CSS (BEM-like, CSS custom props for theming)
  shared/types.ts     # Shared TS interfaces (Channel, Group, NewsItem, Filter)
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

## Media Files

- Downloaded to `data/{telegramId}/{filename}` on server disk
- Served via `GET /api/media/:channel/:filename`
- Auto-download thresholds: photos ≤ 5 MB, videos ≤ 75 MB (enforced in `postProcess` in channels.ts)
- SSE progress stream: `GET /api/channels/:id/media-progress`

