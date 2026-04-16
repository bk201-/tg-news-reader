---
name: create-pr
description: Run all quality checks, bump version, commit, push to a feature branch, and create a GitHub PR. Use when the user says "create PR", "push", "submit PR", "залить", "сделай PR", or wants to finalize and ship changes.
---

# Create PR

Finalize current changes: run quality checks, bump version, commit, push, and open a GitHub PR.

## Process

### 1. Determine what changed

Run `git status` and `git diff --stat` to understand the scope of changes. Classify:
- **Bug fix only** → patch bump (`npm version patch --no-git-tag-version`)
- **New feature** (with or without fixes) → minor bump (`npm version minor --no-git-tag-version`)
- **Breaking / major** → ask the user first, never bump major silently

If unsure, ask the user: "This looks like a feature/fix — should I bump minor or patch?"

### 2. Run all four quality checks

Run them **sequentially** — stop on first failure and fix before continuing:

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json
npm run lint           # ESLint — must be 0 errors (warnings acceptable if pre-existing)
npm run format:check   # Prettier — if fails, run `npm run format` and re-check
```

If `format:check` fails, run `npm run format` automatically, then re-run `format:check`.

If `lint` has new errors (not pre-existing warnings), fix them before proceeding.

If `build` or `build:server` fails, fix type errors before proceeding.

**Do NOT proceed to commit until all four checks pass.**

### 3. Create a feature branch (if not already on one)

Check current branch with `git branch --show-current`.

- If on `main` → create a new branch: `git checkout -b feat/<short-description>` or `fix/<short-description>` based on change type
- If already on a feature branch → stay on it
- Branch naming: `feat/` for features, `fix/` for bug fixes, `refactor/` for refactors

### 4. Commit

Stage all changes and commit with a conventional commit message:

```bash
git add -A
git commit -m "<type>: <short description>"
```

Types: `feat`, `fix`, `refactor`, `chore`, `style`, `docs`

If the change includes multiple things, use the most significant type. Include a brief body if the title isn't self-explanatory.

### 5. Push

```bash
git push origin <branch-name>
```

If the branch doesn't exist on remote yet, use:
```bash
git push -u origin <branch-name>
```

### 6. Create the PR

```bash
gh pr create --base main --title "<same as commit message>" --body "<brief description of changes>"
```

The PR body should include:
- What changed (bullet points)
- Version bump (e.g., "1.3.0 → 1.4.0")

### 7. Wait for CI and switch to main

After creating the PR, **wait for the CI run to finish** before switching branches:

```bash
# Get the CI run triggered by the PR and watch it
gh run list --branch <branch-name> --limit 1 --json databaseId,status --jq ".[0].databaseId"
gh run watch <run-id>
```

- If CI **passes** — switch to main and update:
  ```bash
  git checkout main
  git pull origin main
  ```
- If CI **fails** — **stay on the feature branch**, report the failure to the user, and fix the issue before retrying. Do NOT switch to main.

### 8. Report to user

Tell the user:
- All local checks passed
- Version bumped (from -> to)
- PR URL
- CI result (passed / failed / auto-merged)

## Important rules

- **NEVER skip quality checks.** All four must pass before committing.
- **NEVER push to `main` directly.** It's protected — always use a feature branch + PR.
- **NEVER read or print `.env` contents** — it contains secrets.
- **Always switch back to `main` after pushing.** This is non-negotiable.
- If `gh` CLI is not authenticated, tell the user to run `gh auth login` first.
- If there are uncommitted changes when starting, include them in the PR (don't stash).
