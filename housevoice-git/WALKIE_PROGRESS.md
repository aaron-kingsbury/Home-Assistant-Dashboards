# HOUSEVOICE Walkie/Intercom Progress

Updated: 2026-10-09

## Architecture

- One shared `custom:housevoice-walkie-v19` frontend in VACA Android WebViews.
- LAN-only WebRTC audio (`RTCPeerConnection({iceServers: []})`).
- Home Assistant `custom_components/housevoice_walkie` relays signaling and enforces one global call reservation plus selected-client arbitration.
- Frontend retains room-owner, signal-deduplication, call-ID/generation, and stale-peer guards.
- Parents uses `INTERCOM`; Graham and Cora use `WALKIE`.

## Device map

- Parents: Echo Show 8, ADB `G0916D0995150PT4`, VACA `a2fc97a76`, dashboard `/parents-room/parents-room`.
- Graham: Echo Show 5 (2nd Gen), ADB `G6G1MK06139602GH`, VACA `96ed4d2c4`, dashboard `/kids-rooms/grahams-room`.
- Cora: Echo Show 5 (2nd Gen), ADB `G091QV05118204A6`, VACA `c958413a0`, dashboard `/kids-rooms/home`.

## Confirmed working

- Parents completed Home Assistant OAuth reauthorization after the invalid VACA credential was removed without clearing pairing. A fresh read-only verification confirmed a new persisted refresh credential, the original `paired_device_id`, the production `/parents-room/parents-room` dashboard, a connected HA WebSocket, and `/local/housevoice/walkie.js?v=19&build=6`.
- On 2026-10-08 the production-path harness passed all six directions plus three repeat calls (9/9).
- After the reported physical failure, a second harness reproduced and then passed the complete production touchscreen workflow in all six directions plus three repeats (9/9): dashboard button, visible room chooser, Calling/Incoming UI, visible ANSWER, connected RTP, visible END CALL, and idle cleanup.
- The final 9/9 touchscreen matrix was rerun after Graham and Cora received a clean VACA refresh and loaded build 6 directly from the persisted Lovelace resource.
- Every passing call verified incoming signaling, answer, one live card/peer per endpoint, connected ICE/peer state, live local/remote audio tracks, increasing inbound and outbound RTP packets/bytes at both endpoints, hangup, and return to idle.
- RTP audio-energy counters increased on real-device calls. This proves live microphone/audio media, not subjective audible speech quality.
- Parents, Graham, and Cora all reported DuckDNS HTTPS, secure context, `navigator.mediaDevices`, `getUserMedia`, visible documents, and connected HA WebSockets.
- Historical physical Graham ↔ Cora tests also passed audible two-way audio, reverse calling, and repeat calling.
- Backend and frontend syntax/config validation passed after Parents activation.
- Local NGINX HTTPS endpoint for `housevoice.duckdns.org` answers successfully with the valid certificate origin.
- Parents dashboard redesign was verified on the actual Echo Show 8 at a 961.5 × 600.9 CSS-pixel WebView on the 1280 × 800 physical display. The final device screenshot has no clipping, overlap, or panel overflow.
- Physical ADB touchscreen taps passed all five bottom navigation targets, toggled and restored the Bedroom Light entity, and opened/dismissed the Intercom chooser with Graham and Cora available.
- Parents passed three genuine VACA cold starts on 2026-10-09. Each test proved the previous PID was gone, created a new process, retained the OAuth refresh credential and `paired_device_id`, loaded `/parents-room/parents-room` without token relay, connected the HA WebSocket, rendered exactly one Parents Walkie card, and loaded build 6. The temporary private auth rollback backup was then deleted by its exact filename.
- After deploying Walkie build 7, the final clean-load physical touchscreen matrix passed all six directions plus three repeat calls (9/9). Every call showed chooser/calling/incoming/answer/end UI, connected both WebRTC peers, increased inbound and outbound RTP packet/byte counters at both devices, hung up, and returned both endpoints to idle with no live tracks.

## Current failures/blockers

- None. Parents authentication, cold-start persistence, ADB access, and the three-room physical touchscreen/RTP matrix are verified.

