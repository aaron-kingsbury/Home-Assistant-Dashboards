# HouseVoice Contact Sensor Standard

Use this procedure to onboard Ring Z-Wave contact sensors into HouseVoice and
Alarmo. HouseVoice uses only Disarmed, Armed Home, and Armed Away; Armed Home
also serves as overnight security. Complete one sensor at a time. Do not invent
a location or production entity for an uninstalled sensor.

## 1. Safety and baseline

1. Confirm the intended door/window name and Home Assistant area with the user.
2. Create and verify a named Home Assistant backup before changing Alarmo,
   dashboards, helpers, or automations.
3. Record the current Git revision and existing uncommitted work. Scope the
   checkpoint so unrelated work is not included.
4. Do not factory-reset, exclude/reinclude, change firmware, or alter Z-Wave
   configuration parameters unless a diagnosed problem requires it and the user
   approves it explicitly.

## 2. Inclusion and device inventory

1. Include with the device close to the Z-Wave controller, following the Ring
   manual and using S2 security. Retain the DSK/PIN securely; never put it in the
   repository or documentation.
2. Verify the completed interview and record:
   - manufacturer, exact model/generation, node ID, firmware, and granted
     security classes;
   - assigned Home Assistant area;
   - association groups and Lifeline assignment;
   - wake-up interval, sleeping/reporting role, battery state, and available
     route/communication statistics;
   - exposed configuration parameters without changing their values; and
   - every entity created for the device.
3. A sleeping battery sensor showing `asleep` is normal. Judge communication
   health from successful reports, wake-ups, contact events, and failed-command
   statistics rather than treating sleep as offline.

### Pilot reference

The Garage Entry Door pilot is a Ring Contact Sensor Gen2, model
`4SD2SZ-0EN0`, Z-Wave node 13, firmware `1.40.6`, included with S2
Authenticated security. It has one Lifeline association group, a 43,200-second
wake-up interval, and reports as a sleeping reporting device. Its entity IDs
remain under `hallway_garage_entry_contact_sensor`; the human-readable device
name is **Garage Entry Door**, and the device remains assigned to **Hallway**.

## 3. Naming and required entities

- Device name: the physical security location, for example `Garage Entry Door`.
- Keep stable entity IDs after onboarding; use friendly names for presentation.
- The primary intrusion/contact entity is the only entity used for door-open
  state and Alarmo intrusion logic.
- Keep diagnostic entities separate from intrusion logic.

Required or expected entities when exposed by the device:

- primary intrusion/contact state;
- battery level;
- node/communication status;
- cover tamper;
- magnetic interference;
- low battery-temperature warning;
- power-applied/reset notification;
- system software-failure notification;
- identify and ping controls; and
- firmware update entity.

Do not substitute a diagnostic event for the contact state. Do not suppress an
active fault until its notification type, event parameter, timestamp, and
recurrence are understood.

## 4. Alarmo configuration

### Entry doors

Configure the primary contact as **Door** with these rules:

- `always_on`: false;
- `allow_open`: false;
- `auto_bypass`: false, with no automatic bypass modes;
- `trigger_unavailable`: true;
- entry-delay handling enabled;
- exit-delay handling enabled unless the existing alarm design explicitly
  requires otherwise; and
- active modes selected explicitly for Away and Home.

Expected behavior:

- Disarmed: contact state remains visible; no alarm trigger.
- Armed Home: use the existing area entry delay. This is also the overnight
  security mode.
- Armed Away: use the existing area entry delay.
- Open or unavailable: normal arming is blocked. Bypass must be an explicit user
  action; never silently or automatically bypass a security sensor.

Preserve the HouseVoice mode timing:

- Home: exit delay disabled, 30-second entry delay, and 2-minute trigger time.
- Away: 15-second exit delay, 30-second entry delay, and 5-minute trigger time.

Do not add a competing alarm automation if Alarmo cannot express the desired
policy.

### Other sensor types

- Windows and non-entry perimeter contacts trigger immediately in Home and Away;
  do not enable entry delay without a documented reason.
- Interior sensors require a separate mode review and must not inherit entry-door
  settings automatically.
- Tamper and device-health entities are monitored separately and are not added as
  ordinary intrusion contacts.

If Alarmo MQTT is enabled but Home Assistant has no MQTT integration and no
HouseVoice consumer requires it, disable Alarmo MQTT only. Do not install MQTT
solely to hide publishing errors.

## 5. Dashboard and aggregate integration

1. Search live dashboards, YAML, UI helpers, automations, scripts, blueprints,
   and repository mirrors for the legacy/mock entity and location name.
2. Replace only references representing the same physical opening.
3. Preserve layout, backgrounds, navigation, styling, and unrelated controls.
4. Use contact semantics consistently:
   - `on` = open;
   - `off` = closed; and
   - `unknown` or `unavailable` = unknown/non-secure.
