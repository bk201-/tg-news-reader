# TG News Reader — Roadmap

> Date: April 2026  
> Living document — revisit when planning each step.  
> Implementation details: [docs/architecture.md](docs/architecture.md) · Decisions & history: [docs/decisions.md](docs/decisions.md) · Azure ops: [docs/azure.md](docs/azure.md) · Git workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Technical Debt

| #   | Task           | Description                                                                                                                                               | Complexity |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | E2E smoke test | Login → select channel → fetch → read news → mark read. Stack: **Playwright**, runs against `npm run dev` with a test SQLite DB seeded with fixture data. | ⭐⭐⭐⭐   |

---

## Deferred (low priority)

| #   | Task                                       | Description                                                                                                                                                                             | Complexity |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Post search                                | Search input in toolbar — client-side filter by `text` + `fullContent`. For large channels consider SQLite FTS5 on the server. Low urgency: hashtag filter covers most use cases.       | ⭐⭐       |
| 2   | Mobile swipe gestures                      | Swipe-to-mark-read on news list items, swipe between album photos. Needs UX design first: whole row vs header, conflict with scroll. Consider `react-swipeable` or native touch events. | ⭐⭐⭐     |
| 3   | Client-side video download                 | Videos already render in the browser — save to disk via `<a download>` without storing a copy in Azure. Useful for large videos to watch offline. See Open Question #1.                 | ⭐⭐       |
| 4   | Invites / multi-user                       | Invite another user via an invite link. Requires: user profile card, password change, roles. Not relevant while single-user. See Open Question #2.                                      | ⭐⭐⭐⭐   |
| 5   | Clarify `logs.ts` vs `clientLog.ts` routes | Two log-related route files are confusing. Document or merge — `clientLog.ts` = browser logs forwarded to server, `logs.ts` = admin log viewer API.                                     | ⭐         |

---

## Open Questions

1. **gramjs in the browser**: should we share the main session or create a separate one? Needed for client-side downloads without intermediate server storage.
2. **better-auth**: reconsider if we move to invites / OAuth (Google/GitHub) / Passkeys — not before there's a real need for multi-user.
