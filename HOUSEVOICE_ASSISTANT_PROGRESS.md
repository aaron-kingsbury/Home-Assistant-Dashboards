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

VACA continuously owns the microphone while an on-device wake word is enabled. Walkie independently requests microphone access from the dashboard WebView. Graham's LineageOS build was physically tested on 2026-10-17 with VACA configured for `Hey Jarvis`: both outgoing and incoming Walkie calls acquired live WebView microphone tracks and completed bidirectional WebRTC transport.

Safe target behavior:

1. Wake-word listening is active while Walkie is idle.
2. Starting or receiving a Walkie call suspends assistant listening before WebRTC requests the microphone.
3. Assistant speech and wake sounds do not play during an active Walkie call.
4. Ending, declining, timing out, or failing a Walkie call releases WebRTC audio and resumes wake-word listening.
5. Cleanup is idempotent so refreshes, failed calls, and duplicate signals cannot leave either path holding audio.

No coexistence code has been changed. Physical transport evidence does not justify adding audio-ownership coordination: while `Hey Jarvis` was configured, Graham completed both directions of a Walkie call with live local and remote audio tracks, non-zero RTP traffic, successful ICE, and complete track/peer cleanup. Wake recognition during an active call was not separately proven, so Graham's wake word was restored to `None` after testing.

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

`Hey Jarvis` was used only as a development wake word during physical testing. At Graham's temporary music volume of 6, Piper playback of the wake phrase through the physical Echo speaker activated VACA. A separated command clip was transcribed as `what is the weather`, handled locally, and answered with `55 °F and sunny`. The selector was restored to `None` after the tests because the production wake word remains HOUSEVOICE.

## Command acceptance status

### Time

- Text intent test: passed.
- Input: `what time is it`
- Home Assistant returned the correct local time in `America/New_York`.
- A full server-side `HouseVoice` intent-to-TTS pipeline generated `2:23 PM` through Piper `en_US-amy-low` and returned a valid MP3 TTS artifact.
- Physical path passed with synthetic speech played through Graham's real speaker: `what time is it` was transcribed and answered with `2:46 PM`.
- This proves the device's acoustic wake, microphone, Speech-to-Phrase, intent, and Piper return path; it is not a substitute for a person speaking in Graham's room.

### Timer

- Initial text-only parsing test passed but did not prove a native timer existed.
- A later `HouseVoice` Assist pipeline run was attributed to Graham's registered device ID and created native timer `01M55HG2QB6QYZQWNV2PGDMZ23` for 60 seconds.
- Three independent timer-status intents returned the same timer ID with 55 seconds, 23 seconds, and 1 second remaining. A post-expiry query returned `No timers.` This verifies native Home Assistant timer creation, countdown persistence, expiry cleanup, and Graham device association.
- VACA registers Graham's device as a native timer-capable endpoint and is expected to handle expiry audio onboard.
- The separate `switch.vaca_96ed4d2c4_alarm` entity is not the native timer state and is not expected to toggle during the countdown.
- A physical wake/STT request, `set a timer for 1 minute`, was transcribed, acknowledged as `Timer set for 1 minute`, and allowed to expire on Graham.
- The calibrated physical microphone trace remained at baseline through expiry and the onboard alarm switch never activated. Native timer expiry audio therefore failed.
- The alarm hardware and acoustic measurement were independently validated by explicitly enabling the onboard alarm: mean microphone RMS rose from approximately `0.001` to `0.05–0.08`, with peaks above `0.5`, and returned to baseline after alarm-off.
- Upstream VACA issue #264 describes the same acknowledged-but-silent timer behavior and directs users to the View Assist Alarms/Reminders/Timers blueprint. That blueprint exists locally at `blueprints/automation/dinki/blueprint-alarmsreminderstimers.yaml` but no instantiated automation was found. No automation was added during this test.
- Physical expiry audio remains failed; restart persistence remains unverified.

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
- A physical Graham wake/STT run transcribed `what is the weather`, returned `55 °F and sunny`, and produced strong microphone evidence of the returned Piper response: mean RMS approximately `0.09–0.10` versus baseline near `0.001`.
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
- Dedicated SSH forwarding to Windows `127.0.0.1:9225` was established without altering the Parents tunnel. Local `/json/list` positively identified `Graham's Room – Home Assistant` at `/kids-rooms/grahams-room` on an Echo Show 5 (2nd Generation) WebView.
- Graham's physical WebView microphone produced a live 48 kHz mono track, non-zero waveform energy, and 81,785 bytes of recorded audio during a bounded five-second capture; every track was stopped afterward.
- The built-in `Hey Jarvis` wake word activated from measured physical speaker playback.
- Speech-to-Phrase transcribed `what time is it`, `what is the weather`, and `set a timer for 1 minute` from Graham's physical microphone path.
- Home Assistant processed the time, weather, and timer requests locally.
- Piper response playback was physically measured on Graham; the weather response rose to mean microphone RMS around `0.09–0.10` from a baseline near `0.001`.
- Graham → Parents Walkie connected while `Hey Jarvis` was configured. Graham sent 40,454 bytes/909 RTP packets and received 62,286 bytes/912 packets before clean teardown.
- Parents → Graham Walkie connected while `Hey Jarvis` was configured. Graham sent 34,507 bytes/654 RTP packets and received 48,529 bytes/652 packets before clean teardown.
- Both Walkie directions ended with no call, peer, local stream, or remote stream retained; Graham's microphone track reached `ended` and neither card reported an error.
- Explicit Graham onboard-alarm playback was physically measured and alarm-off was verified.
- A non-destructive Graham WebView page reload recovered without intervention: the Graham route, HA connection, and idle `room=graham` Walkie card returned with no retained streams or error. At nine seconds the document briefly reported `Cora's Room` and had not rendered the Walkie card; by approximately 19 seconds it corrected to `Graham's Room`. This is page-reload evidence only, not an app restart or device reboot test.
- Temporary test settings were restored: wake word `None`, music volume `0`, voice volume `1`, diagnostics off, and alarm off. Graham's assistant remains `HouseVoice`.

