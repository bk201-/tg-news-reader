# Contributing

> Процесс разработки для проекта TG News Reader.

---

## Перед каждым пушем

Все четыре проверки должны пройти:

```bash
npm run build          # Vite client build
npm run build:server   # tsc -p tsconfig.server.json
npm run lint           # ESLint
npm run format:check   # Prettier (read-only; npm run format — для фикса)
```

---

## Git Workflow

`main` защищён — прямые пуши заблокированы GitHub Ruleset. Все изменения через PR.

### Создать ветку и PR

```bash
git checkout -b feat/my-feature   # ветвиться от main

# ... изменения ...

git add . && git commit -m "feat: краткое описание"
git push origin feat/my-feature
# GitHub напечатает URL для открытия PR, или:
gh pr create --base main
```

### ⚠️ После каждого `git push` — сразу обновить локальный `main`

```bash
git checkout main
git pull origin main        # или: git reset --hard origin/main
git checkout -b feat/next-feature
```

> Локальный `main` не обновляется автоматически после мержа PR на GitHub.  
> Если ветвиться от устаревшего `main` → конфликты в следующем PR.

### Если ветка устарела (конфликты с main)

```bash
git fetch origin
git checkout main && git reset --hard origin/main
git checkout your-branch
git rebase origin/main      # при конфликтах: git rebase --continue
git push origin your-branch --force-with-lease
```

---

## CI/CD Pipeline

### PR check (`.github/workflows/pr-check.yml`)

Запускается автоматически при каждом PR в `main`:
1. `build` → `build:server` → `lint` → `format:check`
2. Если всё прошло **и** автор — `bk201-` → **auto-squash-merge** + удаление ветки

Название статус-чека в Ruleset: **`Build & Lint`**

> Auto-merge использует `PAT_TOKEN` (не `GITHUB_TOKEN`) — иначе GitHub не триггерит downstream workflows.

### Main pipeline (`.github/workflows/build-main.yml`)

Запускается при каждом пуше в `main` (после мержа PR):
1. Quality gate (те же 4 проверки)
2. `docker build` → push в ACR
3. `az containerapp update` → деплой
4. Smoke test: `GET /api/health` каждые 10 сек до 3 мин
5. `docker save` → артефакт `docker-image-<sha>.tar.gz` (хранятся 3 последних)
6. При `failure()` → Telegram-уведомление через `ALERT_BOT_TOKEN`

---

## Схема именования веток

```
feat/short-description    # новая фича
fix/short-description     # баг-фикс
chore/short-description   # техдолг, рефакторинг, обновления
docs/short-description    # только документация
```

---

## Схема commit messages

```
feat: добавить сортировку каналов
fix: исправить badge count после mark-all-read
chore: обновить зависимости
docs: обновить ROADMAP
refactor: разбить AppHeader на компоненты
```