## Root causes/fixes discovered

- Parents originally used `http://192.168.50.10:8123`, giving `isSecureContext=false` and no `navigator.mediaDevices`; kids use `https://housevoice.duckdns.org` and do expose microphone APIs.
- Parents VACA HA URL was changed to the same DuckDNS HTTPS origin.
- Home Assistant Core logs correlate Parents (`192.168.50.146`, Ktor client) with repeated rejected `/auth/token` requests, including the fresh startup attempt. This proves the native bridge reaches HA and rules out DuckDNS/TLS, a missing refresh request, and loss of the stored credential.
- VACA 0.13.4 source stores access/refresh tokens in Android SharedPreferences. On refresh failure it receives no usable access token and redirects to OAuth; it does not supply `externalAuthSetToken(false)` first. The observed `Uncaught (in promise) 1` is in that failed external-auth path and is not a Walkie/dashboard exception.
- ADB inspection confirmed `refresh_token` persisted as a non-empty 128-character value while `paired_device_id` remained a separate setting. An on-device private preferences backup was created; only `auth_token`, `refresh_token`, and `token_expiry` were removed. `paired_device_id` was verified present before VACA was re-enabled.
- VACA's foreground service automatically restarted after a normal `force-stop`, so the package was briefly disabled and re-enabled to obtain a genuine cold process start. The repaired start reached Home Assistant's OAuth login page for `https://vaca.homeassistant`; no app storage, pairing, dashboard, HA integration, or Walkie code was cleared.
- After the one-time on-screen OAuth authorization, VACA stored a replacement refresh credential and loaded the Parents dashboard normally. The repeatable credential-safe procedure and proposed VACA correction are documented in `VACA_AUTH_RECOVERY.md`.
- Added an AdGuard split-DNS filter mapping only `housevoice.duckdns.org` to `192.168.50.10`; direct AdGuard DNS verification returns `192.168.50.10`.
- DevTools confirmed navigation reaches `192.168.50.10:443` with HTTP 200, proving split DNS and TLS routing work.
- Kids frontend initialization was recovered by closing stale DevTools frontends and using VACA-managed refresh, then attaching to the new targets.
- The first matrix exposed unconditional 30/60-second kids-dashboard reloads interrupting incoming Graham calls. All eight timers now reload only when the HA WebSocket is disconnected.
- The actual global Lovelace resource (ID `67c09047891942e8a4231fb3b6206ce8`) was updated from build 3 to build 4. Graham and Cora cold reloads then loaded build 4 directly.
- Physical taps initially failed because the chooser was a second top-layer `<dialog>` behind Browser Mod's popup. The labels were visible, but Android hit-testing targeted Browser Mod's dialog; Browser Mod closed and the room handler never ran.
- Rendering inside Browser Mod first exposed its asynchronous attachment and click-retargeting behavior. The final fix delays attachment detection, renders chooser/call controls inline in the existing popup, and captures Walkie action clicks before Browser Mod can dismiss the caller card. Hidden incoming-call cards retain the standalone modal path.
- A later clean-device run exposed detached Walkie cards whose event subscriptions could still receive a signal before the live card and consume its shared deduplication key. Build 7 rejects every signal on a disconnected card before ownership or deduplication, preventing invisible stale instances from stealing incoming calls.

## Changes made

- `www/housevoice/walkie.js`: Parents live entity/path mapping, INTERCOM branding, audio-processing constraints, Browser Mod-safe physical touch handling, and the build-7 disconnected-card signaling guard.
- `custom_components/housevoice_walkie/__init__.py`: Parents enabled.
- Parents live dashboard and Git mirror: responsive reference-driven redesign with a larger centered clock, upper-left outdoor weather, no HOUSEVOICE branding, enlarged At a Glance and Quick Actions panels, raised bottom-navigation labels, `Thermostat` labels, preserved automatic day/night backgrounds, and aligned physical touch overlays.
- Parents dashboard resource was read back and corrected to `/local/housevoice/walkie.js?v=19&build=6` after the live storage copy was found on build 4.
- Kids live dashboard and Git mirror: eight recovery timers no longer reload healthy sessions.
- Parents, kids, and global Lovelace resources: `/local/housevoice/walkie.js?v=19&build=7`.
- `www/housevoice/duckdns-local-rewrite.txt`: narrow split-DNS filter; registered in AdGuard as `HouseVoice local HTTPS`.
- Reusable real-device harness: `/data/v2/cache/opencode/housevoice-matrix.mjs`; latest detailed result: `/data/v2/cache/opencode/housevoice-matrix-results.json`.
- Reusable touchscreen harness: `/data/v2/cache/opencode/housevoice-ui-matrix.mjs`; latest detailed result: `/data/v2/cache/opencode/housevoice-ui-matrix-results.json`.

