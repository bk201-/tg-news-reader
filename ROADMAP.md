# TG News Reader — Roadmap & Strategy

> Дата: март 2026  
> Этот файл — живой документ. Возвращаемся к нему при планировании каждого следующего шага.

---

## Обзор

Приложение выросло из прототипа в нечто, что хочется хостить и использовать регулярно.  
Впереди несколько крупных направлений — каждое влияет на другие, поэтому важно делать в правильном порядке.

---

## Порядок реализации (предлагаемый)

### ✅ Выполнено

| Статус | # | Задача | Сложность |
|--------|---|--------|-----------|
| ✅ | 1 | Тулбар: кнопки периодов (`Segmented`) | ⭐ |
| ✅ | 2 | Бейджи непрочитанных в sidebar | ⭐⭐ |
| ✅ | 3 | Сплиттер (`<Splitter>`) | ⭐ |
| ✅ | 4 | Адаптивные кнопки (текст→иконки) | ⭐⭐⭐ |
| ✅ | 5 | Группы каналов (схема + UI, без PIN) | ⭐⭐⭐ |
| ✅ | 6 | PIN-защита групп | ⭐⭐⭐ |
| ✅ | 7 | Кнопка "Обновить новость" | ⭐ |
| ✅ | 8 | robots.txt + rate limiting + security headers | ⭐ |
| ✅ | 9 | Аутентификация (пароль + TOTP 2FA + JWT) | ⭐⭐⭐⭐ |
| ✅ | 10 | Service Worker кэш медиа | ⭐⭐⭐ |
| ✅ | 11 | Логи (структурированные + ротация) | ⭐⭐ |
| ✅ | 12 | Локализация (i18n: en / ru) | ⭐⭐⭐ |
| ✅ | 13 | Менеджер загрузок медиа (сервер, фоновые задачи, SSE) | ⭐⭐⭐ |
| ✅ | 14 | Режим просмотра «аккордеон» | ⭐⭐⭐⭐ |
| ✅ | 15 | Адаптивный layout (AntD breakpoints, Drawer-сайдбар) | ⭐⭐⭐ |
| ✅ | 16 | Деплой в Azure (Container Apps + Turso) | ⭐⭐⭐ |
| ✅ | 17 | Мониторинг + Fail detection (alertBot, Azure Monitor, smoke test) | ⭐⭐ |
| ✅ | 18 | Accessibility: Tab-навигация, ARIA-роли, focus-ring, MaybeTooltip на touch | ⭐⭐⭐ |
| ✅ | 19 | AI-дайджест (Azure OpenAI / OpenAI) | ⭐⭐⭐ |

### ⬜ Отложено (низкий приоритет)

| Статус | Задача | Зависимости | Сложность |
|--------|--------|-------------|-----------|
| ⬜ | Менеджер загрузок в папку (File System Access API) | SW кэш | ⭐⭐⭐ |
| ⬜ | Клиентская скачка gramjs | Деплой | ⭐⭐⭐⭐⭐ |

### ⬜ Технический долг

| Статус | Задача | Описание | Сложность |
|--------|--------|----------|-----------|
| ⬜ | Перенести jsdom/Readability в worker_threads | `downloadManager.ts` запускает воркеры как обычные async-корутины в главном потоке. Вызов `new JSDOM(html)` + `Readability.parse()` — синхронный CPU-bound код, блокирует event loop на ~100–200 мс на статью. Решение: вынести парсинг в отдельный Worker thread (Node.js `worker_threads`), передавать HTML строкой, получать готовый `fullContent`. | ⭐⭐⭐⭐ |
| ⬜ | Дайджест для `news_link` каналов | Сейчас дайджест берёт `news.text` — для `news_link` это только превью. Нужно: перед генерацией дайджеста сервер загружает `fullContent` для items без него (через download manager, priority=10), ждёт завершения, потом генерирует дайджест используя `COALESCE(full_content, text)`. Зависит от worker_threads задачи выше. | ⭐⭐⭐ |
| ⬜ | Проверка дубликата при добавлении канала | `POST /api/channels` уже возвращает 409 при UNIQUE-конфликте, но форма просто бросает ошибку без понятного сообщения. Нужно: при вводе telegram_id делать lookup и если канал уже есть в БД — показывать предупреждение прямо в форме (не после Submit). | ⭐ |

### ⬜ В очереди (новые фичи)

