# HOUSEVOICE Walkie/Intercom Progress

Updated: 2026-10-08

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

- On 2026-10-08 the production-path harness passed all six directions plus three repeat calls (9/9).
- After the reported physical failure, a second harness reproduced and then passed the complete production touchscreen workflow in all six directions plus three repeats (9/9): dashboard button, visible room chooser, Calling/Incoming UI, visible ANSWER, connected RTP, visible END CALL, and idle cleanup.
- The final 9/9 touchscreen matrix was rerun after Graham and Cora received a clean VACA refresh and loaded build 6 directly from the persisted Lovelace resource.
- Every passing call verified incoming signaling, answer, one live card/peer per endpoint, connected ICE/peer state, live local/remote audio tracks, increasing inbound and outbound RTP packets/bytes at both endpoints, hangup, and return to idle.
- RTP audio-energy counters increased on real-device calls. This proves live microphone/audio media, not subjective audible speech quality.
- Parents, Graham, and Cora all reported DuckDNS HTTPS, secure context, `navigator.mediaDevices`, `getUserMedia`, visible documents, and connected HA WebSockets.
- Historical physical Graham ↔ Cora tests also passed audible two-way audio, reverse calling, and repeat calling.
- Backend and frontend syntax/config validation passed after Parents activation.
- Local NGINX HTTPS endpoint for `housevoice.duckdns.org` answers successfully with the valid certificate origin.

## Current failures/blockers

- Parents VACA's stored external-auth refresh credential does not survive a cold HA page reload. The page can be restored with a short-lived in-memory token relay and then passes real calls, but a later hard reload returns to the HA init page.
- VACA's native `externalApp.getExternalAuth` and `revokeExternalAuth` bridge methods return without issuing a token callback or navigating to the OAuth page on Parents, preventing autonomous renewal of VACA's stored refresh token.
- Durable completion therefore requires one Parents VACA OAuth sign-in/reauthorization unless the native bridge starts responding. Do not re-pair the Wyoming/VACA integration.

## Root causes/fixes discovered

- Parents originally used `http://192.168.50.10:8123`, giving `isSecureContext=false` and no `navigator.mediaDevices`; kids use `https://housevoice.duckdns.org` and do expose microphone APIs.
- Parents VACA HA URL was changed to the same DuckDNS HTTPS origin.
- Added an AdGuard split-DNS filter mapping only `housevoice.duckdns.org` to `192.168.50.10`; direct AdGuard DNS verification returns `192.168.50.10`.
- DevTools confirmed navigation reaches `192.168.50.10:443` with HTTP 200, proving split DNS and TLS routing work.
- Kids frontend initialization was recovered by closing stale DevTools frontends and using VACA-managed refresh, then attaching to the new targets.
- The first matrix exposed unconditional 30/60-second kids-dashboard reloads interrupting incoming Graham calls. All eight timers now reload only when the HA WebSocket is disconnected.
- The actual global Lovelace resource (ID `67c09047891942e8a4231fb3b6206ce8`) was updated from build 3 to build 4. Graham and Cora cold reloads then loaded build 4 directly.
- Physical taps initially failed because the chooser was a second top-layer `<dialog>` behind Browser Mod's popup. The labels were visible, but Android hit-testing targeted Browser Mod's dialog; Browser Mod closed and the room handler never ran.
- Rendering inside Browser Mod first exposed its asynchronous attachment and click-retargeting behavior. The final fix delays attachment detection, renders chooser/call controls inline in the existing popup, and captures Walkie action clicks before Browser Mod can dismiss the caller card. Hidden incoming-call cards retain the standalone modal path.

## Changes made

- `www/housevoice/walkie.js`: Parents live entity/path mapping, INTERCOM branding, audio-processing constraints, and Browser Mod-safe physical touch handling.
- `custom_components/housevoice_walkie/__init__.py`: Parents enabled.
- Parents live dashboard: shared card/resource and INTERCOM hit target added without layout redesign.
- Kids live dashboard and Git mirror: eight recovery timers no longer reload healthy sessions.
- Global Lovelace resource: `/local/housevoice/walkie.js?v=19&build=6`.
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

## Git checkpoints

- `fa6ab6a` — working Graham/Cora baseline before Parents integration.
- `ca3b5f1` — Parents enabled in shared Walkie signaling/frontend.
- `c598338` — 9/9 RTP matrix, split DNS, Parents dashboard additions, and healthy-session reload protection.
- Parents dashboard mirror additions are staged separately from pre-existing unrelated edits; do not stage the whole dirty file.

## Next exact action

Complete one OAuth sign-in/reauthorization inside Parents VACA so it stores a valid refresh token for `https://housevoice.duckdns.org`. Then cold-reload Parents, verify build 6 loads without token relay, rerun the 9-call touchscreen matrix, and create the final completion commit without unrelated working-tree changes.
