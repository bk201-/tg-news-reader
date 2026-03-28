# TG News Reader — Decisions & History

> Архивный лог принятых решений и исправленных багов. Объясняет «почему», а не «что».

---

## Архитектурные решения

### Auth: ручная реализация vs better-auth

Выбрана **ручная** (bcryptjs + hono/jwt + otpauth):
- Простой кейс: один пользователь, один сервер
- Нет зависимости от внешней библиотеки с обновлениями
- Пересмотреть если добавим OAuth (Google/GitHub) или Passkeys

### БД: SQLite/Turso vs PostgreSQL

SQLite локально, Turso (libSQL) в проде — через один `@libsql/client`:
- `db/index.ts` читает `DATABASE_URL`: если задан → Turso, иначе `file:data/db.sqlite`
- Минимальная инфраструктура, нет отдельного сервера БД
- Bottleneck: write concurrency — не актуально для single-user приложения

### count-unread: lastFetchedAt vs lastReadAt

`count-unread` намеренно использует `lastFetchedAt` (не `lastReadAt`):
- Бейдж = `unreadCount (БД) + pendingCounts (uiStore)`
- Если считать с `lastReadAt` — уже скачанные непрочитанные считались бы дважды
- `getSinceDate` используется только в fetch-роуте

### Scale-to-zero cooldown

28.03.2026 увеличен с 300s до **1800s** (30 минут):
- Причина: частые ложные алерты от `RestartCount` при пробуждении контейнера
- Параллельно: `tg-reader-restart` алерт изменён на `RestartCount > 1` за 15 мин
- API: `PATCH` через `2024-10-02-preview` (stable API не принимал `cooldownPeriod` как writable)

---

## Исправленные баги (исторический лог)

### Mark all as Read не работал (2 бага)

**Симптом**: после "Отметить все прочитанными" + refresh бейджи оставались, новости не помечались.

**Причина 1**: `useMarkAllRead.onSuccess` не очищал `pendingCounts[channelId]` в `uiStore`.  
**Фикс**: добавить `clearPendingCount(channelId)` в `onSuccess`.

**Причина 2**: fetch-роут удаляет `isRead=1` новости перед скачкой новых; `/read-all` не обновлял `lastReadAt` → после удаления сервер переfetch'ил их заново из Telegram с `isRead=0`.  
**Фикс**: в `/read-all` обновлять `lastReadAt = max(news.postedAt)` для канала.

### Двойной счётчик непрочитанных

`count-unread` ошибочно использовал `lastReadAt` → исправлено на `lastFetchedAt` (см. раздел выше).

### markRead без channelId

`markRead.mutate` не передавал `channelId` — баг в `useNewsHotkeys`. Исправлено.

### Навигация после тег-фильтра

`useEffect` в `NewsFeed` искал первую непрочитанную глобально вместо следующей после текущей позиции. Исправлено: ищем ПОСЛЕ текущей, fallback на первую глобальную.

### TG_SESSION попал в чат

Ротация сессии: `npm run tg:auth`, старая сессия завершена вручную в Telegram → Settings → Active Sessions.

---

## Технический долг (выполнено)

- [x] `applyFilters` перенесён на сервер (server-side filtering через `json_each()`)
- [x] `getSinceDate` вынесен в shared helper (`channels.ts`)
- [x] `getChannelInfo` — автозаполнение названия/описания при добавлении канала (`GET /api/channels/lookup`)
- [x] `GroupPanel` разбит на `GroupItem` + `GroupFormModal` + `GroupPinModal`
- [x] SW кэш медиа: Cache-First для `/api/media/*`, стрипает `?token=`, 2000 записей / 30 дней TTL
- [x] Структурированные логи: pino-pretty в dev, JSON в prod; access-log; rate-limit хиты; uncaughtException/unhandledRejection
- [x] Локализация: EN по умолчанию, RU fallback; SVG-флаги; переключатель в хедере
- [x] Менеджер загрузок: `downloads` таблица + воркеры; SSE-прогресс; DownloadsPanel + DownloadsPinnedContent
- [x] Аккордион-режим: `newsViewMode` persisted; NewsAccordionList + NewsAccordionItem; мобильные всегда аккордеон
- [x] Адаптивный layout: Splitter только на xxl; Drawer на < xxl; DownloadsPanel pinned только на xxl
- [x] Мониторинг: alertBot; Azure Monitor KQL + Metric alerts; smoke test в CI; Telegram notify on failure
- [x] Accessibility: role/aria/tabIndex/onKeyDown; nav+listbox на контейнерах; focus-ring; MaybeTooltip
- [x] Instant View: парсинг `cachedPage.blocks` через `richTextToString`; сохраняется в `news.fullContent` при INSERT
- [x] media_content авто-фильтр: `mediaType IN ('photo','document')`; text-only скрыты, видны через "Показать все"
- [x] Аудио-сообщения: `mediaType='audio'`; авто-скачка отключена; `<audio controls>` когда файл скачан
- [x] `NewsHashtags.tsx`: shared component с `e.stopPropagation()`; прокинут через accordion → detail → toolbar
- [x] Sticky header аккордеона: `position: sticky; top: 0; z-index: 10`
- [x] Фильтры 80+: `Set<string>` для тегов O(T) вместо O(F×T); пагинация по 20 строк
- [x] Дубликат канала: нормализация telegramId на blur → сравнение с allChannels; 409 fallback

