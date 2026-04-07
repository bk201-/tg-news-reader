# TG News Reader — Roadmap

> Date: April 2026  
> Living document — revisit when planning each step.  
> Implementation details: [docs/architecture.md](docs/architecture.md) · Decisions & history: [docs/decisions.md](docs/decisions.md) · Azure ops: [docs/azure.md](docs/azure.md) · Git workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## ⬜ Technical Debt

| Task | Description | Complexity |
|------|-------------|------------|
| Unit tests: server services | `channelFetchService`, `filterEngine`, `downloadManager`, `channelStrategies`, `toNewsItem` mapper, `readability` — pure logic, testable with in-memory SQLite (`:memory:` libsql). Stack: **Vitest**. | ⭐⭐ |
| Unit tests: client hooks & stores | `uiStore`, `authStore` (Zustand), `useNewsFeedState`, `useNewsHotkeys`, `filterUtils`, `applyFilters` — no DOM needed. Stack: **Vitest** + `@testing-library/react` for hooks. | ⭐⭐ |
| Unit tests: shared utilities | `retry.ts` policies, `telegramCircuitBreaker` state machine, `alertBot` dedup logic, `mediaUrl` builder — small pure functions. Stack: **Vitest**. | ⭐ |
| Integration tests: API routes | Happy-path + error cases for `/api/news`, `/api/channels/:id/fetch`, `/api/auth/login`, `/api/downloads`. Spin up Hono app with in-memory SQLite, mock Telegram calls. Stack: **Vitest** + `app.request()`. | ⭐⭐⭐ |
| Integration tests: download workers | Worker thread lifecycle: task dispatch → IPC bridge → DB update. Mock `parentPort` + Telegram bridge. Stack: **Vitest** with worker-threads mocks. | ⭐⭐⭐ |
| Component tests: key UI flows | `ChannelSidebar` CRUD flow, `NewsDetail` mark-read + hotkeys, `LoginPage` + TOTP, `GroupPinModal` unlock. Stack: **Vitest** + `@testing-library/react` + MSW for API mocking. | ⭐⭐⭐ |
| E2E smoke test | Login → select channel → fetch → read news → mark read. Stack: **Playwright**, runs against `npm run dev` with a test SQLite DB seeded with fixture data. | ⭐⭐⭐⭐ |
| CI test step | Add `npm test` to PR pipeline (`.github/workflows/pr-check.yml`) after lint, before build. Fail PR on test failure. | ⭐ |

---

## ⬜ Queue (new features)

| Task | Description | Complexity |
|------|-------------|------------|

---

## ⬜ Deferred (low priority)

| Task | Description                                                                                                                                         | Complexity |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| Post search | Search input in toolbar — client-side filter by `text` + `fullContent`. For large channels consider SQLite FTS5 on the server. Low urgency: hashtag filter covers most use cases. | ⭐⭐ |
| Mobile swipe gestures | Swipe-to-mark-read on news list items, swipe between album photos. Needs UX design first: whole row vs header, conflict with scroll. Consider `react-swipeable` or native touch events. | ⭐⭐⭐ |
| Client-side video download | Videos already render in the browser — save to disk via `<a download>` without storing a copy in Azure. Useful for large videos to watch offline. See Open Question #1. | ⭐⭐ |
| Invites / multi-user | Invite another user via an invite link. Requires: user profile card, password change, roles. Not relevant while single-user. See Open Question #2. | ⭐⭐⭐⭐ |

---

## Open Questions

1. **gramjs in the browser**: should we share the main session or create a separate one? Needed for client-side downloads without intermediate server storage.
2. **better-auth**: reconsider if we move to invites / OAuth (Google/GitHub) / Passkeys — not before there's a real need for multi-user.
