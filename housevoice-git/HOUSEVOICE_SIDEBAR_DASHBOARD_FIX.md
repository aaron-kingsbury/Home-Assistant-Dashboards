# HouseVoice Sidebar Dashboard Display Fix

## Scope

This change affects only browser navigation from the Home Assistant sidebar for
Parent's Room and Cora's Room. The dedicated device dashboards, device URLs,
VACA settings, kiosk behavior, entities, artwork, actions, and Graham's Room
dashboard were not changed.

## Root Cause

- Parent's Room uses a fixed top-level card and canvas sized to `100vw` by
  `100dvh`. When opened directly from the sidebar, those elements use the outer
  browser viewport and render beneath the Home Assistant sidebar and header.
- Cora's Room uses a viewport-sized fixed canvas and viewport-positioned
  interaction cards. Opening it directly causes the same outer-viewport
  overflow and clipping.
- Graham's Room already uses an iframe strategy. Its fixed device canvas is
  isolated from the outer Home Assistant shell, so it does not overlap the
  sidebar.
- Disabling kiosk mode changes shell visibility but does not change which
  viewport the fixed dashboard elements use.

### Brave acceptance failure and resolution

The initial implementation changed the contents of
`sidebar-non-kiosk-links.js` without changing its registered `?v=1` URL. Home
Assistant serves `/local/` resources with a 31-day browser cache
(`Cache-Control: public, max-age=2678400`). Brave therefore retained the older
v1 script, which added `disable_km` but kept the original dashboard path. The
DevTools Chromium profile had no cached copy and fetched the newer file, causing
the initial false-positive validation.

The persistent fix changed both frontend resource URLs to `?v=2` and restarted
Home Assistant Core so the `frontend` integration would publish the new module
URL. No browser cache clearing was required.

## Routes

| Dashboard | Original device route | Browser sidebar route |
| --- | --- | --- |
| Parent's Room | `/parents-room/parents-room` | `/parents-room-browser/0?disable_km=` |
| Cora's Room | `/kids-rooms/home` | `/cora-room-browser/0?disable_km=` |
| Graham's Room | `/graham-s-room/0?disable_km=` | Unchanged |

The original routes remain active and unchanged.

## Implementation

- `www/housevoice/sidebar-non-kiosk-links.js`
  - Preserves the existing sidebar names, icons, and ordering.
  - Redirects only Parent's Room and Cora's Room sidebar clicks to their hidden
    browser dashboards.
  - Leaves Graham's Room routing unchanged.
- `www/housevoice/browser-dashboard-frame.js`
  - Implements an isolated, same-origin iframe custom card.
  - Keeps each original dashboard at its proven device canvas size.
  - Scales and centers the complete canvas inside the available Home Assistant
    content area using `ResizeObserver`.
  - Clips the scaling stage so no horizontal browser overflow is introduced.
- `configuration.yaml`
  - Loads the existing sidebar routing module through
    `frontend.extra_module_url` with an explicit cache-busting version.
- Hidden storage dashboards:
  - `parents_room_browser`: panel view containing
    `/parents-room/parents-room` at a virtual size of `961 × 601`.
  - `cora_room_browser`: panel view containing `/kids-rooms/home` at a virtual
    size of `1280 × 640`.

The wrappers reference the live original routes, so dashboard content, entities,
actions, clocks, weather, and future edits remain synchronized automatically.
No business logic is duplicated.

## Validation

Chrome DevTools validation was completed against the authenticated local Home
Assistant session.

| Viewport | Parents | Cora |
| --- | --- | --- |
| 1920 × 1080 | Pass | Pass |
| 1440 × 900 | Pass, expanded and collapsed sidebar | Pass |
| 1280 × 800 | Pass | Pass |
| 1024 × 768 | Pass | Pass |
| 390 × 844 | Pass | Pass |
| 844 × 390 | Pass | Pass |

Verified:

- Sidebar clicks resolve to the new browser routes.
- The Home Assistant header and sidebar remain outside the scaled dashboards.
- No horizontal overflow or clipped dashboard navigation is visible.
- All original controls remain present in the accessibility tree.
- Clocks and weather values continue updating.
- Network requests for the wrapper module, iframe routes, and dashboard
  resources return successfully.
- No console errors occur on either browser dashboard.
- Parent's Room still renders correctly at `961 × 601` on its original route.
- Cora's Room still renders correctly at `1280 × 640` on its original route.
- No Home Assistant restart was performed during the initial implementation.

Follow-up validation after the cache fix verified:

- `sidebar-non-kiosk-links.js?v=2` and
  `browser-dashboard-frame.js?v=2` returned HTTP 200.
- Real Parent's Room and Cora's Room sidebar clicks selected the wrapper URLs.
- Routing survived a normal cache-enabled refresh and a new authenticated tab.
- A Home Assistant Core restart activated the changed frontend registration.
- Final user acceptance passed in Brave after a completely fresh browser
  session.

The existing unrelated Card-Mod Studio warning can appear when loading some
Home Assistant resources; it is not caused by these wrappers and does not
prevent either dashboard from rendering.

## Limitations

The original dashboards were designed for wide dedicated displays. On a
390-pixel portrait phone, preserving every control and the original composition
requires substantial uniform downscaling and letterboxing. Everything remains
visible and interactive, but text and touch targets are necessarily small.

## Rollback

1. Restore `www/housevoice/sidebar-non-kiosk-links.js` to remove
   `browserDashboardRoutes`, its route substitution, and the browser-frame
   import.
2. Remove `/local/housevoice/sidebar-non-kiosk-links.js?v=1` from
   `frontend.extra_module_url` only if the complete sidebar non-kiosk behavior
   is no longer wanted.
3. Delete the hidden `parents_room_browser` and `cora_room_browser` dashboards
   through Home Assistant's dashboard administration.
4. Delete `www/housevoice/browser-dashboard-frame.js`.
5. Refresh the browser. A Home Assistant restart is not required.

Rollback restores the previous direct sidebar destinations without touching
either original device dashboard.
