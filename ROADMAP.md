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
| ✅ | 14 | Режим просмотра «аккордион» | ⭐⭐⭐⭐ |
| ✅ | 15 | Адаптивный layout (AntD breakpoints, Drawer-сайдбар) | ⭐⭐⭐ |
| ✅ | 16 | Деплой в Azure (Container Apps + Turso) | ⭐⭐⭐ |
| ✅ | 17 | Мониторинг + Fail detection (alertBot, Azure Monitor, smoke test) | ⭐⭐ |

### ⬜ В работе / Следующие

| Статус | Приоритет | Задача | Зависимости | Сложность |
|--------|-----------|--------|-------------|-----------|
| ⬜ | 🟢 | AI-дайджест (Azure OpenAI / OpenAI) | — | ⭐⭐⭐ |
| ⬜ | 🟢 | Accessibility: фокус по Tab, ARIA-роли, a11y-аудит | — | ⭐⭐⭐ |

### ⬜ Отложено (низкий приоритет)

| Статус | Задача | Зависимости | Сложность |
|--------|--------|-------------|-----------|
| ⬜ | Менеджер загрузок в папку (File System Access API) | SW кэш | ⭐⭐⭐ |
| ⬜ | Клиентская скачка gramjs | Деплой | ⭐⭐⭐⭐⭐ |

---

## 1. Sidebar: бейджи + сплиттер ✅

### Бейджи непрочитанных ✅

**Задача**: показать количество непрочитанных рядом с каналом.

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

## 2. Группы каналов с PIN ✅

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

## 3. Аккордион-режим просмотра новостей ✅

**Задача**: список новостей во всю ширину, каждая новость — раскрывающийся аккордион.

**Реализовано**:
- `newsViewMode: 'list' | 'accordion'` в `uiStore` (persisted в `localStorage`)
- Переключатель в `NewsFeedToolbar` (скрыт на мобильных)
- `NewsFeedList` (list mode) и `NewsAccordionList` + `NewsAccordionItem` (accordion mode)
- `effectiveViewMode` в `NewsFeed` — на мобильных (`< 1200px`) принудительно аккордион
- `NewsDetail` поддерживает `variant='panel'` (list mode) и `variant='inline'` (accordion)
- При нажатии "Прочитано" — новость схлопывается, фокус переходит на следующую

**Сложность**: ⭐⭐⭐⭐ Высокая. Реализовано.

---

## 3b. Адаптивный layout ✅

**Задача**: приложение нормально работает на любом экране — от телефона до большого монитора.

**Реализовано**:
- `src/client/hooks/breakpoints.ts` — константы BP_SM/MD/LG/XL/XXL (совпадают с Ant Design)
- `Grid.useBreakpoint()` из AntD повсюду вместо кастомного хука
- `<Splitter>` (resizable sidebar) только на `xxl` (≥ 1600px)
- На `< xxl` (`xl`, `lg`, `md`, `sm`, `xs`): sidebar (GroupPanel + ChannelSidebar) в `<Drawer>`
- `AppHeader`: hamburger-кнопка для открытия Drawer, компактный layout
- `NewsFeed`: accordion-mode принудительно ниже `xl` (< 1200px)
- `DownloadsPanel`: pinned-режим только на `xxl`
- `sidebarDrawerOpen` в `uiStore`; `setSelectedChannelId` автоматически закрывает Drawer

**Сложность**: ⭐⭐⭐ Средняя. Реализовано.

---

## 3c. Менеджер загрузок медиа (сервер) ✅

**Задача**: фоновая скачка медиафайлов с Telegram на диск сервера с отображением прогресса.

**Реализовано**:
- `downloads` таблица: `id, news_id, type ('media'|'article'), url, priority, status, error, created_at, processed_at` + `UNIQUE(news_id, type)`
- `enqueueTask(newsId, type, url?, priority=0)` — INSERT with `onConflictDoUpdate`, resets failed → pending
- `startWorkerPool(n)` — N воркеров (`DOWNLOAD_WORKER_CONCURRENCY`, default 10); crash recovery на старте
- Приоритеты: 0 = фоновый (лимиты размера), 10 = пользовательский (лимиты пропускаются)
- Автоочистка done-задач через `DOWNLOAD_TASK_CLEANUP_DELAY_SEC` секунд (default 30)
- `GET /api/downloads/stream` — SSE-стрим; `init` + `task_update` события
- `DownloadsPanel` в `AppHeader`: бейдж активных задач + Drawer; `DownloadsPinnedContent` — inline-сайдбар (только xxl); `DownloadTaskList` — общий список задач

