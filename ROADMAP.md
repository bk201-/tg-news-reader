# TG News Reader — Roadmap

> Date: April 2026  
> Living document — revisit when planning each step.  
> Implementation details: [docs/architecture.md](docs/architecture.md) · Decisions & history: [docs/decisions.md](docs/decisions.md) · Azure ops: [docs/azure.md](docs/azure.md) · Git workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 🔴 Critical Fixes

| # | Task | Description | Complexity |
|---|------|-------------|------------|
| 1 | Refresh token rotation | `POST /refresh` reuses the same refresh token for 7 days. Must generate a new `refreshToken` + `refreshTokenHash` on every refresh, update `sessions`, and re-set the cookie. Without this a leaked token = 7 days of unlimited access. **File:** `routes/auth.ts` | ⭐ |
| 2 | UNIQUE(channel_id, telegram_msg_id) on `news` | No DB-level uniqueness — concurrent fetches (two tabs, double-click) can insert duplicates. Add composite unique constraint in `schema.ts` + idempotent ALTER in `migrate.ts`. Enables native `ON CONFLICT DO UPDATE` in `channelFetchService` instead of manual pre-query split. **File:** `db/schema.ts`, `db/migrate.ts`, `channelFetchService.ts` | ⭐ |
| 3 | Fix `until` filter in digest route | `routes/digest.ts` lines 48–50: `eq(news.postedAt, untilTs)` is a placeholder — should be `lte`. The `until` parameter is silently ignored. **File:** `routes/digest.ts` | ⭐ |
| 4 | O(n²) in filterEngine — use Set | `filterEngine.ts` line 55: `toFilter.includes(item.newsId)` inside a nested loop = O(n×m) linear scans. Replace `toFilter: number[]` with `Set<number>`. **File:** `services/filterEngine.ts` | ⭐ |

---


## ⬜ Technical Debt

| # | Task | Description | Complexity |
|---|------|-------------|------------|
| 11 | Split `telegram.ts` (617 lines) | Exceeds 200-line rule. Split into: `telegramClient.ts` (connection, mutex, delay, disconnect), `telegramParser.ts` (parseMessageFields, extractLinks, extractHashtags, InstantView), `telegramApi.ts` (public API: fetch, getInfo, read, download). | ⭐⭐ |
| 12 | Split `useNewsFeedState.ts` (333 lines) | Exceeds 200-line rule. Split into: `useNewsFeedData` (queries, filtering, derived values), `useNewsFeedActions` (handlers: mark read, fetch, tag), `useNewsFeedScroll` (FAB, sentinel, scroll-to-index). | ⭐⭐ |
| 13 | Split `downloadManager.ts` (355 lines) | Exceeds 200-line rule. Extract `DownloadCoordinator` class into its own file, keep public API + `startWorkerPool` in `downloadManager.ts`. | ⭐⭐ |
| 14 | Split `AppHeader.tsx` (265 lines) | Exceeds 200-line rule. Extract `UserMenu` component (menu items, TOTP toggle, cache clear, language switcher). | ⭐⭐ |
| 15 | Extract `NewsDetail` derivations (246 lines) | On the limit. Move derived values (links, isVideo, isAlbum, albumLength, etc.) + handlers into a `useNewsDetailState` hook. | ⭐ |
| 16 | Runtime request body validation (Zod) | All route handlers use `c.req.json<T>()` — type assertion only, no runtime check. Add `zod` + Hono's `zValidator` middleware for input validation on all POST/PUT/PATCH endpoints. | ⭐⭐⭐ |
| 17 | Review `eslint-disable react-hooks/exhaustive-deps` | `useNewsFeedState.ts` lines 179, 253 suppress deps warnings — potential stale closure bugs. Audit each case and either add deps or restructure. | ⭐ |
| 18 | `logBuffer.ts` — Array.shift() is O(n) | Replace `_entries.shift()` with a circular buffer (head/tail pointer) for O(1) writes at MAX_ENTRIES=2000. | ⭐ |
| 19 | Album sort stability | `telegram.ts` line 431: `sort((a, b) => a.date - b.date)` — albums have same `date`, order is undefined. Add secondary sort by `id`. | ⭐ |
| 20 | N+1 updates in channelFetchService | `channelFetchService.ts` lines 176–182: each `toUpdateValues` item = separate SQL UPDATE in a loop. Batch via SQL `CASE WHEN` or `VALUES` join for fewer round-trips. | ⭐⭐ |
| 21 | Unit tests: server services | `channelFetchService`, `filterEngine`, `downloadManager`, `channelStrategies`, `toNewsItem` mapper, `readability` — pure logic, testable with in-memory SQLite (`:memory:` libsql). Stack: **Vitest**. | ⭐⭐ |
| 22 | Unit tests: client hooks & stores | `uiStore`, `authStore` (Zustand), `useNewsFeedState`, `useNewsHotkeys`, `filterUtils`, `applyFilters` — no DOM needed. Stack: **Vitest** + `@testing-library/react` for hooks. | ⭐⭐ |
| 23 | Unit tests: shared utilities | `retry.ts` policies, `telegramCircuitBreaker` state machine, `alertBot` dedup logic, `mediaUrl` builder — small pure functions. Stack: **Vitest**. | ⭐ |
| 24 | Integration tests: API routes | Happy-path + error cases for `/api/news`, `/api/channels/:id/fetch`, `/api/auth/login`, `/api/downloads`. Spin up Hono app with in-memory SQLite, mock Telegram calls. Stack: **Vitest** + `app.request()`. | ⭐⭐⭐ |
| 25 | Integration tests: download workers | Worker thread lifecycle: task dispatch → IPC bridge → DB update. Mock `parentPort` + Telegram bridge. Stack: **Vitest** with worker-threads mocks. | ⭐⭐⭐ |
| 26 | Component tests: key UI flows | `ChannelSidebar` CRUD flow, `NewsDetail` mark-read + hotkeys, `LoginPage` + TOTP, `GroupPinModal` unlock. Stack: **Vitest** + `@testing-library/react` + MSW for API mocking. | ⭐⭐⭐ |
| 27 | E2E smoke test | Login → select channel → fetch → read news → mark read. Stack: **Playwright**, runs against `npm run dev` with a test SQLite DB seeded with fixture data. | ⭐⭐⭐⭐ |
| 28 | CI test step | Add `npm test` to PR pipeline (`.github/workflows/pr-check.yml`) after lint, before build. Fail PR on test failure. | ⭐ |

