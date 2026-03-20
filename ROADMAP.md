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

### ⬜ В работе / Следующие

| Статус | Приоритет | Задача | Зависимости | Сложность |
|--------|-----------|--------|-------------|-----------|
| ⬜ | 🟡 | Деплой в Azure (Container Apps + Turso) | Auth | ⭐⭐⭐ |
| ⬜ | 🟢 | Режим просмотра "аккордион" | Группы | ⭐⭐⭐⭐ |
| ⬜ | 🟢 | AI-дайджест (Azure OpenAI / OpenAI) | — | ⭐⭐⭐ |
| ⬜ | 🟡 | Fail detection после деплоя | Деплой | ⭐⭐ |
| ⬜ | 🟢 | Оптимизация UI под мобилки | — | ⭐⭐⭐ |

### ⬜ Отложено (низкий приоритет)

| Статус | Задача | Зависимости | Сложность |
|--------|--------|-------------|-----------|
| ⬜ | Менеджер загрузок в папку | SW кэш | ⭐⭐⭐ |
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

## 3. Переработка панели каналов

### Вариант A: Аккордион (рекомендуется на первом этапе)

```
▼ Новости (3 непрочитанных)      [папка 🟦]
    📡 Bloomberg (2)
    📡 РБК (1)
▶ Работа (🔒)                    [папка 🟩]
▶ Без группы
```

- Ant Design `<Collapse>` / `<Tree>` 
- Простая реализация, знакомый UX

### Вариант B: Иконки папок + drill-down

```
[🟦 Новости]  [🟩 Работа]  [🟥 Трейдинг]
      ↓ клик
[📡 Bloomberg] [📡 РБК] [← назад]
```

- Более компактно, но нужна навигация "назад"
- Хорошо смотрится на маленьких сайдбарах

**Решение**: начинаем с Аккордионом (проще), потом можно переключить.

### Альтернативный режим просмотра новостей (аккордион-новости)

**Задача**: список новостей во всю ширину, каждая новость — раскрытый аккордион (как GitHub diff).

```
▼ Bloomberg | 17 марта, 12:30
  [медиа] Текст новости целиком...
  [Прочитано ✓]  [Ссылки]

▼ РБК | 17 марта, 11:15  
  Текст...
  [Прочитано ✓]
```

При нажатии "Прочитано" — новость схлопывается, фокус на следующей.

**Это большое изменение UI**. Предлагаю сделать переключатель режимов:
- `compact` — текущий (список слева + детали справа)
- `expanded` — аккордион на всю ширину

Хранить в `uiStore` + `localStorage`.

**Сложность**: ⭐⭐⭐⭐ Высокая. Делаем **после** групп.

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

### Turso — нулевая миграция

`@libsql/client` уже установлен. Единственное изменение — переменные окружения:
```env
DATABASE_URL=libsql://my-db-username.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

Код не меняется вообще. Free tier: 9 GB, auto-backup.

### CI/CD

- GitHub Actions: push → build Docker image → push to ACR → deploy to Container Apps
- Dockerfile: multi-stage (build Vite → Node prod)
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

## 18. Fail Detection после деплоя

**Задача**: знать об упавшем приложении раньше, чем пользователь заметит, не используя платных сервисов мониторинга.

### Уровни защиты

#### 1. Health-check эндпоинт (уже есть)

`GET /api/health` возвращает `{ status: "ok", timestamp }`. Расширить:

```ts
app.get('/api/health', async (c) => {
  // Проверить соединение с БД
  await db.select({ one: sql`1` }).from(sql`(SELECT 1)`);
  return c.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
});
```

#### 2. Azure Container Apps — встроенный liveness probe

```yaml
# container app → Health probes
livenessProbe:
  httpGet:
    path: /api/health
    port: 3173
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3   # 3 фейла → контейнер рестартует автоматически
```

Контейнер автоматически рестартует при трёх подряд неудачных проверках — **без ручного вмешательства**.

#### 3. Внешний uptime-монитор (бесплатно)

**[UptimeRobot](https://uptimerobot.com)** — free tier: 50 мониторов, проверка каждые 5 минут, email/Telegram-уведомления.

- Добавить монитор на `https://yourdomain.com/api/health`
- Alert: email + Telegram-бот (встроено в UptimeRobot)

#### 4. Telegram-уведомление от самого приложения (опционально)