| Статус | Задача | Описание | Сложность |
|--------|--------|----------|-----------|
| ⬜ | Сортировка каналов и групп | Пользователь вручную задаёт порядок каналов и групп. Варианты: (A) drag-and-drop прямо в сайдбаре (`@dnd-kit`); (B) отдельный диалог «Упорядочить» со списком. Поле `sort_order` в БД уже есть. На мобильных drag-n-drop неудобен → вариант B предпочтительнее или кнопки ↑↓. | ⭐⭐⭐ |
| ⬜ | Space на последней прочитанной → refresh | Если пользователь находится на последней новости и она уже прочитана, нажатие Space должно запускать дефолтный refresh канала (как кнопка ↻). Это закрывает «что делать дальше» без отрыва рук от клавиатуры. | ⭐⭐ |
| ⬜ | Pull-to-refresh на мобильных | Аналог Space-refresh для тач: потянуть список вниз (overscroll) → refresh канала. Варианты: нативный `overscroll-behavior` + touch events; или Ant Design `PullRefresh` (если появится в v6). Нужно не конфликтовать с нативным pull-to-refresh браузера. | ⭐⭐⭐ |
| ⬜ | Минимизировать хедеры на мобильных | На маленьких экранах `AppHeader` (64px) + `NewsFeedToolbar` + заголовок аккордеона съедают ~50% высоты. Варианты: (A) `AppHeader` скрывается при скролле вниз (sticky-hide); (B) `NewsFeedToolbar` схлопывается в одну строку с overflow-меню; (C) отдельный компактный мобильный тулбар. | ⭐⭐⭐ |
| ⬜ | Сквозной медиа-просмотр | Клик по картинке открывает лайтбокс поверх всего контента: затемнение, полноэкранное фото/видео, навигация стрелками/скроллом **по всем новостям канала** (не только альбом текущего поста). Горячие клавиши: ←→ для листания, Esc для закрытия. Для медиа-каналов: просмотренные новости автоматически помечаются прочитанными; для остальных типов — нет. | ⭐⭐⭐⭐ |

---

## 1–4. Sidebar: Segmented, бейджи, сплиттер, адаптивные кнопки ✅

### Тулбар: кнопки периодов (Segmented) ✅

**Реализовано**:
- `[↻]` — отдельная кнопка, всегда кликабельна, fetch с `readInboxMaxId` из Telegram (или fallback через `getSinceDate`)
- `<Segmented>` с периодами `[1д][3д][5д][7д][14д]` + `[↺]` (с последней синхронизации)
- При смене канала выбор сбрасывается
- Кнопки без начального выбора — каждый клик триггерит fetch

### Бейджи непрочитанных ✅

**Реализовано**:
- `unreadCount` в `GET /api/channels` (LEFT JOIN с news WHERE is_read = 0)
- `pendingCounts` в `uiStore` — сообщения в Telegram, ещё не скачанные
- Бейдж показывает `unreadCount + pendingCounts[channelId]`
- Бейдж позиционирован **справа от кнопок** действий (всегда виден)
- Кнопка **"Обновить"** → `POST /api/channels/count-unread` — **только считает** новые сообщения в Telegram без скачки; использует `lastFetchedAt` как точку отсчёта (не `getSinceDate`/`lastReadAt` — иначе уже загруженные непрочитанные считались бы дважды)
- При выгрузке канала (`useFetchChannel`) `pendingCount` для него сбрасывается
- `getSinceDate(channel)` — shared helper для **fetch-роута**: `lastReadAt` → `lastFetchedAt` → `-N дней`; **не используется** в `count-unread`

**Логика "Обновить"** (без fetch, только count):
- Считаем с `lastFetchedAt` (последняя синхронизация с БД)
- Новый канал (нет `lastFetchedAt`) → `-N дней`
- ⚠️ Намеренно **не** используем `lastReadAt` — иначе уже скачанные непрочитанные сообщения учитывались бы дважды (в `unreadCount` из БД и в `pendingCounts`)

### Сплиттер (resizable sidebar) ✅

**Реализовано**: `<Splitter>` из Ant Design 6, `defaultSize=280`, `min=200`, `max=500`.

### Адаптивные кнопки (текст→иконки) ✅

**Реализовано** через **CSS Container Queries** — нативный браузерный стандарт, без JS:

```css
.channel-sidebar__header {
  container-type: inline-size;
}
@container (max-width: 300px) {
  .btn-text { display: none; }
}
```

Текст "Обновить" и "Добавить" скрывается при ширине сайдбара ≤ 300px.  
`flex-shrink: 0` на заголовке "Каналы" предотвращает его сжатие.

---

## 5–6. Группы каналов с PIN ✅

**Задача**: каналы можно объединять в группы. Группа может быть защищена 4-значным PIN.

### Схема БД

