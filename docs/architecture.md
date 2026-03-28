# TG News Reader — Architecture & Implementation Notes

> Детальные заметки по реализованным фичам. Актуальная архитектура живого кода — см. также `AGENTS.md`.

---

## 1–4. Sidebar: Segmented, бейджи, сплиттер, адаптивные кнопки

### Тулбар: кнопки периодов (Segmented)

- `[↻]` — отдельная кнопка, всегда кликабельна, fetch с `readInboxMaxId` из Telegram (или fallback через `getSinceDate`)
- `<Segmented>` с периодами `[1д][3д][5д][7д][14д]` + `[↺]` (с последней синхронизации)
- При смене канала выбор сбрасывается; кнопки без начального выбора — каждый клик триггерит fetch

### Бейджи непрочитанных

- `unreadCount` в `GET /api/channels` (LEFT JOIN с news WHERE is_read = 0)
- `pendingCounts` в `uiStore` — сообщения в Telegram, ещё не скачанные
- Бейдж = `unreadCount + pendingCounts[channelId]`
- Кнопка **"Обновить"** → `POST /api/channels/count-unread` — только считает, использует `lastFetchedAt`
- `getSinceDate(channel)` — shared helper для fetch-роута: `lastReadAt` → `lastFetchedAt` → `-N дней`
- ⚠️ `count-unread` намеренно **не** использует `lastReadAt` — иначе уже скачанные непрочитанные считались бы дважды

### Сплиттер

`<Splitter>` из Ant Design 6, `defaultSize=280`, `min=200`, `max=500`.

### Адаптивные кнопки (текст→иконки)

Реализовано через **CSS Container Queries** — нативный стандарт, без JS:

```css
/* container-type: inline-size на родителе */
@container (max-width: 300px) {
  .btn-text { display: none; }
}
```

Текст "Обновить" и "Добавить" скрывается при ширине сайдбара ≤ 300px.

---

## 5–6. Группы каналов с PIN

### Схема БД

```sql
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1677ff',
  pin_hash TEXT,        -- bcrypt(pin, saltRounds=10) или NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- channels: добавлены group_id (FK → groups ON DELETE SET NULL) и sort_order
```

### Реализация

- `GroupPanel` — левая панель 72px; кнопки с `FolderFilled` в цвете группы, radial-gradient фон через `color-mix`
- Бейдж группы = сумма `unreadCount + pendingCounts` всех каналов группы
- `selectedGroupId === null` → "Общее" (каналы без group_id)
- PIN: `bcrypt(pin, 10)` → `POST /api/groups/:id/verify-pin` → `unlockGroup(id)` в uiStore (in-memory)
- После верификации PIN сервер обновляет `sessions.unlocked_group_ids` и выдаёт новый access token

### API

```
GET    /api/groups
POST   /api/groups
PUT    /api/groups/:id          (pin: null = убрать PIN)
DELETE /api/groups/:id          (каналы → group_id = null)
POST   /api/groups/:id/verify-pin
```

---

## 9. Аутентификация (пароль + TOTP 2FA + JWT)

### Схема БД

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- bcrypt(password, 12)
  totp_secret TEXT,              -- NULL = 2FA не включён
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID v4
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  unlocked_group_ids TEXT NOT NULL DEFAULT '[]',
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Стратегия токенов

- **Access token**: JWT 15 мин, только в памяти (НЕ localStorage), payload: `{ sub, role, sessionId, unlockedGroupIds }`
- **Refresh token**: UUID 7 дней, httpOnly cookie (`sessionId:token`), bcrypt-хэш в sessions

### Маршруты

```
POST   /api/auth/login           email + password [+ totp_code]
POST   /api/auth/refresh         refresh cookie → новый access token
POST   /api/auth/logout          удалить сессию + очистить cookie
GET    /api/auth/totp/setup      QR-код для 2FA
POST   /api/auth/totp/confirm    подтвердить и активировать
DELETE /api/auth/totp            отключить 2FA
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
```

---

## 10. Service Worker кэш медиа

