# HouseVoice Ring Contact Sensor Pilot Status

Prepared 2026-11-18 and updated 2026-11-19 after the coordinated acceptance
session. This document records the accepted configuration, verified results,
remaining diagnostic finding, and rollback.

## Post-pilot three-mode strategy

HouseVoice subsequently adopted a simplified security strategy:

- supported operating states are Disarmed, Armed Home, and Armed Away;
- Armed Home also serves as overnight security;
- Home preserves no exit delay, a 30-second entry delay, and a 2-minute trigger
  time;
- Away preserves a 15-second exit delay, a 30-second entry delay, and a
  5-minute trigger time;
- exterior entry doors use entry delay in Home and Away; and
- windows trigger immediately in Home and Away.

Armed Night is to be disabled in Alarmo and removed from the Garage Entry Door's
enabled modes. The original Night configuration and acceptance result below are
retained as historical pilot evidence rather than current policy. The final
three-mode UI and keypad acceptance is tracked separately from this completed
pilot checkpoint.

## Safety state

- Alarmo is currently **disarmed**.
- The controlled physical and Alarmo tests are complete. No production siren,
  emergency notification, firmware update, exclusion/reinclusion, or restart
  occurred.
- The two keypad blueprint automations were disabled only for the test window and
  restored to their prior enabled state. Temporary Z-Wave debug logging was
  restored to normal levels.
- Baseline Home Assistant backup: `1495038b`, **HouseVoice Ring contact sensor
  pilot baseline**. It includes Home Assistant and the database and reported no
  failed components.

## Verified device baseline

- Device: Ring Contact Sensor Gen2, model `4SD2SZ-0EN0`.
- Z-Wave node: 13.
- Firmware: `1.40.6` (current update entity reports no newer version).
- Security: S2 Authenticated.
- Home Assistant area: Hallway.
- Human-readable security location: Garage Entry Door.
- Association: one group, **Lifeline**, assigned through Association CC.
- Wake-up: 43,200 seconds; supported range 3,600–86,400 seconds in 3,600-second
  steps; wake-on-demand supported.
- Device role: sleeping reporting slave. `asleep` is normal operation.
- Communication evidence: the contact produced repeated successful open/close
  reports and a later scheduled report. Captured bounded Z-Wave add-on logs contain
  no node-13 failure, timeout, dropped-command, retry, or no-ACK line. The current
  tool profile does not expose Z-Wave JS's complete per-node route/statistics
  object, so no packet-loss percentage or route-quality number is claimed.
- Battery: 100% at inclusion; non-rechargeable; no low-temperature or replacement
  warning was reported.
- Inclusion exposed six configuration parameters. Their values were not changed:
  1. heartbeat interval, default 70 minutes (automatic battery report after the
     last event; range 1–70 minutes);
  2. application-level retry count, default 1 (range 0–5);
  3. retry base wait, default 5 seconds (range 1–60 seconds);
  4. green LED indication mode, default 1 (range 0–2);
  5. one-shot wake timer, default 0 seconds (write range 5–65,535 seconds, then
     resets to 0); and
  6. Supervision Report timeout, default 1,500 ms (range 500–5,000 ms).
- Battery/reporting behavior: contact and diagnostic events report immediately;
  parameter 1 schedules a battery heartbeat up to every 70 minutes after the last
  event, while Wake Up CC separately schedules the 12-hour wake notification.
- Required pairing, security, area assignment, and entity IDs were preserved.

### Exposed entities

- `binary_sensor.hallway_garage_entry_contact_sensor_intrusion`
- `binary_sensor.hallway_garage_entry_contact_sensor_tampering_product_cover_removed`
- `binary_sensor.hallway_garage_entry_contact_sensor_magnetic_field_interference_detected`
- `binary_sensor.hallway_garage_entry_contact_sensor_power_has_been_applied`
- `binary_sensor.hallway_garage_entry_contact_sensor_system_software_failure_with_failure_code`
- `binary_sensor.hallway_garage_entry_contact_sensor_battery_temperature_is_low`
- `sensor.hallway_garage_entry_contact_sensor_battery_level`
- `sensor.hallway_garage_entry_contact_sensor_node_status`
- `button.hallway_garage_entry_contact_sensor_ping`
- `button.hallway_garage_entry_contact_sensor_identify`
- `update.hallway_garage_entry_contact_sensor_firmware`