**Сложность**: ⭐⭐⭐ Средняя. Реализовано.

---

## 4. Тулбар: кнопки периодов ✅

**Задача**: заменить `Dropdown.Button` на группу кнопок-периодов.

**Реализовано**:
- `[↻]` — отдельная кнопка, всегда кликабельна, fetch с `readInboxMaxId` из Telegram (или fallback через `getSinceDate`)
- `<Segmented>` с периодами `[3д][5д][7д][14д]` + `[↺]` (с последней синхронизации)
- При смене канала выбор сбрасывается
- Кнопки без начального выбора — каждый клик триггерит fetch

---

## 5. Кнопка "Обновить новость" ✅

**Задача**: перечитать одну новость из БД (инвалидировать кэш конкретного item).

**Реализация**:
- `GET /api/news/:id` уже есть
- На клиенте: `queryClient.invalidateQueries({ queryKey: ['news', channelId] })`  
  или точечно через `queryClient.setQueryData`
- В `NewsDetail` добавить иконку `<ReloadOutlined>`

**Зачем нужна**: после скачки медиа на клиенте (пункт 6) нужно обновить `localMediaPath` или ссылку.

**Сложность**: ⭐ Минимальная.

---

## 6. Клиентская скачка медиа (ключевой пункт)

Это самый сложный и важный пункт. Разберём детально.

### Контекст проблемы

Сейчас: Telegram → сервер → диск сервера → клиент  
Желаемо: Telegram → клиент (браузер) → Service Worker cache / папка на диске

### Технические факты

1. **gramjs работает в браузере** (WebSocket вместо TCP, IndexedDB вместо файловой сессии)
2. **`file_reference` нужен для скачки** и привязан к сессии — нужна либо та же сессия, либо новая
3. **Вариант A**: сервер отдаёт `{ fileId, accessHash, dcId, fileReference }`, клиент качает через gramjs
4. **Вариант B**: сервер отдаёт подписанный прокси-URL, клиент качает через него (меньше изменений)
5. **Service Worker** может кэшировать запросы к `/api/media/...` — это уже работает с текущей архитектурой

### Стратегия: два этапа

#### Этап 6.1 — Service Worker кэш (делаем сейчас)

- SW перехватывает `GET /api/media/:path`
- Если есть в кэше → отдаёт из кэша
- Если нет → запрашивает сервер, кэширует, отдаёт
- Настройки: максимальный размер кэша (через Cache Storage API + Quota API)
- Реализация через **Workbox** (от Google, стандарт для SW)

**Это ничего не меняет в архитектуре сервера** — просто добавляем SW на клиент.

#### Этап 6.2 — Клиентская скачка через gramjs (для Azure-деплоя)

- Сервер: `GET /api/news/:id/media-ref` → возвращает свежий `file_reference` + метаданные
- Клиент: инициализирует gramjs с сессией (через `StringSession`) 
- Клиент качает файл напрямую с Telegram CDN
- SW кэширует результат

**Вопрос сессии**: для личного использования — можно передать `TG_SESSION` как переменная окружения в клиентский бандл (только для self-hosted/local). Для публичного деплоя — нужна отдельная auth на клиенте.

**Пока откладываем 6.2** до момента реального деплоя в Azure — тогда экономия на трафике станет актуальной.

### Service Worker: настройки кэша

```tsx
// Настройки (хранятся в localStorage)
interface MediaCacheSettings {
  maxCacheSizeMb: number;       // default: 500
  autoDownloadPhotoMaxMb: number;  // default: 5
  autoDownloadVideoMaxMb: number;  // default: 75
  autoDownloadEnabled: boolean;    // default: true
}
```

UI настроек — отдельная страница/модал "⚙️ Настройки".