```sqlite
CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1677ff',
  pin_hash TEXT,        -- bcrypt(pin, saltRounds=10) или NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- channels добавлено:
-- group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL
-- sort_order INTEGER NOT NULL DEFAULT 0
```

### Реализовано

- `GroupPanel` — левая панель с фиксированной шириной (~72px) перед `ChannelSidebar`
- Каждая группа: квадратная кнопка с иконкой `FolderFilled` в цвете группы, название под иконкой
- Фон кнопки: radial-gradient в цвет группы через CSS `color-mix`
- Бейдж непрочитанных на каждой группе (включая "Общее")
- "Общее" — первый элемент, показывает каналы без group_id
- Правый клик на группе → контекстное меню (Редактировать / Удалить)
- При удалении группы → каналы переходят в "Общее"
- `ChannelSidebar` фильтрует каналы по `selectedGroupId`
- В форме добавления/редактирования канала есть Select для выбора группы

### PIN-защита

- Хранится: `bcrypt(pin, saltRounds=10)` в колонке `pin_hash`
- При клике на закрытую группу → модальное окно `Input.OTP` (4 цифры)
- `POST /api/groups/:id/verify-pin` проверяет bcrypt
- После успеха → `unlockGroup(id)` в `uiStore` (in-memory Set, сбрасывается при перезагрузке)

### API

- `GET /api/groups` — список групп (без `pin_hash`, только `hasPIN: boolean`)
- `POST /api/groups` — создать
- `PUT /api/groups/:id` — обновить (pin: null = убрать PIN)
- `DELETE /api/groups/:id` — удалить (каналы → group_id = null)
- `POST /api/groups/:id/verify-pin` — проверить PIN

**Сложность**: ⭐⭐⭐ Средняя. Реализовано.

---

## 7. Кнопка "Обновить новость" ✅

**Задача**: перечитать одну новость из БД (инвалидировать кэш конкретного item).

**Реализация**:
- `GET /api/news/:id` уже есть
- На клиенте: `queryClient.invalidateQueries({ queryKey: ['news', channelId] })`
- В `NewsDetail` добавлена иконка `<ReloadOutlined>`

**Зачем нужна**: после скачки медиа нужно обновить `localMediaPath` в UI без перезагрузки всего списка.

**Сложность**: ⭐ Минимальная.

---

## 8. Безопасность: robots.txt, rate limiting, security headers ✅

**Реализовано**:
- `public/robots.txt` — запрещает индексацию (`Disallow: /`)
- `X-Robots-Tag: noindex` header в Hono middleware
- Rate limiting через `hono-rate-limiter` — 120 req/min на IP, только в production
- `rateLimit.ts` логирует хиты с IP + path на уровне `warn`

---

## 9. Аутентификация (пароль + TOTP 2FA + JWT) ✅

**Задача**: защитить приложение — один пользователь (admin), вход по паролю + опционально TOTP 2FA.

### Схема БД