## Device-health finding

The exact Ring Gen2 technical manual applies to this model and maps System
Notification `0x09`, event `0x04`, to these parameter values:

- `0x55`: watchdog;
- `0xAA`: Ring software fault;
- `0xA9`: SDK software fault;
- `0xAB`: pin/soft reset;
- `0xAC`: normal software reset, not triggered by failure; and
- `0xAD`: dropped frame.

The Home Assistant problem entity changed from off to on at
`2026-11-18T04:06:17.563946Z`, about one minute after inclusion and at the same
time as a device wake-up. It has not produced another logbook transition. A
later report at `2026-11-18T05:03:04.339454Z` repeated the existing on state; it
did not create a new on transition. Recorder and normal add-on logs do not retain
the original event parameter, so the historical condition cannot be classified
as a specific Ring failure code. Do not suppress it.

Bounded Z-Wave debug logging was enabled for the accepted open/close and
cover-removal/replacement session. The entity did not update and no new System
Notification software-failure event appeared. The physical session therefore
did not reproduce the fault. Keep the diagnostic visible and investigate only if
it changes again; a future recurrence must be captured with its event parameter.

## Accepted Alarmo configuration

- Installed Alarmo version: `1.10.19`.
- Alarm entity: `alarm_control_panel.alarmo`, currently disarmed.
- Sensor device type displayed in Alarmo: **Door**.
- Sensor active modes: **Away**, **Home**, and **Night**.
- Alarmo MQTT is disabled. Home Assistant MQTT was not installed.
- User-confirmed live Alarmo UI settings:
  - Away: enabled; one active sensor; exit delay enabled at 15 seconds; entry
    delay enabled at 30 seconds; trigger time enabled at 5 minutes.
  - Home: enabled; one active sensor; exit delay disabled; entry delay enabled at
    30 seconds; trigger time enabled at 2 minutes.
  - Night: enabled; exit delay disabled; entry delay disabled; trigger time
    enabled at 2 minutes.
  - Garage Entry Door: Door; Away, Home, and Night; use exit delay on; use entry
    delay on; individual entry delay disabled; trigger delay disabled; arm after
    closing off; automatic bypass off with no bypass modes; allow open initially
    off; trigger when unavailable on; always-on false.
- Alarmo Actions has no notification or siren action. One existing enabled Away
  action turns all lights off when Away finishes arming; that expected effect was
  accepted for the controlled test.
- The contact-chime and keypad synchronization blueprint automations were both
  restored to enabled after testing.

Alarmo source review confirms:

- `allow_open: false` is required for an open contact to block normal arming;
- `auto_bypass: false` prevents silent bypass;
- `trigger_unavailable: true` is required for unavailable to block arming and
  participate in armed-state violation handling;
- `always_on: false` is required for a normal entry door; and
- an enabled sensor entry delay with no sensor-specific override uses the
  selected Alarmo mode's area entry policy. Therefore Night can be immediate with
  its entry delay disabled while Home/Away retain their existing values.

## Saved Alarmo settings

### General

1. **Enable MQTT** is off. MQTT was not installed.
2. Away is preserved at 15-second exit, 30-second entry, 5-minute trigger.
3. Home is preserved at no exit delay, 30-second entry, 2-minute trigger.
4. Night is enabled at no exit delay, no entry delay, 2-minute trigger.

### Garage Entry Door sensor

Saved and verified:

- Device type: Door.
- Enabled modes: Away, Home, Night.
- Use exit delay: on.
- Use entry delay: on.
- Sensor-specific entry delay: blank/default (no override).
- Trigger delay (`delay_on`): blank/0.
- Arm on close: off.
- Automatically bypass: off, with no bypass modes.
- Allow open initially: off.
- Trigger when unavailable: on.
- Always on: false. Alarmo hides this field for Door type; reselecting Door
  applies the Door preset with always-on false if the UI reveals an inconsistency.

## Verified template-helper migration

Helper: **Locks Sensors Open** (`sensor.locks_sensors_open`, config entry
`01KZ7V3M7STZ05GHJEB0PXGYE7`).

The existing helper was edited in place. Its state template replaced only:

`input_boolean.entry_garage_entry_mock`

with:

`binary_sensor.hallway_garage_entry_contact_sensor_intrusion`