**Сложность 6.1**: ⭐⭐⭐ Средняя (Workbox + настройки UI)  
**Сложность 6.2**: ⭐⭐⭐⭐⭐ Высокая (gramjs в браузере + сессия)

---

## 7. Менеджер загрузок медиа в папку

**Задача**: выбрать каналы, нажать "Выгрузить медиа" — все медиафайлы скачиваются в папку.

### Технология

- **File System Access API**: `showDirectoryPicker()` → пользователь выбирает папку
- Браузеры: Chrome/Edge ✅, Safari 15.2+ ✅, **Firefox ❌** (не поддерживает)
- Имя файла: `{channelName}_{telegramMsgId}.{ext}`

### UI — менеджер загрузок

```
┌─ Выгрузка медиа ────────────────────────────────┐
│ Папка: ~/Downloads/tg-media  [Изменить]          │
│                                                   │
│ Bloomberg (24 файла)     ████████░░  80%  [■]    │
│ РБК (12 файлов)          ██░░░░░░░░  20%  [■]    │
│                                                   │
│ Всего: 36 файлов, ~240 МБ                        │
│                        [Остановить] [Закрыть]     │
└───────────────────────────────────────────────────┘
```

### Логика

1. Период берётся из тулбара (выбранный период для канала)
2. Файлы > 2 GB — пропускаются, выводится предупреждение
3. Уже существующие файлы — пропускаются (по имени)
4. Источник файлов:
   - Если файл уже на сервере (`localMediaPath`) → скачать через `/api/media/:path`
   - Если нет → сначала запросить у сервера или качать через gramjs (этап 6.2)

**Зависит от**: пункт 6 (хотя бы 6.1).

**Сложность**: ⭐⭐⭐ Средняя. Основная сложность — UI менеджера загрузок + File System Access API.

## 8. Аутентификация

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
- **Цена: $0** — никаких SMS, ничего платного

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

### Hono Middleware

```ts
// Все /api/* роуты (кроме /api/auth/login, /api/health) защищены:
app.use('/api/*', authMiddleware);
```

**Сложность**: ⭐⭐⭐⭐. Делаем перед деплоем.

---

## 9. Деплой в Azure

### Стек

| Компонент | Сервис | ~Цена/мес |
|---|---|---|
| Бэкенд (Hono + Node) | Container Apps | ~$5–15 (0.25 vCPU, 0.5 GB RAM) |
| Фронтенд (React SPA) | Container Apps (тот же) или Static Web Apps | $0–9 |
| База данных | **Turso** (нулевая миграция кода!) или Azure Files SQLite | $0–29 |
| Медиа файлы | Azure Blob Storage (Hot) | ~$0.02/GB |
| Образы | Azure Container Registry (Basic) | $5 |
| Домен + SSL | Azure DNS + Container Apps встроенный TLS | ~$0.5 |

**Итого**: ~$10–30/мес в зависимости от объёма медиа.

### Turso — подключение через переменные окружения

`@libsql/client` уже установлен. `db/index.ts` читает `DATABASE_URL` при старте: если задана — подключается к Turso (+ `TURSO_AUTH_TOKEN`), иначе использует локальный `file:data/db.sqlite`.

```env
DATABASE_URL=libsql://my-db-name-username.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

> ⚠️ **Создание пользователя в Turso**: перед первым входом нужно добавить запись в удалённую БД.  
> Временно пропишите `DATABASE_URL` + `TURSO_AUTH_TOKEN` в локальный `.env`, запустите скрипт, затем уберите:
> ```bash
> npm run auth:create-user -- your@email.com YourPassword123!
> ```

Free tier Turso: 9 GB, auto-backup.

### CI/CD

- GitHub Actions: push → build Docker image → push to ACR → deploy to Container Apps
- **Base image**: `node:22-bookworm-slim` (Debian 12, glibc — работает с `@libsql/client` native binaries и `jsdom` без доп. пакетов; Alpine/musl исключён из-за несовместимости)
- Multi-stage Dockerfile: builder (devDeps + Vite build + tsc) → runner (prodDeps only + `dist/`)
- `npm run start` запускает сервер, он же раздаёт статику из `dist/client`

### Переменные окружения (prod)

```
TG_API_ID, TG_API_HASH, TG_SESSION
DATABASE_URL, TURSO_AUTH_TOKEN
JWT_SECRET
ALLOWED_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