```ts
// server/services/alertBot.ts
export async function sendAlert(msg: string) {
  if (!process.env.ALERT_BOT_TOKEN || !process.env.ALERT_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${process.env.ALERT_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    body: JSON.stringify({ chat_id: process.env.ALERT_CHAT_ID, text: `🚨 TG Reader: ${msg}` }),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Вызывать при: crash worker, Telegram-сессия протухла (`AUTH_KEY_UNREGISTERED`), БД недоступна.

Переменные: `ALERT_BOT_TOKEN`, `ALERT_CHAT_ID` (необязательны — если не заданы, алерты молчат).

### Итоговый стек мониторинга

| Инструмент | Что делает | Цена |
|---|---|---|
| Azure liveness probe | Автоматический рестарт упавшего контейнера | Бесплатно |
| UptimeRobot | Внешняя проверка + email/Telegram alert | Бесплатно |
| Azure Log Analytics | Хранение и поиск по логам из pino | Включено в Container Apps |
| Telegram-бот (опц.) | Push-уведомление прямо в чат | Бесплатно |

**Сложность**: ⭐⭐ Лёгкая. Основная работа — настройка liveness probe в Azure + UptimeRobot.

---

## 19. Оптимизация UI под мобилки

**Задача**: приложение должно нормально работать на смартфоне — не только не ломаться, но и быть удобным.

### Текущие проблемы

- Трёхколоночный layout (GroupPanel + ChannelSidebar + NewsFeed) не влезает на 390px экран
- `NewsDetail` открывается рядом со списком, а не поверх него
- Кнопки тулбара слишком мелкие для тап-таргетов
- Сплиттер (`<Splitter>`) на тачскрине неудобен

### Стратегия: mobile-first breakpoints

**Breakpoints** (CSS custom properties):
```
xs: < 640px   — мобильный телефон (portrait)
sm: < 1024px  — планшет / телефон landscape
md: ≥ 1024px  — десктоп (текущий layout)
```

### Изменения по компонентам

#### AppLayout (`md`+: текущий) → мобильный режим

```
xs/sm:
┌─────────────────────┐
│  [☰ Меню]  Заголовок│  ← header с hamburger
├─────────────────────┤
│  Список новостей    │  ← полная ширина
│  (или детали)       │
└─────────────────────┘
```

- `GroupPanel` + `ChannelSidebar` → `<Drawer>` (выезжает слева по hamburger)
- `NewsDetail` → отдельный экран (навигация назад `<` в header)
- Использовать `useBreakpoint()` из Ant Design или CSS media queries

#### Навигация

- На `xs`: список → деталь — **полноэкранная замена** (не side-by-side)
- `setSelectedNewsId` уже в `uiStore` — достаточно добавить мобильный view-state

#### Тач-таргеты

- Минимальная высота кнопок: 44px (Apple HIG) — `size="large"` в Ant Design
- Теги хэштегов — увеличить `padding`
- Checkbox "Прочитано" — увеличить зону клика

#### Сплиттер

На `xs/sm` — убрать `<Splitter>`, sidebar фиксированной ширины или Drawer.

#### Downloads Panel

На мобильном — только иконка с бейджем в header, без pinned-режима.

### Реализация

1. Добавить CSS breakpoint-переменные в `styles.css`
2. `AppLayout.tsx` — определять `isMobile` через `window.innerWidth < 1024` + `resize listener` (или Ant Design `Grid.useBreakpoint()`)
3. Компоненты sidebar завернуть в `<Drawer>` на мобильном
4. `NewsFeed` — на мобильном показывать список ИЛИ детали (не одновременно)

**Сложность**: ⭐⭐⭐ Средняя. Основная сложность — переключение layout без дублирования компонентов.

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
- [ ] При деплое: SQLite → Turso (нулевые изменения кода, только URL в .env)
- [x] robots.txt + X-Robots-Tag header + rate limiting (production only)
- [x] `getChannelInfo` в telegram.ts — задействована: автозаполнение названия/описания при добавлении канала (`GET /api/channels/lookup`, onBlur на поле telegramId)
- [x] Настроить git user.name/email (`git config --global user.name "..."`)
- [x] Баг двойного счётчика непрочитанных: `count-unread` использовал `getSinceDate`/`lastReadAt`, что приводило к суммированию уже загруженных непрочитанных и `pendingCounts` — исправлено на `lastFetchedAt`
- [x] `GroupPanel` разбит на `GroupItem` + `GroupFormModal` + `GroupPinModal` (по аналогии с Channel-компонентами); бейдж группы теперь учитывает `pendingCounts`
- [x] Service Worker кэш медиа (`public/sw.js`): Cache-First стратегия для `/api/media/*`; стрипает `?token=` из ключа кэша; 2000 записей / 30 дней TTL; кнопка очистки в меню пользователя (`AppHeader`); регистрируется только в prod
- [x] Структурированные логи через pino (`src/server/logger.ts`): pino-pretty в dev, JSON в prod; access-log middleware (IP/метод/статус/ms); логирование auth-попыток (IP + reason, без email/пароля); rate-limit хиты; download задачи; ошибки Telegram; uncaughtException/unhandledRejection
- [x] Локализация (i18n): react-i18next + i18next-browser-languagedetector; **EN по умолчанию, RU как fallback**; переключатель языка в меню пользователя (🌐); файлы переводов в `src/client/locales/{en,ru}/translation.json`; Ant Design locale динамически переключается через `ConfigProvider`