All other listed sensors and template behavior remain unchanged. A controlled
toggle of `input_boolean.entry_garage_entry_mock` did not change the aggregate,
proving that the helper no longer depends on the garage mock. The physical test
verified count 2 with the door closed, 3 with it open, and 2 after closing.

## Completed dashboard and repository work

- Live Control Panels Locks Control migrated, revision verified, and rendered.
  Verified revision:
  `sha256:0d43d3160f329b02cfd033e0c4d01501ab3c81581b0c33d3aa1593692d7f241f`.
- Live My Floorplan Locks Control migrated, revision verified, and rendered.
  Verified revision:
  `sha256:62710696f4e925cf7b03a1f99e59c458a6bdcdc2652e36aa48d09072fc3e9f98`.
- Live Battery & Warnings dashboard includes the Ring battery, dedicated below-20%
  and unavailable warnings, and a separate health card. Verified revision:
  `sha256:44ab8b5af8f47b54e4d2f8a90887e00a8ff02493ef541af4f1585fe97bee2169`.
- Physical-contact cards are read-only. `on` is open, `off` is closed, and
  unknown/unavailable is non-secure and never displayed as closed.
- Repository mirrors are synchronized in:
  - `dashboards/control-panels.json`;
  - `dashboards/my-floorplan.json`; and
  - `dashboards/battery-monitor.json`.
- A readable file/dependency scan finds no remaining garage-entry mock reference,
  and the UI-managed helper dependency was disproved by the controlled toggle.
- Two unrelated pre-existing missing battery entities remain untouched.
- Home Assistant configuration validation reports valid with no warnings.

## Verified acceptance results

- Physical open: intrusion changed off to on; aggregate changed 2 to 3; disarmed
  Alarmo did not trigger; Control Panels and My Floorplan both visibly showed
  Garage Entry Sensor open and three open sensors.
- Physical close: intrusion changed on to off; aggregate returned 3 to 2; both
  dashboards visibly returned Garage Entry Sensor to closed.
- Cover removal/replacement: tamper changed off to on to off without substituting
  for intrusion or changing the aggregate.
- Bounded node-13 trace decoded the removal as Home Security, `Tampering, product
  cover removed`, `Cover status: 0 => 3`, over S2 Authenticated. No new
  software-failure event appeared.
- Open-arm blocking: a non-forced Home request remained disarmed and listed only
  Garage Entry Door as open. No automatic bypass occurred.
- Home: armed immediately with no exit delay; opening entered a 30-second pending
  entry delay. The timer expired immediately before PIN disarm during the test,
  briefly entering Alarmo's triggered state, but no siren or notification action
  ran.
- Away: entered a verified 15-second exit delay, then armed Away; opening entered
  a verified 30-second pending entry delay; PIN disarm completed before trigger.
  The existing Away action turned lights off as expected and approved.
- Night: armed immediately with no exit delay; opening triggered immediately with
  no entry delay; only Garage Entry Door was listed; PIN disarm completed and no
  siren or notification action ran.
- Final runtime state: Alarmo disarmed; contact closed; tamper clear; aggregate 2;
  garage mock off; both keypad blueprint automations enabled; temporary logging
  restored.
- Home Assistant configuration validated after testing with no errors or warnings.
- Unavailable blocking was verified by saved `trigger_unavailable: true` and
  Alarmo source behavior; the production entity was not deliberately made
  unavailable because that would require an unsafe integration/device disruption.
- Final backup `1e723c03`, **HouseVoice Ring contact sensor pilot final**, completed
  successfully and includes Home Assistant. Scoped commit and push remain to be
  recorded after verification.

## Rollback

If any settings result is wrong:

1. Leave/disarm Alarmo safely; do not wait for a siren.
2. Restore the recorded Home/Away/Night mode values.
3. Restore the sensor's recorded advanced flags and remove Night from its modes.
4. Re-enable Alarmo MQTT only if it was intentionally required; otherwise leave
   it disabled because it is currently the confirmed error source.
5. Restore the helper's single entity substitution to
   `input_boolean.entry_garage_entry_mock` if aggregate behavior fails.
6. Restore dashboard content from the recorded revisions or the scoped Git diff.
7. If targeted rollback is insufficient, use baseline backup `1495038b` only
   after reviewing its broader restore impact.