**Сложность**: ⭐⭐⭐. Делаем после Auth.

---

## 10. Локализация (i18n)

**Задача**: перевести весь UI на английский, сохранив русский как дефолтный. Переключатель языка в настройках.

### Стек

- **react-i18next** + **i18next** — стандарт для React
- **i18next-browser-languagedetector** — автоопределение языка браузера
- Файлы переводов: `src/client/locales/{ru,en}/translation.json`
- Язык сохраняется в `localStorage` (через `i18next-browser-languagedetector`)

### Структура файлов

```
src/client/locales/
  ru/
    translation.json   ← текущий язык (базовый)
  en/
    translation.json   ← перевод
```

### Ant Design локализация

Ant Design имеет собственный пакет локализации (`antd/locale/ru_RU`, `antd/locale/en_US`).  
Передаётся через `<ConfigProvider locale={antdLocale}>` в `main.tsx`.

```tsx
// main.tsx
import ruRU from 'antd/locale/ru_RU';
import enUS from 'antd/locale/en_US';

const antdLocale = i18n.language.startsWith('ru') ? ruRU : enUS;
```

### Что переводить

- Все строки в компонентах (кнопки, заголовки, placeholders, сообщения об ошибках)
- Подтверждения Modal.confirm (title/content/okText/cancelText)
- Тексты Tooltip
- Серверные сообщения об ошибках **не переводим** (только UI)

### Переключатель языка

Добавить в меню настроек (или хедер):

```tsx
<Select value={i18n.language} onChange={lng => i18n.changeLanguage(lng)}>
  <Select.Option value="ru">🇷🇺 Русский</Select.Option>
  <Select.Option value="en">🇬🇧 English</Select.Option>
</Select>
```

### Паттерн использования

```tsx
import { useTranslation } from 'react-i18next';

function ChannelSidebar() {
  const { t } = useTranslation();
  return <Button>{t('sidebar.addChannel')}</Button>;
}
```

### Namespace

Один namespace `translation` (достаточно для текущего масштаба).  
Ключи организованы по компонентам: `sidebar.*`, `toolbar.*`, `groups.*`, `news.*`, `auth.*`, `settings.*`.

**Сложность**: ⭐⭐⭐ Средняя. Основная работа — выловить все строки из компонентов.

---

## 11. AI-дайджест

**Задача**: после накопления новостей за период попросить ИИ сделать краткий дайджест — что произошло, главные темы, на что стоит обратить внимание.

### Провайдер: Azure OpenAI vs OpenAI напрямую

| | Azure OpenAI | OpenAI API |
|---|---|---|
| Для продакшна (Azure) | ✅ Всё в одной подписке | — |
| Для локальной разработки | Нужен провижининг | ✅ Проще, сразу работает |
| Модель | `gpt-4o` | `gpt-4o` |
| SDK | `openai` npm (умеет оба) | `openai` npm |
| Цена | ~$2.50/1M input tokens | ~$2.50/1M input tokens |

**Стратегия**: использовать пакет `openai` с `baseURL` переключателем — один код, два провайдера:

```ts
// server/services/ai.ts
import OpenAI from 'openai';

const client = process.env.AZURE_OPENAI_ENDPOINT
  ? new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### Переменные окружения

```
# Один из двух вариантов:
OPENAI_API_KEY=sk-...                        # OpenAI напрямую

