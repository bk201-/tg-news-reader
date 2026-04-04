# TG News Reader — Roadmap

> Date: April 2026  
> Living document — revisit when planning each step.  
> Implementation details: [docs/architecture.md](docs/architecture.md) · Decisions & history: [docs/decisions.md](docs/decisions.md) · Azure ops: [docs/azure.md](docs/azure.md) · Git workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## ⬜ Technical Debt

| Task | Description | Complexity |
|------|-------------|------------|

---

## ⬜ Queue (new features)

| Task | Description | Complexity |
|------|-------------|------------|

---

## ⬜ Deferred (low priority)

| Task | Description                                                                                                                                         | Complexity |
|------|-----------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| Client-side video download | Videos already render in the browser — save to disk via `<a download>` without storing a copy in Azure. Useful for large videos to watch offline. See Open Question #1. | ⭐⭐ |
| Invites / multi-user | Invite another user via an invite link. Requires: user profile card, password change, roles. Not relevant while single-user. See Open Question #2. | ⭐⭐⭐⭐ |

---

## Open Questions

1. **gramjs in the browser**: should we share the main session or create a separate one? Needed for client-side downloads without intermediate server storage.
2. **better-auth**: reconsider if we move to invites / OAuth (Google/GitHub) / Passkeys — not before there's a real need for multi-user.
