# HOUSEVOICE Assistant — Graham Echo Proof of Concept

Last updated: 2026-10-17

## Scope and safety boundaries

- Experimental deployment target: Graham's Echo Show 5 only.
- Preserve the existing HouseVoice Walkie implementation and its verified audio behavior.
- Do not alter the Parents or Cora Echo installations.
- Do not claim physical microphone pickup or speaker audibility without hardware evidence.
- Do not commit or push this work to `main` without explicit permission.

## Current architecture

The existing installation already provides the core local voice-assistant path:

1. VACA 0.13.5 runs on Graham's LineageOS Echo Show 5.
2. VACA performs on-device wake-word detection and streams command audio over Wyoming.
3. `assist_satellite.vaca_96ed4d2c4` connects Graham's device to Home Assistant Assist.
4. The existing `HouseVoice` Assist pipeline uses:
   - Speech-to-text: `stt.speech_to_phrase`, English
   - Conversation agent: `conversation.home_assistant`
   - Text-to-speech: `tts.piper`, `en_US-amy-low`
   - Prefer local intents: enabled
5. Home Assistant sends synthesized response audio back to VACA over Wyoming.
6. VACA plays voice responses and exposes a separate onboard alarm path for timer alerts.

No additional Android application or always-running custom service is currently justified. VACA already provides microphone capture, wake-word detection, Assist transport, response playback, reconnect behavior, and alarm playback.

## Existing Walkie audio path

- `www/housevoice/walkie.js` captures microphone audio in the dashboard WebView with `navigator.mediaDevices.getUserMedia()`.
- The Walkie uses WebRTC for bidirectional audio and an autoplaying `<audio>` element for the remote stream.
- Echo cancellation, noise suppression, and automatic gain control are requested on the WebRTC microphone stream.
- Walkie signaling and global single-call arbitration are provided by `custom_components/housevoice_walkie`.
- Known-good physical validation exists for Graham ↔ Cora microphone, speaker, RTP, mute, teardown, and recovery.
- Known-good Walkie checkpoint: `81f7a52f9c8f52b817b42ae76d7539086c2f9a70`.

## Audio ownership requirement

VACA continuously owns the microphone while an on-device wake word is enabled. Walkie independently requests microphone access from the dashboard WebView. Concurrent Android microphone behavior has not yet been verified on Graham's LineageOS build.

Safe target behavior:

1. Wake-word listening is active while Walkie is idle.
2. Starting or receiving a Walkie call suspends assistant listening before WebRTC requests the microphone.
3. Assistant speech and wake sounds do not play during an active Walkie call.
4. Ending, declining, timing out, or failing a Walkie call releases WebRTC audio and resumes wake-word listening.
5. Cleanup is idempotent so refreshes, failed calls, and duplicate signals cannot leave either path holding audio.

No coexistence code has been changed yet. Until physical testing is available, Graham's wake word remains disabled to protect the known-good Walkie path.

If explicit coordination proves necessary, the smallest safe insertion points are Graham-only hooks in `www/housevoice/walkie.js`: suspend VACA immediately before `_makePeer()` requests `getUserMedia()`, and restore the exact prior wake-word option from the idempotent `_cleanup()` path. Incoming ringing alone does not own the WebView microphone, so suspension should occur on answer rather than offer receipt. No such change should be deployed without Graham DevTools access because every decline, timeout, duplicate-client, peer-failure, refresh, and normal-end path must be physically regression-tested.

## Live configuration discovered

### Graham VACA device

- Assist satellite: `assist_satellite.vaca_96ed4d2c4`
- Media player: `media_player.vaca_96ed4d2c4_media_player`
- Assistant selector: `select.vaca_96ed4d2c4_assistant`
- Wake-word selector: `select.vaca_96ed4d2c4_wake_word`
- Wake-word engine: `openwakeword`
- Microphone mute: off
- Microphone gain: 0
- Voice volume: 1 of 7
- Alarm volume: 6 of 7
- Wake-word threshold: 6.0
- Screen-on-with-wake-word: enabled
- Current dashboard: `/kids-rooms/grahams-room`

### Local voice services

- Speech-to-Phrase is installed and registered.
- Piper is installed and registered.
- openWakeWord is installed and registered in Home Assistant.
- VACA also includes its own on-device openWakeWord runtime.
- Whisper is not currently registered.
- Home Assistant and Wyoming conversation components are loaded.

### Existing Assist pipelines

- `Home Assistant`: no STT or TTS configured; currently the preferred pipeline.
- `Focused local assistant`: Speech-to-Phrase, Home Assistant conversation, Piper.
- `HouseVoice`: Speech-to-Phrase, Home Assistant conversation, Piper, local intents preferred.

