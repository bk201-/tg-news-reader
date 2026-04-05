# Mobile UX Bug Fixes — Implementation Plan

12 fixes across 5 component areas. All root causes identified with exact file locations.

---

## Group A — News Scroll & Navigation

### Issue 1 — Scroll jumps when selecting a news item

**Root cause:** `NewsFeed.tsx` calls `virtuosoRef.current?.scrollToIndex({ index, behavior: 'smooth', align: 'center' })` on every `selectedNewsId` change. In accordion mode on mobile the item expands from ~60 px to several hundred pixels *after* the scroll fires, so the browser re-scrolls multiple times and lands in the middle.

**Fix:**
- Change `align: 'center'` → `align: 'start'` in accordion mode.
- Wrap `scrollToIndex` in `setTimeout(fn, 50)` / `requestAnimationFrame` so it fires after the accordion expansion paint.
- Alternative: use `document.querySelector('[data-news-id="..."]')?.scrollIntoView({ block: 'start', behavior: 'smooth' })` — fires after layout reflow. `scroll-margin-top` is already set in `NewsAccordionList.tsx`.

**Files:** `src/client/components/News/NewsFeed.tsx`

---

## Group B — i18n

### Issue 2 — Accordion header shows Russian text instead of English

**Root cause:** `newsUtils.ts` has three hardcoded Russian strings:
- `getNewsTitle()` fallback: `` `Сообщение #${item.telegramMsgId}` ``
- `getLinkLabel()` fallback: `` `Ссылка ${index + 1}` ``
- `formatBytes()` units: `МБ` / `КБ`

**Fix:**
- Add a `fallback: string` param to `getNewsTitle(item, fallback)`. Callers pass `t('news.list.message_fallback', { id })`.
- Same for `getLinkLabel(index, fallback)` → callers pass `t('news.detail.link_fallback', { n: index + 1 })`.
- For `formatBytes`, accept a units tuple (or pass `t`) — add keys `news.detail.mb` / `news.detail.kb` to both locale files.

**Files:** `src/client/components/News/newsUtils.ts`, `src/client/components/News/NewsDetail.tsx`, `src/client/locales/en/translation.json`, `src/client/locales/ru/translation.json`

---

## Group C — Share

### Issue 3 — Share shows "News https://t.me/..." prefix

**Root cause:** `NewsDetail.tsx` calls `navigator.share({ title, text: textSnippet, url: openUrl })`. When `getNewsTitle()` returns "News" (first line of text), the OS share sheet prepends it to the URL.

**Fix:** Remove `title` from the `navigator.share` payload. Share only `{ url: openUrl }` — or optionally `{ url, text: textSnippet }` — but no `title`.

**Files:** `src/client/components/News/NewsDetail.tsx`

---

## Group D — Lightbox: Media Loading & Images

> Issues 4, 8, 9, 12 share the same files — implement in one PR.

### Issue 12 — Image disappears when flipping through lightbox

**Root cause:** `LightboxMedia.tsx` has `key={displayPath}` on `<img>`. Every path change unmounts + remounts the element, producing a blank frame during decode.

**Fix:** Remove `key` from `<img>` — update only `src`. The same DOM node persists and the browser can use its decode cache. Keep `key={displayPath}` on `<video>` (must remount to reload source).

**Files:** `src/client/components/News/LightboxMedia.tsx`

---

### Issue 4 — Images empty or showing old ones; need loader

**Root cause:** When `path` is defined but the Telegram signed URL has expired, `<img>` shows a broken/blank image silently — no feedback, no recovery.

**Fix:**
- Add `loading` / `errored` local state to `LightboxMedia` via `onLoadStart`, `onLoad`, `onError`.
- While loading: overlay a `<LoadingOutlined>` spinner (previous image stays visible underneath).
- On error: show a **Retry** button. `onRetry` prop → in `LightboxOverlay`, call `qc.invalidateQueries({ queryKey: ['news', channelId] })` to force fresh URLs, then re-open the lightbox at the same state.

**Files:** `src/client/components/News/LightboxMedia.tsx`, `src/client/components/News/LightboxOverlay.tsx`

---

### Issue 8 — No Download button for missing image; no prefetch of adjacent images

**Root cause:** When `localMediaPath` is null (media never downloaded), lightbox shows only a spinner with no way to trigger a download. No prefetching of next/prev images.

**Fix:**
- In `LightboxOverlay`, pass `onDownload` prop to `LightboxMedia`. When `path` is falsy, render a **Download** button that calls `useCreateDownload` (already exists in `src/client/api/downloads.ts`) with `priority: 10`.
- Add a `useEffect` that fires on `cursor` change and prefetches adjacent entries:
  ```ts
  [entries[cursor - 1], entries[cursor + 1]].forEach(e => {
    const p = e?.item.localMediaPaths?.[0] ?? e?.item.localMediaPath;
    if (p) { const img = new Image(); img.src = mediaUrl(p); }
  });
  ```

**Files:** `src/client/components/News/LightboxOverlay.tsx`, `src/client/components/News/LightboxMedia.tsx`

---

### Issue 9 — Auto-download stopped working on channel open