AZURE_OPENAI_ENDPOINT=https://....openai.azure.com
AZURE_OPENAI_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o               # имя деплоймента в Azure AI Foundry
```

### API

```
POST /api/digest
Body: { channelIds?: number[], groupId?: number | null, since?: string, until?: string }
Response: SSE stream (text/event-stream) — стриминг ответа токен за токеном
```

Ответ стримится через SSE (уже используется для media-progress) — пользователь видит текст по мере генерации.

### Промпт

```ts
const systemPrompt = `Ты ассистент новостного ридера. Твоя задача — создать краткий 
дайджест на русском языке по переданным новостям. Структура:
1. **Главное** (2-3 ключевых события)
2. **Темы дня** (топ-5 тем с кратким описанием)
3. **На что обратить внимание** (важные тренды или необычные новости)
Будь конкретным, избегай воды. Не перечисляй все новости подряд.`;
```

### UI

Кнопка **"Дайджест ✨"** в тулбаре (рядом с кнопками периодов). При клике:

```
┌─ Дайджест за 17 марта ──────────────────────────┐
│                                          [✕]      │
│ **Главное**                                       │
│ • Центробанк повысил ставку до 21%...             │
│ • Bloomberg сообщает о новой волне...  ▌          │  ← стриминг
│                                                   │
│ [Копировать] [Закрыть]                            │
└───────────────────────────────────────────────────┘
```

Отображается в `<Drawer>` или `<Modal>` с `<Markdown>` рендерингом (пакет `react-markdown`).

### Ограничения контекста

GPT-4o: ~128k токенов ≈ ~100k слов. Для большого количества новостей:
- Отправляем только `text` (без `fullContent`, без медиа)
- Если новостей > 200 — берём последние 200 или делаем предварительную суммаризацию по каналам
- Показываем пользователю: "Обработано X новостей из Y"

### Azure AI Agent Service (на будущее)

Если захочется полноценного агента (не просто "суммаризируй"):
- **Azure AI Foundry** → создать Agent с инструментами (`get_news`, `mark_read`, `get_channel_stats`)
- Агент сможет отвечать на вопросы: "Что писали про AI за последнюю неделю?"
- SDK: `@azure/ai-projects` (Node.js)
- Для личного use-case пока избыточно — достаточно прямого вызова GPT-4o

**Сложность**: ⭐⭐⭐ Средняя. Основная работа — SSE стриминг на сервере + Markdown в модале.

---

## 17. Логи

**Задача**: структурированные логи на сервере — удобно читать как локально, так и в Azure Monitor / stdout контейнера.

### Стек

- **`pino`** — самый быстрый Node.js логгер, JSON-вывод, zero-cost в prod
- **`pino-pretty`** — человекочитаемый вывод в dev-режиме (только devDep)
- **Hono access log**: заменить встроенный `hono/logger` на pino-middleware или написать свой через `app.use`

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
```json
{ "level": "warn", "time": 1742300001, "module": "telegram", "channelId": 3, "msg": "channel unavailable" }
```

### Ротация (продакшн)

- В Azure Container Apps — stdout → Azure Log Analytics автоматически
- Локально: `pino-roll` (ротация по дате/размеру) или просто stdout → файл через shell-редирект
- **Не хранить** TG_SESSION, пароли, токены в логах — только IDs и статусы

### Конфиг

```ts
// server/logger.ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty' } : undefined,
});
```

Переменная окружения: `LOG_LEVEL` (debug / info / warn / error).

**Сложность**: ⭐⭐ Лёгкая. Установить pino, заменить `console.log/error/warn` в сервисах.

---

## 18. Fail Detection после деплоя ✅

**Задача**: знать об упавшем приложении раньше, чем пользователь заметит.

### Реализовано

#### 1. Post-deploy smoke test (`.github/workflows/build-main.yml`)

После `az containerapp update` — цикл `curl` на `/api/health` каждые 10 секунд до 3 минут.  
Пайплайн падает если контейнер не стартовал → GitHub шлёт email о failed workflow.  
Шаг `Notify failure (Telegram)` с `if: failure()` шлёт алерт в Telegram если `ALERT_BOT_TOKEN` + `ALERT_CHAT_ID` заданы как GitHub Secrets.

#### 2. alertBot — мгновенные Telegram-уведомления (`src/server/services/alertBot.ts`)

Вызывает Telegram Bot API прямо из процесса. No-op если env vars не заданы.  
Срабатывает при: `uncaughtException`, worker crash, circuit breaker OPEN, `AUTH_KEY_UNREGISTERED`, старт сервера в prod (`🟢 Server started`).

**Как включить** — установить env vars на Container App:
```bash
az containerapp update --name tg-news-reader --resource-group personal-apps-rg \
  --set-env-vars ALERT_BOT_TOKEN=<token> ALERT_CHAT_ID=<chat_id>