Graham's VACA assistant selector was changed from `preferred` to `HouseVoice` on 2026-10-17. The only other retained runtime change is Assist exposure for the existing weather entity.

## Wake word

Desired production wake word: **HOUSEVOICE**.

VACA's built-in choices do not include HOUSEVOICE. VACA 0.13.5 supports custom files under its Home Assistant configuration directory and accepts:

- ONNX models with the `openwakeword` engine.
- Compatible TFLite models with the `openwakeword_rt` engine.
- JSON plus TFLite model pairs with the `microwakeword` engine.

The preferred path is a custom OpenWakeWord ONNX model named for HOUSEVOICE, loaded through VACA's supported custom-files mechanism. The model must be trained and evaluated for Graham's voice, room acoustics, false activations, and Echo microphone response.

The verified VACA 0.13.5 deployment location is `/homeassistant/vaca/custom/openwakeword/<model>.onnx`. VACA downloads custom files at app start or from its Quick Actions → Settings → Manage Custom Files sync action. The model appears in the wake-word selector only when the `openwakeword` engine is selected.

No existing HOUSEVOICE ONNX model was found locally or in a public model search. The supported free training paths are the official openWakeWord training notebook/Training Center or another compatible local ONNX trainer. This Home Assistant host has 8 CPU cores and about 8 GB RAM but no GPU and none of the required PyTorch, TensorFlow, ONNX, ONNX Runtime, or openWakeWord training packages. Production training should not be installed into the live Home Assistant/OpenCode runtime. A real model therefore requires an external training run, followed by Graham-specific positive and false-activation recordings for tuning.

During discovery, `Hey Jarvis` was selected briefly to verify that Graham's VACA wake-word control accepts updates. It was immediately restored to `None` because microphone coexistence with Walkie has not been tested.

## Command acceptance status

### Time

- Text intent test: passed.
- Input: `what time is it`
- Home Assistant returned the correct local time in `America/New_York`.
- A full server-side `HouseVoice` intent-to-TTS pipeline generated `2:23 PM` through Piper `en_US-amy-low` and returned a valid MP3 TTS artifact.
- Physical spoken input and Graham speaker output: not yet verified.

### Timer

- Initial text-only parsing test passed but did not prove a native timer existed.
- A later `HouseVoice` Assist pipeline run was attributed to Graham's registered device ID and created native timer `01M55HG2QB6QYZQWNV2PGDMZ23` for 60 seconds.
- Three independent timer-status intents returned the same timer ID with 55 seconds, 23 seconds, and 1 second remaining. A post-expiry query returned `No timers.` This verifies native Home Assistant timer creation, countdown persistence, expiry cleanup, and Graham device association.
- VACA registers Graham's device as a native timer-capable endpoint. Its Assist satellite forwards `started`, `updated`, `cancelled`, and `finished` timer events over Wyoming; VACA handles the expiry alarm onboard.
- The separate `switch.vaca_96ed4d2c4_alarm` entity is not the native timer state and is not expected to toggle during the countdown.
- Physical expiry audibility, stop behavior, and persistence across app/device recovery: not yet verified.

### Lighting

- Text intent test: failed safely with `no_valid_targets`.
- The `Living Room` area currently has no `light.*` entity.
- Existing related helpers are:
  - `input_boolean.living_room_light_mock`
  - `input_number.living_room_light_brightness`
- The unassigned `light.kasa_smart_wi_fi_light_switch` is unavailable and supports only on/off, not brightness.
- No unrelated light was controlled and no duplicate light was created.
- A fresh live inventory on 2026-10-17 again found zero `light.*` entities in the Living Room area.
- Blocker: identify or configure the actual dimmable Living Room light before this acceptance item can pass.

### Weather

- Weather source exists: `weather.forecast_housevoice_weather`.
- Discovery state: sunny, 53 °F, from the Met.no integration.
- Assist exposure was changed from disabled to enabled for this existing entity; all existing weather unit options were preserved.
- Registry read-back confirmed `conversation.should_expose: true`.
- A Graham-device-context intent then returned `53 °F and sunny` and identified `weather.forecast_housevoice_weather` as the successful source.
- A full server-side `HouseVoice` intent-to-TTS run synthesized that response through Piper `en_US-amy-low` and produced a valid MP3 TTS artifact.
- No new weather provider or duplicate entity was created.

## Test evidence

### Verified