```sqlite
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- bcrypt(password, 12)
  totp_secret TEXT,              -- base32 TOTP secret (NULL = 2FA не включён)
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- UUID v4
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,  -- bcrypt(token, 10)
  expires_at INTEGER NOT NULL,   -- unixepoch
  unlocked_group_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of group IDs unlocked by PIN
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Первый пользователь создаётся **напрямую через скрипт** (`npm run auth:create-user`) — никакой регистрации через UI.

### Стратегия токенов

- **Access token**: JWT, 15 минут, хранится **только в памяти** (React state/variable), НЕ в localStorage
- **Refresh token**: UUID, 7 дней, хранится в **httpOnly cookie** (недоступен JS), хэш в таблице `sessions`
- Payload access token: `{ userId, role, unlockedGroupIds: number[] }`

### TOTP 2FA

- Пакет: `otpauth` (npm) — полностью бесплатно
- QR-код генерируется один раз при включении 2FA → пользователь сканирует Google/Apple Authenticator
- При входе: если `totp_secret` задан → требуем 6-значный код

### Маршруты auth

```
POST /api/auth/login          — email + password [+ totp_code]
POST /api/auth/refresh        — обновить access token через refresh cookie
POST /api/auth/logout         — удалить сессию + очистить cookie
POST /api/auth/totp/setup     — получить QR-код для 2FA
POST /api/auth/totp/confirm   — подтвердить и активировать 2FA
GET  /api/auth/sessions       — список активных сессий
DELETE /api/auth/sessions/:id — отозвать сессию
```

**Сложность**: ⭐⭐⭐⭐. Реализовано.

---

## 10. Service Worker кэш медиа ✅

**Реализовано** (`public/sw.js`):
- **Cache-First** стратегия для `GET /api/media/*`
- Стрипает `?token=` из ключа кэша — JWT-ротация не сбрасывает кэш
- Максимум 2000 записей, TTL 30 дней (настраивается через `postMessage`)
- Регистрируется только в production (`import.meta.env.DEV` guard)
- Кнопка **"Очистить кэш медиа"** в меню пользователя (`AppHeader`) → `clearSwCache()`
- `getSwStats()` → `SwStats` для отображения статистики кэша

**Сложность**: ⭐⭐⭐. Реализовано.

---

## 11. Логи (структурированные + ротация) ✅

**Задача**: структурированные логи на сервере — удобно читать как локально, так и в Azure Monitor / stdout контейнера.

### Стек

- **`pino`** — самый быстрый Node.js логгер, JSON-вывод, zero-cost в prod
- **`pino-pretty`** — человекочитаемый вывод в dev-режиме (только devDep)

### Что логировать

| Уровень | Событие |
|---------|---------|
| `info` | Старт сервера, worker pool запущен, fetch канала (inserted/total) |
| `info` | Download task: started / done / auto-deleted |
| `warn` | Task failed (с ошибкой), Telegram недоступен (`isUnavailable=1`) |
| `warn` | Auth: неверный пароль / TOTP (без email в логе) |
| `error` | Необработанное исключение, crash worker |
| `debug` | (только dev) детали Telegram-запросов, SQL-запросы |

### Структура лога (JSON)

```json
{ "level": "info", "time": 1742300000, "module": "download", "taskId": 42, "newsId": 7, "type": "media", "msg": "done" }
```

### Конфиг

```ts
// server/logger.ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty' } : undefined,
});
```

В Azure Container Apps — stdout → Azure Log Analytics автоматически.

**Сложность**: ⭐⭐. Реализовано.

---

## 12. Локализация (i18n: en / ru) ✅

**Задача**: перевести весь UI на английский, сохранив русский как fallback. Переключатель языка в хедере.

### Стек

- **react-i18next** + **i18next** + **i18next-browser-languagedetector**
- Файлы переводов: `src/client/locales/{en,ru}/translation.json`
- **EN по умолчанию**, RU как fallback; язык сохраняется в `localStorage`

### Реализовано

- Все строки UI через `t()`, включая Modal.confirm, Tooltip, aria-label
- Ant Design locale динамически через `<ConfigProvider locale={antdLocale}>`
- Переключатель языка в меню пользователя (SVG-флаги FlagRU/FlagUS)
- Ключи организованы по разделам: `sidebar.*`, `channels.*`, `groups.*`, `news.*`, `auth.*`, `header.*`, `downloads.*`, `filters.*`, `common.*`

**Сложность**: ⭐⭐⭐. Реализовано.

---

## 13. Менеджер загрузок медиа (сервер) ✅

**Задача**: фоновая скачка медиафайлов с Telegram на диск сервера с отображением прогресса.

### Реализовано

- `downloads` таблица: `id, news_id, type ('media'|'article'), url, priority, status, error, created_at, processed_at` + `UNIQUE(news_id, type)`
- `enqueueTask(newsId, type, url?, priority=0)` — INSERT with `onConflictDoUpdate`, resets failed → pending
- `startWorkerPool(n)` — N воркеров (`DOWNLOAD_WORKER_CONCURRENCY`, default 10); crash recovery на старте
- Приоритеты: 0 = фоновый (лимиты размера), 10 = пользовательский (лимиты пропускаются)
- Автоочистка done-задач через `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` секунд (default 30)
- `GET /api/downloads/stream` — SSE-стрим; `init` + `task_update` события
- `DownloadsPanel` в `AppHeader`: бейдж активных задач + Drawer; `DownloadsPinnedContent` — inline-сайдбар (только xxl); `DownloadTaskList` — общий список задач

**Сложность**: ⭐⭐⭐. Реализовано.

---

## 14. Режим просмотра «аккордеон» ✅

**Задача**: список новостей во всю ширину, каждая новость — раскрывающийся аккордеон.

### Реализовано

- `newsViewMode: 'list' | 'accordion'` в `uiStore` (persisted в `localStorage`)
- Переключатель в `NewsFeedToolbar` (скрыт на мобильных)
- `NewsFeedList` (list mode) и `NewsAccordionList` + `NewsAccordionItem` (accordion mode)
- `effectiveViewMode` в `NewsFeed` — на мобильных (`< 768px`) принудительно аккордеон
- `NewsDetail` поддерживает `variant='panel'` (list mode) и `variant='inline'` (accordion)
- При нажатии "Прочитано" — новость схлопывается, фокус переходит на следующую

**Сложность**: ⭐⭐⭐⭐. Реализовано.

---

## 15. Адаптивный layout (AntD breakpoints, Drawer-сайдбар) ✅

**Задача**: приложение нормально работает на любом экране — от телефона до большого монитора.

### Реализовано

- `src/client/hooks/breakpoints.ts` — константы BP_SM/MD/LG/XL/XXL (совпадают с Ant Design)
- `<Splitter>` (resizable sidebar) только на `xxl` (≥ 1600px)
- На `< xxl`: sidebar (GroupPanel + ChannelSidebar) в `<Drawer>`
- `AppHeader`: hamburger-кнопка для открытия Drawer, компактный layout
- `NewsFeed`: accordion-mode принудительно ниже 768px
- `DownloadsPanel`: pinned-режим только на `xxl`
- `sidebarDrawerOpen` в `uiStore`

**Открытые вопросы**:
- Тач-таргеты (44px HIG): тулбарные кнопки в целом ок, но хэштег-теги и checkbox можно увеличить
- Safari iOS: `<Splitter>` включается только на ≥ 1600px, на тач не активен

**Сложность**: ⭐⭐⭐. Реализовано.

---

## 16. Деплой в Azure (Container Apps + Turso) ✅

### Стек

| Компонент | Сервис | ~Цена/мес |
|---|---|---|
| Бэкенд (Hono + Node) | Container Apps | ~$5–15 (0.25 vCPU, 0.5 GB RAM) |
| База данных | **Turso** | $0–29 |
| Образы | Azure Container Registry (Basic) | $5 |
| Домен + SSL | Container Apps встроенный TLS | ~$0.5 |

### Turso — подключение через переменные окружения

`@libsql/client` уже установлен. `db/index.ts` читает `DATABASE_URL` при старте: если задана — подключается к Turso (+ `TURSO_AUTH_TOKEN`), иначе использует локальный `file:data/db.sqlite`.

> ⚠️ **Создание пользователя в Turso**: временно пропишите `DATABASE_URL` + `TURSO_AUTH_TOKEN` в локальный `.env`, запустите скрипт, затем уберите:
> ```bash
> npm run auth:create-user -- your@email.com YourPassword123!
> ```

### CI/CD

- GitHub Actions: push → build Docker image → push to ACR → deploy to Container Apps
- **Base image**: `node:22-bookworm-slim` (Debian 12, glibc — совместим с `@libsql/client` и `jsdom`)
- Multi-stage Dockerfile: builder → runner (prodDeps only + `dist/`)

### Переменные окружения (prod)

> ⚠️ **`--set-env-vars` в Azure CLI заменяет ВСЬ список, а не добавляет к нему.**  
> Изменяй env vars через **Azure Portal** (UI) или передавай **полный список** всех переменных сразу.  
> Секретные значения храни в Secrets Container App и ссылайся на них через `secretref:secret-name`.

**Обязательные (прод упадёт без них):**
```
NODE_ENV=production
TG_API_ID          → secretref:tg-api-id
TG_API_HASH        → secretref:tg-api-hash
TG_SESSION         → secretref:tg-session
DATABASE_URL       → secretref:database-url
TURSO_AUTH_TOKEN   → secretref:turso-auth-token
JWT_SECRET         → secretref:jwt-secret
ALLOWED_ORIGIN=https://yourdomain.com
```

**Опциональные (есть дефолты или no-op при отсутствии):**
```
ALERT_BOT_TOKEN    → secretref:alert-bot-token   (alertBot, no-op если не задан)
ALERT_CHAT_ID      → secretref:alert-chat-id
AZURE_OPENAI_ENDPOINT → secretref:azure-openai-endpoint  (AI-дайджест)
AZURE_OPENAI_KEY   → secretref:azure-openai-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
OPENAI_API_KEY     → secretref:openai-api-key   (fallback если Azure не задан)
LOG_LEVEL=info
```

**Сложность**: ⭐⭐⭐. Реализовано.

---

## 17. Мониторинг + Fail detection ✅

**Задача**: знать об упавшем приложении раньше, чем пользователь заметит.

### Реализовано

#### 1. Post-deploy smoke test (`.github/workflows/build-main.yml`)

После `az containerapp update` — цикл `curl` на `/api/health` каждые 10 секунд до 3 минут.

#### 2. alertBot — мгновенные Telegram-уведомления (`src/server/services/alertBot.ts`)

No-op если env vars не заданы. Срабатывает при: `uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, старт сервера в prod.

```bash
# ⚠️ ВАЖНО: --set-env-vars ЗАМЕНЯЕТ весь список env vars, а не добавляет к нему!
# Если задать только ALERT_BOT_TOKEN и ALERT_CHAT_ID — все остальные переменные удалятся.
#
# Безопасный способ 1: Azure Portal → Container App → Configuration → Environment variables
#   → добавить отдельные переменные через UI (не затрагивает остальные).
#
# Безопасный способ 2: CLI с полным списком ВСЕХ нужных переменных:
#   (для секретов используй secretref:secret-name, если значение уже в Secrets)
az containerapp update --name tg-news-reader --resource-group personal-apps-rg \
  --set-env-vars \
    NODE_ENV=production \
    ALLOWED_ORIGIN=https://yourdomain.com \
    TG_API_ID=secretref:tg-api-id \
    TG_API_HASH=secretref:tg-api-hash \
    TG_SESSION=secretref:tg-session \
    DATABASE_URL=secretref:database-url \
    TURSO_AUTH_TOKEN=secretref:turso-auth-token \
    JWT_SECRET=secretref:jwt-secret \
    ALERT_BOT_TOKEN=secretref:alert-bot-token \
    ALERT_CHAT_ID=secretref:alert-chat-id \
    AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint \
    AZURE_OPENAI_KEY=secretref:azure-openai-key \
    AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini \
    OPENAI_API_KEY=secretref:openai-api-key
```

#### 3. Azure Monitor Alerts (задеплоены в `personal-apps-rg`)

| Правило | Триггер | Задержка |
|---|---|---|
| `tg-reader-error-logs` | KQL: `log.level >= 50` за 5 мин | 1–5 мин |
| `tg-reader-restart` | Метрика: `RestartCount > 0` за 5 мин | 1–5 мин |

Пересоздать: `scripts/setup-monitoring.sh`. На Windows/PowerShell — через `az rest --body @file.json` (референс: `C:\Users\dshilov\alert-kql-rule.json`).

#### 4. UptimeRobot (опционально)

Проверяет `/api/health` снаружи каждые 5 минут. Ловит: упал регион Azure, завис event loop.

### Итоговый стек уведомлений

| Событие | Канал | Задержка |
|---|---|---|
| `uncaughtException` / worker crash / circuit OPEN | alertBot → Telegram | мгновенно |
| Deploy failed (CI) | GitHub Actions → Telegram | мгновенно |
| `logger.error` / `logger.fatal` | Azure Monitor KQL → email | 1–5 мин |
| Container restart / OOM | Azure Monitor Metric → email | 1–5 мин |
| Сервер не отвечает | UptimeRobot → Telegram/email | ≤5 мин |

**Сложность**: ⭐⭐. Реализовано.

---

## 18. Accessibility (a11y) ✅

### Цель

Клавиатурная навигация и ARIA-роли. Правильная структура ускоряет работу даже без скрин-ридера.

### Что сделано

#### 18.1 Фокус и Tab-навигация ✅

- [x] **`ChannelItem`**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter/Space), `:focus-visible` + `:focus-within` показывает кнопки действий
- [x] **`GroupItem`**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown`, `:focus-visible` outline цветом группы
- [x] **`GroupPanel` "Общее"**: аналогично GroupItem; панель обёрнута в `<nav aria-label>`
- [x] **`NewsListItem`**: `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter), `:focus-visible`
- [x] **`NewsDetailToolbar` toolbarMeta**: `onKeyDown` для Enter — уже был ✅

#### 18.2 ARIA-роли и атрибуты ✅

- [x] **`ChannelSidebar`**: обёртка → `<nav aria-label>`, список → `role="listbox" aria-label`
- [x] **`GroupPanel`**: обёртка → `<nav aria-label>`
- [x] **`NewsFeedList`**: `role="listbox" aria-label`
- [x] **`NewsAccordionList`**: `role="list" aria-label`
- [x] **`NewsAccordionItem`**: `aria-expanded={isSelected}`
- [x] **`AppHeader`**: `aria-label` на кнопке темы и меню пользователя
- [x] Новые i18n-ключи: `groups.panel_label`, `news.list.list_label`, `header.user_menu_label` (EN + RU)

#### 18.3 Focus-visible стили ✅

- [x] Кастомные элементы: `outline: 2px solid ${token.colorPrimary}` в `createStyles`
- [x] Ant Design кнопки: `box-shadow: 0 0 0 2px var(--tgr-color-primary)` (сохраняет border-radius)
- [x] Primary-кнопки: двойное кольцо — белый зазор + primary ring
- [x] Segmented: `:has(input:focus-visible)` на родительском item
- [x] Checkbox: `box-shadow` на `.ant-checkbox-inner`

#### 18.4 Клавиатурный эквивалент для кликов ✅

- [x] `ChannelItem`, `GroupItem`, "Общее": Enter/Space → выбор
- [x] `NewsListItem`: Enter → выбор
- [x] `useNewsHotkeys`: добавлены `button` и `a` в guard
- [x] Исправлен баг: `markRead.mutate` не передавал `channelId`

#### 18.5 Мобильная доступность ✅

- [x] `MaybeTooltip` (`src/client/components/common/MaybeTooltip.tsx`): на `pointer: coarse` рендерит только детей без тултипа. Заменены все 9 файлов с `<Tooltip>`

### Что намеренно оставлено на будущее

- [ ] Skip-link (`<a href="#main-content">Перейти к контенту</a>`)
- [ ] Фокус-менеджмент при открытии/закрытии Drawer
- [ ] Перевод фокуса в `NewsDetail` при выборе новости в list-режиме
- [ ] `DownloadsPanel`: `aria-live="polite"` на счётчике задач
- [ ] `NewsDetailMedia`: `tabIndex` на кнопках Prev/Next в карусели альбома
- [ ] Lighthouse / axe аудит (целевой балл ≥ 90)

---

## 19. AI-дайджест ⬜

**Задача**: после накопления новостей за период попросить ИИ сделать краткий дайджест — что произошло, главные темы, на что стоит обратить внимание.

### Провайдер: Azure OpenAI vs OpenAI напрямую

| | Azure OpenAI | OpenAI API |
|---|---|---|
| Для продакшна (Azure) | ✅ Всё в одной подписке | — |
| Для локальной разработки | Нужен провижининг | ✅ Проще, сразу работает |
| SDK | `openai` npm (умеет оба) | `openai` npm |
| Цена | ~$2.50/1M input tokens | ~$2.50/1M input tokens |

**Стратегия**: один код, два провайдера через `baseURL` переключатель:

```ts
const client = process.env.AZURE_OPENAI_ENDPOINT
  ? new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### API

```
POST /api/digest
Body: { channelIds?: number[], groupId?: number | null, since?: string, until?: string }
Response: SSE stream (text/event-stream)
```

### UI

Кнопка **"Дайджест ✨"** в тулбаре. Ответ стримится в `<Drawer>` с `react-markdown`.

### Ограничения контекста

- Отправляем только `text` (без `fullContent`, без медиа)
- Если новостей > 200 — берём последние 200

**Сложность**: ⭐⭐⭐ Средняя.

---

## 20. Клиентская скачка gramjs ⬜ (отложено)

**Задача**: качать медиа напрямую с Telegram CDN из браузера, минуя диск сервера.

### Варианты

- **Вариант A**: сервер отдаёт `{ fileId, accessHash, dcId, fileReference }`, клиент качает через gramjs
- **Вариант B**: сервер отдаёт подписанный прокси-URL

**Откладываем** до реального деплоя в Azure — тогда экономия на трафике станет актуальной.

**Сложность**: ⭐⭐⭐⭐⭐ Высокая (gramjs в браузере + сессия).

---

## 21. Менеджер загрузок медиа в папку ⬜ (отложено)

**Задача**: выбрать каналы, нажать "Выгрузить медиа" — все медиафайлы скачиваются в папку.

### Технология

- **File System Access API**: `showDirectoryPicker()` → пользователь выбирает папку
- Браузеры: Chrome/Edge ✅, Safari 15.2+ ✅, **Firefox ❌**

**Зависит от**: пункт 20 (хотя бы частично).

**Сложность**: ⭐⭐⭐ Средняя.

---

## Открытые вопросы

1. **SW кэш и мобильный**: если захочется открыть с телефона — SW работает, но File System Access API нет.
2. **gramjs в браузере**: нужно ли создавать отдельную сессию или шарить основную? Шарить проще, но менее безопасно.
3. **better-auth vs ручная реализация**: выбрана ручная (bcryptjs + hono/jwt + otpauth). Пересмотреть если добавим OAuth (Google/GitHub) или Passkeys.

---

## Технический долг (зафиксировать и не забыть)

- [x] Ротация Telegram сессии (TG_SESSION попал в чат) — перевыпущена через `npm run tg:auth`, старая сессия завершена вручную
- [x] Перенести `applyFilters` полностью на сервер (server-side filtering через `json_each()`)
- [x] Вынести логику расчёта `sinceDate` в shared helper (`getSinceDate` в channels.ts; `count-unread` намеренно использует `lastFetchedAt` напрямую)
- [ ] Индексы SQLite на `channel_id + is_read` (уже есть, но проверить при росте данных)
- [x] При деплое: SQLite → Turso — `db/index.ts` читает `DATABASE_URL`+`TURSO_AUTH_TOKEN`; fallback на `file:data/db.sqlite` локально
- [x] robots.txt + X-Robots-Tag header + rate limiting (production only)
- [x] `getChannelInfo` в telegram.ts — автозаполнение названия/описания при добавлении канала (`GET /api/channels/lookup`)
- [x] Настроить git user.name/email
- [x] Баг двойного счётчика непрочитанных — исправлено на `lastFetchedAt` в `count-unread`
- [x] `GroupPanel` разбит на `GroupItem` + `GroupFormModal` + `GroupPinModal`; бейдж учитывает `pendingCounts`
- [x] Service Worker кэш медиа: Cache-First для `/api/media/*`; стрипает `?token=`; 2000 записей / 30 дней TTL; кнопка очистки в AppHeader
- [x] Структурированные логи через pino: pino-pretty в dev, JSON в prod; access-log; auth-попытки (без email/пароля); rate-limit хиты; uncaughtException/unhandledRejection
- [x] Локализация: EN по умолчанию, RU fallback; переключатель в хедере; SVG-флаги
- [x] Менеджер загрузок медиа: `downloads` таблица + воркеры; SSE-прогресс; DownloadsPanel + DownloadsPinnedContent
- [x] Аккордион-режим: `newsViewMode` в uiStore (persisted); NewsAccordionList + NewsAccordionItem; мобильные — всегда аккордеон
- [x] Адаптивный layout: `useMatchMedia`; BP-константы; Splitter только на xxl; Drawer на < xxl; DownloadsPanel pinned только на xxl
- [x] Мониторинг: alertBot; Azure Monitor KQL + Metric alerts в personal-apps-rg; smoke test в CI; Notify failure (Telegram) в workflow
- [x] Accessibility: `role`/`aria-selected`/`tabIndex`/`onKeyDown` на ChannelItem/GroupItem/NewsListItem/"Общее"; `<nav>`+`role="listbox/list"` на контейнерах; `aria-expanded` на NewsAccordionItem; focus-ring (box-shadow + двойное кольцо для primary); MaybeTooltip на touch; Segmented focus через `:has()`; исправлен баг `markRead` без `channelId`
- [x] Instant View (IV): `telegram.ts` при фетче парсит `MessageMediaWebPage.webpage.cachedPage.blocks` через `richTextToString` + `extractInstantViewText`; текст сохраняется в `news.fullContent` сразу при INSERT; в `link_continuation` каналах кнопка "Загрузить статью" не показывается если IV уже есть
- [x] media_content авто-фильтр: `GET /api/news?filtered=1` добавляет `mediaType IN ('photo','document')` для каналов типа `media_content`; сообщения без реального медиа (text-only, webpage) скрыты, но видны через "Показать все"
- [x] Аудио-сообщения: `telegram.ts` определяет `mediaType='audio'` по MIME `audio/*`; авто-скачка никогда не запускается (ignoreLimit=false → return null); `downloadMessageMedia` поддерживает ogg/mp3/m4a/flac/wav для ручной скачки; `MediaContentStrategy` пропускает аудио при авто-очереди; `NewsListItem` показывает иконку `SoundOutlined`; `NewsDetailMedia` показывает `<audio controls>` когда файл скачан
- [x] Теги в аккордеоне: создан `NewsHashtags.tsx` (shared component) — рендерит теги с Dropdown (show/addFilter) и `e.stopPropagation()`; используется везде вместо inline Dropdown+Tag; `onTagClick` прокинут через `NewsAccordionItem → NewsDetail → NewsDetailToolbar`; теги в развёрнутом заголовке больше не схлопывают аккордеон
- [x] Навигация после фильтрации тега: `useEffect` в `NewsFeed` теперь ищет следующую непрочитанную ПОСЛЕ текущей позиции в `newsItems`, а не первую глобально; fallback на первую глобальную если нет следующей
- [x] Sticky header в аккордеоне: `headerInline: position: sticky; top: 0; z-index: 10` — кнопки Прочитано/Обновить/Открыть всегда видны при скролле длинной новости
- [x] Производительность фильтров (80+): `applyFilters` использует `Set<string>` для тегов → O(T) вместо O(F×T) на новость; `FilterPanel` таблица получила пагинацию по 20 строк при filters.length > 20