`public/sw.js` — **Cache-First** для `GET /api/media/*`:
- Стрипает `?token=` из ключа кэша — JWT-ротация не сбрасывает кэш
- Максимум 2000 записей, TTL 30 дней (настраивается через `postMessage`)
- Регистрируется только в production (`import.meta.env.DEV` guard)
- `getSwStats()` → `SwStats`; кнопка "Очистить кэш медиа" в AppHeader → `clearSwCache()`

---

## 11. Логи

Стек: `pino` (JSON в prod, pino-pretty в dev). Уровень: `LOG_LEVEL` env (default `debug`/`info`).

| Уровень | Событие |
|---------|---------|
| `info`  | Старт сервера, fetch канала (inserted/total), download done |
| `warn`  | Task failed, Telegram недоступен, auth fail (без email) |
| `error` | Необработанное исключение, crash worker |
| `debug` | (dev only) детали Telegram-запросов |

Структура: `{ level, time, module, ...fields, msg }`. В Azure Container Apps stdout → Log Analytics автоматически.

---

## 12. Локализация (i18n)

- **react-i18next** + **i18next-browser-languagedetector**
- EN по умолчанию, RU fallback; язык в `localStorage`
- Ant Design locale через `<ConfigProvider locale={antdLocale}>`
- Ключи: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `auth.*`, `header.*`, `downloads.*`, `filters.*`, `common.*`

---

## 13. Менеджер загрузок медиа

### Схема БД

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES news ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'media' | 'article'
  url TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at INTEGER,
  processed_at INTEGER,
  UNIQUE(news_id, type)
);
```

### Детали

- `enqueueTask(newsId, type, url?, priority=0)` — INSERT с `onConflictDoUpdate`, resets failed → pending, keeps MAX(priority)
- `startWorkerPool(n)` — N воркеров, crash recovery на старте (processing → pending)
- Приоритеты: 0 = фоновый (лимиты размера), 10 = пользовательский (лимиты пропускаются)
- Автоочистка done-задач через `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` сек (default 30)
- SSE: `GET /api/downloads/stream` — `init` + `task_update` события

---

## 14. Режим просмотра «аккордеон»

- `newsViewMode: 'list' | 'accordion'` в `uiStore` (persisted localStorage)
- `effectiveViewMode` в `NewsFeed` — на мобильных (`< 768px`) принудительно аккордеон
- `NewsDetail` variant: `'panel'` (list mode) и `'inline'` (accordion)
- Sticky header в аккордеоне: `position: sticky; top: 0; z-index: 10`

---

## 15. Адаптивный layout

- BP-константы: `BP_SM/MD/LG/XL/XXL` = Ant Design breakpoints
- `<Splitter>` только на `xxl` (≥ 1600px); на `< xxl` sidebar в `<Drawer>`
- `DownloadsPanel` pinned-режим только на `xxl`
- Открытые вопросы: тач-таргеты (хэштег-теги и checkbox); Safari iOS Splitter не активен на тач

---

## 16. Деплой в Azure

### Стек

| Компонент | Сервис | ~Цена/мес |
|---|---|---|
| Бэкенд (Hono + Node) | Container Apps | ~$5–15 |
| БД | Turso | $0–29 |
| Образы | Azure Container Registry (Basic) | $5 |
| SSL | Container Apps TLS | ~$0.5 |

### Конфигурация Container App

- Scale: `minReplicas=0`, `maxReplicas=10`, **`cooldownPeriod=1800`** (30 мин — обновлено 28.03.2026)
- Base image: `node:22-bookworm-slim` (glibc — совместим с `@libsql/client` и `jsdom`)
- Multi-stage Dockerfile: builder → runner (prodDeps only + `dist/`)

### Переменные окружения (prod)

> ⚠️ `--set-env-vars` в Azure CLI заменяет ВЕСЬ список. Используй Portal или передавай полный список.

**Обязательные:**
```
NODE_ENV=production
TG_API_ID, TG_API_HASH, TG_SESSION       → secretref:*
DATABASE_URL, TURSO_AUTH_TOKEN           → secretref:*
JWT_SECRET                               → secretref:jwt-secret
ALLOWED_ORIGIN=https://yourdomain.com
```

**Опциональные:**
```
ALERT_BOT_TOKEN, ALERT_CHAT_ID           → secretref:* (no-op если не заданы)
AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY  → secretref:*
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
OPENAI_API_KEY                           → secretref:* (fallback)
LOG_LEVEL=info
```

---

## 17. Мониторинг + Fail detection

### Azure Monitor Alerts (задеплоены в `personal-apps-rg`)

| Правило | Триггер | Окно | Задержка |
|---|---|---|---|
| `tg-reader-error-logs` | KQL: `log.level >= 50` | 5 мин | 1–5 мин |
| `tg-reader-restart` | `RestartCount > 1` | **15 мин** (обновлено 28.03.2026) | 1–5 мин |

Пересоздать: `scripts/setup-monitoring.sh`. PowerShell: `az rest --body @file.json`.

### alertBot

`src/server/services/alertBot.ts` — no-op если env vars не заданы. Срабатывает при:
`uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, старт сервера (prod).