```
Создать бота: [@BotFather](https://t.me/BotFather) → `/newbot` → скопировать токен.  
Получить chat_id: отправить боту любое сообщение → `curl https://api.telegram.org/bot<TOKEN>/getUpdates` → `result[0].message.chat.id`.

Те же `ALERT_BOT_TOKEN` / `ALERT_CHAT_ID` добавить как **GitHub Secrets** — тогда и deploy failures будут приходить в Telegram.

#### 3. Azure Monitor Alerts (уже задеплоены в `personal-apps-rg`)

| Правило | Триггер | Куда | Задержка |
|---|---|---|---|
| `tg-reader-error-logs` | KQL: `log.level >= 50` за 5 мин | email `sceletron@gmail.com` | 1–5 мин |
| `tg-reader-restart` | Метрика: `RestartCount > 0` за 5 мин | email `sceletron@gmail.com` | 1–5 мин |

Action Group: `tg-reader-alerts` (personal-apps-rg).  
Пересоздать: `scripts/setup-monitoring.sh` (заполнить переменные).  
На Windows/PowerShell KQL-правило создавать через `az rest --body @file.json` — bash-скрипт с `|` в строке не работает в PowerShell.  
Референс JSON: `C:\Users\dshilov\alert-kql-rule.json`.

#### 4. UptimeRobot — внешний HTTP-монитор (опционально)

Проверяет `/api/health` снаружи каждые 5 минут. Ловит то, что Azure Monitor не видит: упал весь регион Azure, завис event loop.