### Not verified

- Human-spoken wake-word and command quality in Graham's actual room; the completed acoustic tests used Piper-generated speech through the physical speaker.
- Wake-word recognition during an active Walkie call. Concurrent configuration plus WebRTC microphone/transport passed, but recognition itself was not invoked mid-call.
- Native timer alert audio currently fails despite successful creation and acknowledgement.
- Timer persistence across app/device recovery.
- Recovery after Graham app restart, device reboot, or network interruption.
- Custom HOUSEVOICE wake-word accuracy and false-activation rate.

## Debugging access

- Graham ADB serial: `G6G1MK06139602GH`.
- Graham WebView socket on Windows: `webview_devtools_remote_1247`.
- Windows CDP endpoint: `127.0.0.1:9225`.
- A dedicated restricted SSH forward maps local `127.0.0.1:9225` to Windows `127.0.0.1:9225`.
- Local `/json/list` was verified before interaction and returned only Graham's actual dashboard, `https://housevoice.duckdns.org/kids-rooms/grahams-room`.
- The existing Parents DevTools manager was not repointed or modified; Cora was not accessed.

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
- Replacing all entity-registry options in one weather update: rejected by Home Assistant with `invalid_format`; the supported domain-scoped `options_domain: conversation` update then succeeded and preserved weather unit options.
- Using `assist_satellite.start_conversation` for the no-wake test: rejected for this pipeline because Home Assistant explicitly does not support that service with its built-in conversation agent.
- Installing a full ML training stack into the live Home Assistant/OpenCode runtime: rejected because production model training needs an external GPU-capable environment and device-specific evaluation data.
- Treating a successful state transition as timer audibility: rejected. A calibrated microphone capture proved the onboard alarm can be measured, then showed the real native timer expiry remained silent.
- Using seconds-based synthetic Speech-to-Phrase timer commands: rejected after two phrases activated listening but produced no transcript. The supported `set a timer for one minute` phrase succeeded.
- Adding audio-ownership hooks after successful bidirectional coexistence tests: rejected because current physical evidence does not show Android microphone arbitration failure.

## Next actions

1. Decide whether to instantiate the existing View Assist Alarms/Reminders/Timers blueprint for Graham and physically validate its expiry/stop path; native VACA timer expiry is currently silent.
2. Perform a human-spoken Graham room test for wake accuracy, transcription quality, and response audibility.
3. Test wake recognition during an active Walkie call only if that behavior is required; do not add audio-ownership hooks without failure evidence.
4. Identify the real dimmable Living Room light target and verify its area/name exposure.
5. Train externally, install, and tune a custom HOUSEVOICE wake-word model.
6. Test VACA app restart, display sleep/wake, device reboot, network interruption, duplicate-command protection, and resource use.
7. Continue local milestone checkpoints on `housevoice/graham-voice-poc`; do not push or commit this work to `main` without explicit permission.