**Root cause:** `useMediaProgressSSE(channelId, key)` is designed to be called from `NewsFeed` — it subscribes to `/api/channels/:id/media-progress` SSE and updates `localMediaPath` in the React Query cache in real-time. The hook call was removed at some point, so media-channel auto-downloads complete on the server but the client never learns the updated paths.

**Fix:**
- In `NewsFeed.tsx`, add `const [mediaProgressKey, setMediaProgressKey] = useState(0)`.
- In `onFetchSuccess`, if `data.mediaProcessing === true`, call `setMediaProgressKey(k => k + 1)`.
- Add `useMediaProgressSSE(channel.id, mediaProgressKey)`.

**Files:** `src/client/components/News/NewsFeed.tsx`

---

## Group E — Lightbox: Touch & Album Navigation

> Issues 6, 10, 11 all modify `LightboxOverlay.tsx` — implement together.

### Issue 6 — Touch/swipe not working in lightbox on mobile

**Root cause:** `LightboxOverlay.tsx` handles `wheel` and `keydown` events but has no touch/pointer handling. `wheel` doesn't fire on mobile touch devices.

**Fix:** Add `onTouchStart` / `onTouchEnd` to the overlay `<div>`:
```ts
// touchstart: record startX, startY
// touchend:   compute deltaX, deltaY
// |deltaX| > |deltaY| && |deltaX| > 50 → horizontal swipe → goToAlbumImage or go(±1)
// |deltaY| > 50 → vertical swipe → go(±1)
// call e.preventDefault() on horizontal swipes to block page scroll
```

**Files:** `src/client/components/News/LightboxOverlay.tsx`

---

### Issue 10 — Back navigation in lightbox jumps to album image 1 instead of last viewed

**Root cause:** `useLightboxNav.ts` always passes `albumIndex: 0` when navigating between news items — no memory of last-viewed position.

**Fix:** Add a `useRef<Map<number, number>>` (albumHistory) in `LightboxOverlay`. Update it whenever `albumIndex` changes. In the `navigate()` callback, look up the stored index for the target newsId:
```ts
const nextAlbum = albumHistory.current.get(nextNewsId) ?? 0;
openLightbox(nextNewsId, nextAlbum, channelId);
```

**Files:** `src/client/components/News/LightboxOverlay.tsx`, `src/client/components/News/useLightboxNav.ts`

---

### Issue 11 — Image fills full width, nav buttons overlay on top

**Root cause:** `LightboxOverlay` uses `padding: 0 72px` on `.mediaArea` to reserve space for buttons, but the buttons are `position: absolute` at `left: 16px` / `right: 16px` — on narrow mobile screens they overlap the image.

**Fix:** Replace absolute-positioned buttons with a three-column flex row:
```
mediaArea: display: flex; flex-direction: row; align-items: center;
  navPrev: width: 56px; flex-shrink: 0;
  LightboxMedia wrapper: flex: 1; min-width: 0;
  navNext: width: 56px; flex-shrink: 0;
```
Remove `position: absolute` from `.navBtn`, remove padding from `.mediaArea`. On screens < 360 px reduce button width to 40 px.

**Files:** `src/client/components/News/LightboxOverlay.tsx`

---

## Group F — Feed Toolbar

### Issue 7 — Period picker menu doesn't close after selection

**Root cause:** The mobile `<Dropdown>` in `NewsFeedToolbar.tsx` wrapping the period submenu doesn't auto-close when a nested menu item is selected (Ant Design only closes the submenu, not the root dropdown).

**Fix:** Add controlled `open` state:
```tsx
const [menuOpen, setMenuOpen] = useState(false);
const handleFetchPeriod = (val) => { onFetchPeriod(val); setMenuOpen(false); };
<Dropdown open={menuOpen} onOpenChange={setMenuOpen} menu={{ items: menuItems }}>
```

**Files:** `src/client/components/News/NewsFeedToolbar.tsx`

---

## Group G — Channel Panel

### Issue 5 — Channel refresh doesn't reload news list

**Root cause:** The refresh button in `ChannelSidebar.tsx` only calls `countUnread.mutate(selectedGroupId)`, which updates pending badge counts via `setPendingCounts`. It never invalidates the news query.

**Fix:** In the refresh button `onClick`, also call:
```ts
qc.invalidateQueries({ queryKey: ['news'] });
```
Only the currently visible channel's query will refetch immediately; others on next access.

**Files:** `src/client/components/Channels/ChannelSidebar.tsx`

---

## Implementation Order

| Priority | Issues | Notes |
|---|---|---|
| 🔴 High | 12 → 4 → 8 | Lightbox image fixes — do in order, same files |
| 🔴 High | 9 | Auto-download regression — standalone |
| 🔴 High | 1 | Core scroll UX — standalone |
| 🟡 Medium | 6 + 10 + 11 | Touch, album memory, layout — all in `LightboxOverlay`, one PR |
| 🟢 Low | 2, 3, 7, 5 | Independent, low risk |

> **Issues 4, 6, 8, 10, 11, 12** all touch `LightboxOverlay.tsx` / `LightboxMedia.tsx` — batch into one PR to avoid merge conflicts.