### Стек уведомлений

| Событие | Канал | Задержка |
|---|---|---|
| `uncaughtException` / worker crash / circuit OPEN | alertBot → Telegram | мгновенно |
| Deploy failed (CI) | GitHub Actions → Telegram | мгновенно |
| `logger.error/fatal` | Azure Monitor KQL → email | 1–5 мин |
| Container restart / OOM | Azure Monitor Metric → email | 1–5 мин |
| Сервер не отвечает | UptimeRobot → Telegram/email (опц.) | ≤5 мин |

---

## 18. Accessibility (a11y)

### Реализовано

- **Tab-навигация**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter/Space) на `ChannelItem`, `GroupItem`, `NewsListItem`
- **ARIA**: `<nav aria-label>` на `ChannelSidebar` и `GroupPanel`; `role="listbox"` на списках новостей; `aria-expanded` на `NewsAccordionItem`
- **Focus-visible**: `outline: 2px solid token.colorPrimary`; двойное кольцо для primary-кнопок; Segmented через `:has(input:focus-visible)`
- **Touch**: `MaybeTooltip` — на `pointer: coarse` рендерит только детей без тултипа (9 файлов)

### Оставлено на будущее

- [ ] Skip-link (`<a href="#main-content">`)
- [ ] Фокус-менеджмент при открытии/закрытии Drawer
- [ ] `DownloadsPanel`: `aria-live="polite"` на счётчике задач
- [ ] `NewsDetailMedia`: `tabIndex` на кнопках Prev/Next в карусели альбома
- [ ] Lighthouse / axe аудит (цель ≥ 90)

---

## 19. AI-дайджест

### Провайдер

Один код, два провайдера через `baseURL`:

```ts
// src/server/services/openaiClient.ts
const client = process.env.AZURE_OPENAI_ENDPOINT
  ? new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### API и ограничения

```
POST /api/digest
Body: { channelIds?: number[], groupId?: number | null, since?: string, until?: string }
Response: SSE stream (text/event-stream)
```

- Отправляем только `text` (без `fullContent`, без медиа)
- Если новостей > 200 — берём последние 200
- UI: кнопка "Дайджест ✨" в тулбаре, стримится в `<Drawer>` с `react-markdown`

---

## 20. Клиентская скачка gramjs (отложено)

**Варианты реализации:**
- **A**: сервер отдаёт `{ fileId, accessHash, dcId, fileReference }`, клиент качает через gramjs
- **B**: сервер отдаёт подписанный прокси-URL

Сессия: шарить основную проще, но менее безопасно. Решить при реальной реализации.

---

## 21. Менеджер загрузок в папку (отложено)

- **File System Access API**: `showDirectoryPicker()` → пользователь выбирает папку
- Браузеры: Chrome/Edge ✅, Safari 15.2+ ✅, **Firefox ❌**
- Зависит от пункта 20 (хотя бы частично)