5. Never represent unknown/unavailable as closed or secure.
6. Physical binary-sensor cards are read-only. A tap may open more-info; remove
   toggle actions and disable hold/double-tap control actions.
7. Add the contact to the aggregate open-sensor helper. The aggregate must count
   only known open states and must expose or otherwise preserve a separate
   unknown/unavailable warning path.
8. Keep garage entry-door status distinct from garage overhead-door status.
9. Do not delete the mock until dependency searches and acceptance checks prove
   that no active component still uses it.

## 6. Battery and health monitoring

- Add the battery entity to the existing battery dashboard.
- Ring contact sensors use a dedicated low-battery warning below 20%.
- Show battery-unavailable separately from low battery.
- Provide a health card containing battery, node status, tamper, magnetic
  interference, battery temperature, software-failure notification, and firmware.
- Treat `asleep` as normal for the sleeping device; alert on evidence of missed
  communication or failed reporting, not sleep alone.
- Keep diagnostic warnings out of Alarmo intrusion logic.

## 7. Physical installation checks

In one coordinated test session:

1. Confirm the sensor and magnet are firmly mounted and aligned within the Ring
   installation tolerance.
2. Open and close the contact once while observing Home Assistant, HouseVoice,
   the floorplan, and the aggregate helper.
3. Remove and replace the cover once to verify tamper reporting, if supported.
4. Confirm the contact returns closed and the tamper state clears.
5. If a software-failure notification needs decoding, enable bounded temporary
   Z-Wave debug logging before this session, capture the notification parameter,
   and restore normal logging immediately afterward.

Do not trigger a production siren or external emergency notification during
these checks unless the test has been coordinated explicitly.

Before timed Alarmo testing:

1. Inventory Alarmo actions and every automation that can react to the contact or
   Alarmo state.
2. Record and temporarily disable only audible contact-chime/keypad-sync paths
   needed for a silent test; restore their original states afterward.
3. Confirm there is no production siren or emergency-notification action.
4. Confirm the household user is present with the normal disarm PIN. API/service
   disarm may be rejected when Alarmo requires a PIN, so do not rely on an
   unauthenticated service call as the safe stop.
5. For a delayed entry test, capture the pending state and disarm before the
   configured entry timer expires.

## 8. Acceptance checklist

- [ ] Backup and scoped repository baseline verified.
- [ ] Model, generation, node, firmware, S2 level, Lifeline, wake-up behavior,
      parameters, entities, and communication evidence recorded.
- [ ] Open and closed physical events verified.
- [ ] Control dashboard and floorplan show open/closed correctly.
- [ ] Unknown/unavailable is never shown as closed or secure.
- [ ] Aggregate open-sensor helper updates correctly.
- [ ] Disarmed opening does not trigger Alarmo.
- [ ] Home and Away use the documented entry/exit delays.
- [ ] Entry doors receive entry delay in both Home and Away.
- [ ] Windows trigger immediately in both Home and Away.
- [ ] Open and unavailable states block normal arming unless explicitly bypassed.
- [ ] Battery and device-health dashboard integration verified.
- [ ] Tamper behavior verified separately from intrusion.
- [ ] No unnecessary Alarmo MQTT publishing errors remain.
- [ ] No active legacy mock dependency remains.
- [ ] Live dashboards and repository mirrors match for the scoped changes.
- [ ] Home Assistant configuration validates.
- [ ] Scoped commit excludes unrelated working-tree changes and is pushed.

### Accepted pilot reference

The Garage Entry Door pilot completed coordinated acceptance on 2026-11-19:

- physical open/close changed the intrusion entity and aggregate 2 to 3 to 2;
- Control Panels and My Floorplan rendered open/closed correctly;
- cover tamper changed off to on to off without affecting intrusion;
- non-forced arming with the door open was blocked without bypass;
- Home verified no exit delay and 30-second entry delay;
- Away verified 15-second exit delay and 30-second entry delay;
- Night was verified historically during the pilot, before HouseVoice adopted
  the three-mode Disarmed/Home/Away strategy;
- no siren or emergency-notification action ran;
- temporary keypad automation and logger changes were restored; and
- Home Assistant configuration validated with no warnings.

## 9. Rollback

1. Stop testing and disarm Alarmo without triggering a siren.
2. Restore the prior Alarmo sensor/mode/MQTT settings through the Alarmo UI.
3. Restore the previous aggregate-helper template.
4. Restore dashboard changes using the saved revision/export or the scoped Git
   commit, then verify rendering.
5. Re-enable the legacy mock references only if required to restore prior
   HouseVoice behavior; do not delete the physical device or alter its pairing.
6. Use the named Home Assistant backup only when targeted rollback is
   insufficient, because backup restore has broader impact.