Настройка (бесплатно, 2 мин):
1. [uptimerobot.com](https://uptimerobot.com) → Add New Monitor
2. Type: `HTTP(s)`, URL: `https://tg-news-reader.graycoast-407e8a98.westeurope.azurecontainerapps.io/api/health`
3. Interval: 5 minutes
4. Alert Contacts: Telegram (встроена нативная поддержка) или email

### Итоговый стек уведомлений

| Событие | Канал | Задержка |
|---|---|---|
| `uncaughtException` | alertBot → Telegram | мгновенно |
| Worker crash | alertBot → Telegram | мгновенно |
| Circuit breaker OPEN | alertBot → Telegram | мгновенно |
| `AUTH_KEY_UNREGISTERED` | alertBot → Telegram | мгновенно |
| Deploy failed (CI) | GitHub Actions → Telegram | мгновенно |
| `logger.error` / `logger.fatal` | Azure Monitor KQL → email | 1–5 мин |
| Container restart / OOM | Azure Monitor Metric → email | 1–5 мин |
| Сервер не отвечает | UptimeRobot → Telegram/email | ≤5 мин |

**Сложность**: ⭐⭐ Реализовано.

---

## 19. Оптимизация UI под мобилки ✅

**Задача**: приложение должно нормально работать на смартфоне.

**Реализовано** — см. раздел 3b (Адаптивный layout). Ключевые решения:
- `Grid.useBreakpoint()` вместо `resize`-листенеров
- Sidebar в Drawer ниже `xxl`
- Accordion-режим принудительно ниже `xl`
- DownloadsPanel: pinned только на xxl
- `sidebarDrawerOpen` в uiStore

**Открытые вопросы**:
- Тач-таргеты (44px HIG): тулбарные кнопки в целом ок, но хэштег-теги и checkbox можно увеличить
- Safari iOS: проверить `<Splitter>` на тачскрине (на xxl он включается только если ≥ 1600px)

---

## Открытые вопросы

1. **SW кэш и мобильный**: если захочется открыть с телефона — SW работает, но File System Access API нет.
2. **gramjs в браузере**: нужно ли создавать отдельную сессию (второе устройство в Telegram) или шарить основную? Шарить проще, но менее безопасно.
3. **Аккордион-режим**: нужен ли переключатель в тулбаре или на уровне группы/канала?
4. **better-auth vs ручная реализация**: выбрана ручная (bcryptjs + hono/jwt + otpauth). Пересмотреть если добавим OAuth (Google/GitHub) или Passkeys — тогда better-auth даст выигрыш. Также рассмотреть при миграции на PostgreSQL если захочется готового решения.

---

## Технический долг (зафиксировать и не забыть)

- [x] Ротация Telegram сессии (TG_SESSION попал в чат) — перевыпущена через `npm run tg:auth`, старая сессия завершена вручную через Telegram → Настройки → Активные сеансы
- [x] Перенести `applyFilters` полностью на сервер (server-side filtering через `json_each()`)
- [x] Вынести логику расчёта `sinceDate` в shared helper (`getSinceDate` в channels.ts, используется в fetch-роуте; `count-unread` намеренно использует `lastFetchedAt` напрямую во избежание двойного счёта)
- [ ] Индексы SQLite на `channel_id + is_read` (уже есть, но проверить при росте данных)
- [x] При деплое: SQLite → Turso — `db/index.ts` теперь читает `DATABASE_URL`+`TURSO_AUTH_TOKEN`; fallback на `file:data/db.sqlite` локально (исправлено в PR #14 — hardcoded путь не учитывал env vars)
- [x] robots.txt + X-Robots-Tag header + rate limiting (production only)
- [x] `getChannelInfo` в telegram.ts — задействована: автозаполнение названия/описания при добавлении канала (`GET /api/channels/lookup`, onBlur на поле telegramId)
- [x] Настроить git user.name/email (`git config --global user.name "..."`)
- [x] Баг двойного счётчика непрочитанных: `count-unread` использовал `getSinceDate`/`lastReadAt`, что приводило к суммированию уже загруженных непрочитанных и `pendingCounts` — исправлено на `lastFetchedAt`
- [x] `GroupPanel` разбит на `GroupItem` + `GroupFormModal` + `GroupPinModal` (по аналогии с Channel-компонентами); бейдж группы теперь учитывает `pendingCounts`
- [x] Service Worker кэш медиа (`public/sw.js`): Cache-First стратегия для `/api/media/*`; стрипает `?token=` из ключа кэша; 2000 записей / 30 дней TTL; кнопка очистки в меню пользователя (`AppHeader`); регистрируется только в prod
- [x] Структурированные логи через pino (`src/server/logger.ts`): pino-pretty в dev, JSON в prod; access-log middleware (IP/метод/статус/ms); логирование auth-попыток (IP + reason, без email/пароля); rate-limit хиты; download задачи; ошибки Telegram; uncaughtException/unhandledRejection
- [x] Локализация (i18n): react-i18next + i18next-browser-languagedetector; **EN по умолчанию, RU как fallback**; переключатель языка в меню пользователя (🌐); файлы переводов в `src/client/locales/{en,ru}/translation.json`; Ant Design locale динамически переключается через `ConfigProvider`; SVG-флаги (FlagRU/FlagUS) вместо emoji
- [x] Менеджер загрузок медиа (сервер): `downloads` таблица + фоновые воркеры (`startWorkerPool`); `enqueueTask(newsId, type, url?, priority)`; SSE-стрим прогресса (`GET /api/downloads/stream`); `DownloadsPanel` с закреплённым сайдбаром (`downloadsPanelPinned` в `uiStore`); приоритет 10 = пользовательский (без лимита размера), 0 = фоновый
- [x] Аккордион-режим просмотра новостей: `newsViewMode: 'list' | 'accordion'` в `uiStore` (persisted); `NewsAccordionList` + `NewsAccordionItem`; `useMobileBreakpoint` → `effectiveViewMode`; на мобильных всегда аккордион
- [x] Адаптивный layout: `useMatchMedia` из `src/client/hooks/breakpoints.ts` (только нужный брейкпоинт, без лишних ре-рендеров); константы BP_SM/MD/LG/XL/XXL; `<Splitter>` только на xxl (≥1600px); сайдбар в `<Drawer>` ниже xxl; `sidebarDrawerOpen` в `uiStore`; `DownloadsPanel` pinned только на xxl
- [x] Мониторинг: `alertBot.ts` (Telegram push — no-op без env vars); `uncaughtException` → `logger.fatal` + `sendAlert`; worker crash + circuit OPEN + AUTH_KEY_UNREGISTERED → `sendAlert`; startup → `sendAlert('🟢 Server started')` в prod; Azure Monitor KQL alert `tg-reader-error-logs` (level >= 50) + Metric alert `tg-reader-restart` (RestartCount > 0) задеплоены в `personal-apps-rg`; smoke test в CI (poll `/api/health` 3 мин после деплоя); `Notify failure (Telegram)` шаг в workflow

---

## 16. Accessibility (a11y) ⬜

### Цель

Сделать приложение пригодным для клавиатурной навигации и скрин-ридеров. Это личное приложение, но правильная структура ARIA и фокус-менеджмент ускоряют работу даже без скрин-ридера.

### Что нужно сделать

#### 16.1 Фокус и Tab-навигация

- [ ] **Логичный порядок Tab** во всём приложении: `AppHeader` → `GroupPanel` → `ChannelSidebar` → `NewsFeed`
- [ ] **Фокус при открытии Drawer** (мобильный сайдбар): переводить фокус внутрь `<Drawer>` при открытии, возвращать обратно при закрытии (`autoFocus` / `afterOpenChange`)
- [ ] **Фокус при выборе новости** (list-режим): при нажатии Enter/клике на элемент в `NewsFeedList` — перевести фокус в `NewsDetail`
- [ ] **Ловушка фокуса в модалках** (`Modal`, `Drawer`) — Ant Design делает это сам, убедиться что не переопределяется
- [ ] **`NewsDetailToolbar`**: все кнопки уже в DOM, Tab должен их обходить без пробелов — проверить
- [ ] **Карусель альбома** (`NewsDetailMedia`): кнопки Prev/Next и изображение — добавить `tabIndex`, `aria-label` уже есть
- [ ] **Skip-link**: `<a href="#main-content">Перейти к контенту</a>` скрытый до фокуса (`:focus-visible`)

#### 16.2 ARIA-роли и атрибуты

- [ ] **`ChannelSidebar`** (`ChannelItem`): `role="listbox"` / `role="option"`, `aria-selected={isSelected}`
- [ ] **`GroupPanel`** (`GroupItem`): `role="listbox"` / `role="option"`, `aria-selected`
- [ ] **`NewsFeedList`**: `role="listbox"`, каждый `NewsListItem` — `role="option"`, `aria-selected`
- [ ] **`NewsAccordionList`**: `role="list"`, каждый `NewsAccordionItem` — `role="listitem"`, `aria-expanded={isSelected}`
- [ ] **`NewsDetailToolbar`**: `aria-label` у кнопок без текста (иконки в collapsed-режиме); кнопка "Mark read/unread" — `aria-pressed={isRead}`
- [ ] **`DownloadsPanel`**: `role="status"` / `aria-live="polite"` для счётчика задач
- [ ] **Изображения**: `<img alt>` в `NewsDetailMedia` уже заполнен через `t('news.detail.photo_alt')` — проверить остальные `<img>` (без alt)

#### 16.3 Focus-visible стили

- [ ] Убедиться что AntD `ConfigProvider` не сбрасывает `:focus-visible` outline (проверить в light и dark темах)
- [ ] В `createStyles`: для интерактивных элементов добавить явный `&:focus-visible { outline: 2px solid ${token.colorPrimary}; }` там, где AntD его убирает

#### 16.4 Клавиатурный эквивалент для кликов

- [ ] `NewsListItem` (клик → выбор): уже есть `onClick` на `div` — добавить `onKeyDown` для Enter/Space
- [ ] `ChannelItem` / `GroupItem`: проверить, есть ли `onKeyDown` для Enter (добавить где нет)
- [ ] Кликабельная шапка в `NewsDetail` inline-варианте (`toolbarMeta`) — уже есть `onKeyDown` ✅

#### 16.5 Аудит

- [ ] Прогнать **Lighthouse → Accessibility** в Chrome DevTools
- [ ] Прогнать **axe DevTools** (расширение) на главной странице
- [ ] Целевой балл Lighthouse: ≥ 90

### Технические заметки

- AntD 6 поставляет `role`, `aria-label` для своих компонентов (`Button`, `Modal`, `Drawer`, `Input`) — не дублировать, только дополнять
- `createStyles` + `token` для всех focus-стилей, никаких hardcoded цветов
- `useTranslation` для всех `aria-label` — добавлять ключи в `common.aria.*`