## Test matrix

| Direction | Current result |
|---|---|
| Parents → Graham | PASS |
| Parents → Cora | PASS |
| Graham → Parents | PASS |
| Graham → Cora | PASS |
| Cora → Parents | PASS |
| Cora → Graham | PASS |

Repeat calls also passed: Parents → Graham, Graham → Cora, and Cora → Parents.

## 2026-10-09 touchscreen, layout, and clock follow-up

- All three Android touch controllers were enabled and raw taps reached each focused, responsive VACA window, but no pointer/touch events reached Chromium. DOM hit-testing found no invisible overlay, open dialog, stale Walkie portal, peer, or media track.
- A VACA-only force-stop/relaunch restored the native-to-WebView input bridge without clearing storage, OAuth, device pairing, or dashboard settings. Graham's restart also exposed the server's required VACA `0.13.4` minimum; it was updated in place from `0.13.3` with app data preserved. Parents and Cora were already on `0.13.4`.
- Native Android touchscreen injection then reached DOM pointer/touch handlers on all three real VACA WebViews. Parents navigation, bedroom-light toggle/restore, and Intercom chooser passed. Graham and Cora Light and Walkie popups also passed and closed cleanly.
- The Parents dashboard was backed up before its focused live patch. At the Echo Show 8 viewport, the clock is the dominant focal point, outdoor weather is upper-left, the mountain branding graphic is absent, both `Thermostat` labels fit, and bottom labels have clear lower spacing.
- Final HOUSEVOICE v1.0 branding correction restored the text-only `HOUSEVOICE` and `PARENTS' ROOM` lockup in the upper-right. The mountain graphic remains removed; the outdoor weather, centered clock, panels, navigation, and touch targets are unchanged. The final real-device screenshot is `/data/v2/cache/opencode/parents-housevoice-v1-final.png`.
- Post-repair Walkie regression passed 9/9 again: all six directions plus Parents → Graham, Graham → Cora, and Cora → Parents repeats. Each call passed chooser/calling/incoming/answer/end UI, connected peers, bidirectional RTP growth, hangup, and idle cleanup.
- Graham's one-minute lag was not an Android clock or timezone fault. Both kids' cards rendered on `sensor.date_time` updates but displayed `new Date()`, allowing a render just before Graham's local minute boundary to retain the prior minute. Cora and Graham now derive the displayed minute directly from the same HA `sensor.date_time` update used by Parents; styling and layout are unchanged.
- Parents, Graham, and Cora matched across the consecutive 10:34, 10:35, and 10:36 transitions, with all three displays converging in 44 ms, 29 ms, and 62 ms respectively after the observed HA minute update.
- Evidence: `/data/v2/cache/opencode/parents-updated-layout.png`, `/data/v2/cache/opencode/housevoice-ui-matrix-results.json`, and `/data/v2/cache/opencode/clock-sync-results.json`.

## Git checkpoints

- `fa6ab6a` — working Graham/Cora baseline before Parents integration.
- `ca3b5f1` — Parents enabled in shared Walkie signaling/frontend.
- `c598338` — 9/9 RTP matrix, split DNS, Parents dashboard additions, and healthy-session reload protection.
- Parents dashboard mirror additions are staged separately from pre-existing unrelated edits; do not stage the whole dirty file.

## Next exact action

Completed. Preserve build 7 and the six-direction 9/9 regression as the known-good three-room baseline.
