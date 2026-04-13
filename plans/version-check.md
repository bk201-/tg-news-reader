# Plan: Client Version Check & Reload Prompt

> Source PRD: `docs/prd-version-check.md`

## Architectural decisions

- **Route**: `GET /api/version` — public (no auth), returns `{ version: string }`
- **Version source (server)**: read from `package.json` once at startup, cached in memory
- **Version source (client)**: `__APP_VERSION__` injected by Vite `define` at build time
- **Polling**: plain `fetch` every 5 min (no TanStack Query, no auth headers)
- **UI**: sticky banner (above header) with Reload + dismiss; `Modal.confirm` for stale chunks
- **i18n keys**: `common.newVersionAvailable`, `common.newVersionReload`, `common.newVersionChunkError`

---

## Phase 1: Version endpoint + polling + banner

**User stories**: 1, 2, 3, 4, 5, 7, 8, 9

### What to build

End-to-end version detection: server exposes `/api/version` returning the current semver. Vite injects `__APP_VERSION__` into the client bundle at build time. A React hook polls the endpoint every 5 minutes (disabled in dev), compares versions, and surfaces a `newVersionAvailable` flag. A sticky banner component renders above the app header when the flag is true — shows a localized message, a Reload button (`location.reload()`), and a dismiss × button. Dismissing hides the banner until the next poll cycle re-detects the mismatch.

### Acceptance criteria

- [ ] `GET /api/version` returns 200 `{ version }` without auth
- [ ] `__APP_VERSION__` is defined at build time and matches `package.json`
- [ ] In production, polling fires every 5 min; in dev, no polling occurs
- [ ] When server version ≠ client version, a sticky banner appears above the header
- [ ] Banner contains a Reload button that calls `location.reload()`
- [ ] Banner has a dismiss × button that hides it
- [ ] After dismissal, the next poll cycle re-shows the banner if mismatch persists
- [ ] Failed fetch does not show the banner or throw errors
- [ ] Both `en` and `ru` translation keys are added

---

## Phase 2: Stale chunk handler

**User stories**: 6

### What to build

A global `vite:preloadError` event listener in `main.tsx`. When a dynamic import fails because a hashed chunk no longer exists on the server (post-deploy), the handler calls `event.preventDefault()` to suppress the uncaught error and shows a `Modal.confirm` dialog with a localized message ("A new version is available") and an OK button that triggers `location.reload()`.

### Acceptance criteria

- [ ] `vite:preloadError` listener is registered in `main.tsx`
- [ ] `event.preventDefault()` is called to suppress the default error
- [ ] A modal dialog appears with a Reload button
- [ ] Clicking OK calls `location.reload()`
- [ ] Localized strings in both `en` and `ru`

---

## Phase 3: Tests

**User stories**: (quality gate)

### What to build

Integration test for `/api/version` route using the existing `app.request()` pattern — verifies 200 response with correct version, no auth required. Unit test for the version-check hook using fake timers and mocked `fetch` — covers: version mismatch → `true`, same version → `false`, fetch error → `false`, dev mode → no fetch.

### Acceptance criteria

- [ ] `/api/version` integration test passes (200 + correct payload + no auth needed)
- [ ] `useVersionCheck` hook unit test covers mismatch, match, error, and dev-mode cases
- [ ] All existing tests still pass
- [ ] Coverage thresholds not violated