---

## 🟠 UX Improvements

| # | Task | Description | Complexity |
|---|------|-------------|------------|
| 29 | Loading skeleton on channel switch | When switching channels, show Antd `Skeleton` shimmer instead of stale data from the previous channel while TanStack Query refetches. | ⭐ |
| 30 | Telegram session expired — user-facing banner | Verify `TelegramSessionBanner` properly reacts to `health.telegram.sessionExpired === true` and shows a clear warning with `npm run tg:auth` instructions. | ⭐ |
| 31 | Better empty state for first-time users | Add tooltip or inline guide to the "Add first channel" empty state — explain that user should enter a `@username` of a Telegram channel. | ⭐ |
| 32 | Digest cost confirmation | Before running AI digest, show confirmation: "Digest will process N items (~X tokens). Continue?". Prevents accidental expensive API calls. | ⭐ |

---

## ⬜ Security Hardening

| # | Task | Description | Complexity |
|---|------|-------------|------------|
| 37 | Content Security Policy | `secureHeaders()` is enabled but CSP is not configured. Need policy that allows YouTube embeds, antd inline styles, `blob:` URLs. | ⭐⭐ |
| 38 | Service Worker versioning | `sw.js` is a static file with no build hash. Add `updateViaCache: 'none'` to registration or append version query param to force update on deploy. | ⭐ |
| 39 | SSE reconnection backoff | `useDownloadsSSE` / `useMediaProgressSSE` use native `EventSource` which reconnects without backoff. When server is down this floods with connection attempts. Wrap with exponential backoff. | ⭐⭐ |
| 40 | downloads UNIQUE constraint verification | `enqueueTask` uses `onConflictDoUpdate` on `(newsId, type)` but `schema.ts` has no explicit `unique()` on that pair. Verify it exists in `migrate.ts` or add it. | ⭐ |

---

## ⬜ Deferred (low priority)

| # | Task | Description | Complexity |
|---|------|-------------|------------|
| 41 | Post search | Search input in toolbar — client-side filter by `text` + `fullContent`. For large channels consider SQLite FTS5 on the server. Low urgency: hashtag filter covers most use cases. | ⭐⭐ |
| 42 | Mobile swipe gestures | Swipe-to-mark-read on news list items, swipe between album photos. Needs UX design first: whole row vs header, conflict with scroll. Consider `react-swipeable` or native touch events. | ⭐⭐⭐ |
| 43 | Client-side video download | Videos already render in the browser — save to disk via `<a download>` without storing a copy in Azure. Useful for large videos to watch offline. See Open Question #1. | ⭐⭐ |
| 44 | Invites / multi-user | Invite another user via an invite link. Requires: user profile card, password change, roles. Not relevant while single-user. See Open Question #2. | ⭐⭐⭐⭐ |
| 45 | Clarify `logs.ts` vs `clientLog.ts` routes | Two log-related route files are confusing. Document or merge — `clientLog.ts` = browser logs forwarded to server, `logs.ts` = admin log viewer API. | ⭐ |

---

## Open Questions

1. **gramjs in the browser**: should we share the main session or create a separate one? Needed for client-side downloads without intermediate server storage.
2. **better-auth**: reconsider if we move to invites / OAuth (Google/GitHub) / Passkeys — not before there's a real need for multi-user.