- Graham Assist satellite was connected and idle.
- Selecting the existing `HouseVoice` pipeline succeeded.
- Selecting and clearing a VACA wake word succeeded.
- Assist weather exposure for the existing Met.no entity was enabled and verified by registry read-back and a successful intent response.
- A native 60-second timer was created for Graham, independently queried throughout its countdown, and confirmed removed after expiry.
- Server-side `HouseVoice` time and weather requests completed through intent recognition and Piper TTS generation.
- `assist_satellite.announce` sent a test response to Graham.
- Satellite state changed from `responding` to `idle` in approximately 6.1 seconds.
- No Home Assistant Core errors were returned during discovery.
- Home Assistant Core resource snapshot was healthy: approximately 2.1% CPU and 13.7% of its memory limit.
- Parents and Cora VACA settings were not changed.
- Walkie files and configuration were not changed.

### Not verified

- Whether the announcement was physically audible from Graham's speaker.
- Physical wake-word detection.
- Physical speech transcription.
- Physical spoken response quality.
- Android microphone arbitration between VACA and WebView WebRTC.
- Timer alert audibility and persistence across sleep/restart.
- Recovery after Graham app restart, device reboot, or network interruption.
- Physical playback of the generated time and weather TTS artifacts.

## Debugging access blocker

The available Chrome DevTools tunnel currently exposes only the physical Parents dashboard. It does not expose Graham's WebView. The OpenCode container also does not have a usable ADB client or a dedicated Graham ADB bridge.

Historical test artifacts show the intended Windows endpoints were Parents `9224`, Graham `9225`, and Cora `9226`. Separate SSH local forwards were tested without touching the live Parents endpoint, but all three historical Windows ports currently reset connections. The restricted SSH key permits forwarding only; it cannot run Windows commands to inspect or recreate ADB/CDP forwards.

Physical Graham testing requires one of the following without disturbing the Parents tunnel:

1. A separate authenticated DevTools tunnel to Graham's WebView, or
2. A safe ADB forwarding mechanism to Graham's existing Windows ADB connection.

The minimum external recovery action is to reconnect Windows ADB to Graham serial `G6G1MK06139602GH`, recreate Graham's WebView forward on Windows port `9225`, and leave the Parents forward unchanged. Once `http://127.0.0.1:9225/json/list` answers on Windows, the existing restricted SSH transport can carry it to a separate local port.

The existing Parents debugging session must not be repointed as a substitute.

## Files modified

- `HOUSEVOICE_ASSISTANT_PROGRESS.md` — this progress and recovery record.

No Home Assistant YAML, custom integration code, dashboard, Walkie file, or internal registry file has been modified for this project yet.

## Runtime changes and rollback

Retained runtime change:

- `select.vaca_96ed4d2c4_assistant`: `preferred` → `HouseVoice`
- `weather.forecast_housevoice_weather` Assist exposure: disabled → enabled

Rollback:

1. Set `select.vaca_96ed4d2c4_assistant` to `preferred`.
2. Confirm `select.vaca_96ed4d2c4_wake_word` remains `None`.
3. If weather exposure must be rolled back, disable Assist exposure for `weather.forecast_housevoice_weather` in Settings → Voice assistants → Expose.

No restart or reload is required for these selector changes.

## Failed or rejected approaches

- Treating the Parents DevTools session as Graham access: rejected because it would operate on the wrong physical device.
- Leaving `Hey Jarvis` enabled for unattended testing: rejected because continuous VACA microphone ownership could interfere with the known-good Walkie microphone path.
- Claiming the TTS announcement was audible from state transitions alone: rejected; state transitions verify transport completion, not acoustic output.
- Routing the Living Room request to another light: rejected because Home Assistant reports no valid Living Room light target.
- Adding another weather provider: rejected because a working Met.no weather entity already exists.
- Using `assist_satellite.start_conversation` for the no-wake test: rejected for this pipeline because Home Assistant explicitly does not support that service with its built-in conversation agent.
- Installing a full ML training stack into the live Home Assistant/OpenCode runtime: rejected because production model training needs an external GPU-capable environment and device-specific evaluation data.

## Next actions

1. Establish dedicated, safe debugging access to Graham's Echo.
2. Run a physical no-wake pipeline test from VACA's own manual voice action on Graham.
3. Verify Speech-to-Phrase transcription and Piper playback for time and weather.
4. Identify the real dimmable Living Room light target and verify its area/name exposure.
5. Physically verify native Assist timer acknowledgement, VACA onboard expiration audio, and alarm stop behavior.
6. Test a built-in wake word on Graham while Walkie is idle.
7. Test incoming/outgoing Walkie behavior with wake-word listening active.
8. Implement explicit audio ownership only if Android does not arbitrate the two microphone clients safely.
9. Train externally, install, and tune a custom HOUSEVOICE wake-word model.
10. Test restart, sleep, reboot, network recovery, duplicate-command protection, and resource use.
11. Continue local milestone checkpoints on `housevoice/graham-voice-poc`; do not push or commit this work to `main` without explicit permission.
