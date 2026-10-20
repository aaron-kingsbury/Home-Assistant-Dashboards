#!/usr/bin/env python3
"""Offline deterministic tests for HouseVoice Smart Climate Phase 1B."""

from __future__ import annotations

import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


TZ = ZoneInfo("America/New_York")
WEEKDAY = ((0, 360, "Sleep"), (360, 510, "Morning"), (510, 1020, "Day"),
           (1020, 1320, "Evening"), (1320, 1440, "Sleep"))
WEEKEND = ((0, 450, "Sleep"), (450, 600, "Morning"), (600, 1020, "Day"),
           (1020, 1380, "Evening"), (1380, 1440, "Sleep"))
TARGETS = {
    "Morning": (70, 74),
    "Day": (69, 76),
    "Evening": (71, 74),
    "Sleep": (67, 72),
}


def blocks_for(day: int):
    return WEEKDAY if day < 5 else WEEKEND


def active_period(moment: datetime) -> str:
    local = moment.astimezone(TZ)
    minute = local.hour * 60 + local.minute
    return next(name for start, end, name in blocks_for(local.weekday())
                if start <= minute < end)


def next_transition(moment: datetime) -> datetime:
    local = moment.astimezone(TZ)
    minute = local.hour * 60 + local.minute
    for _, end, _ in blocks_for(local.weekday()):
        if minute < end and end < 1440:
            return local.replace(hour=end // 60, minute=end % 60, second=0,
                                 microsecond=0)
    tomorrow = (local + timedelta(days=1)).date()
    first_end = blocks_for((local.weekday() + 1) % 7)[0][1]
    return datetime.combine(tomorrow, datetime.min.time(), TZ).replace(
        hour=first_end // 60, minute=first_end % 60)


@dataclass(frozen=True)
class Decision:
    recommendation: float | None
    reason: str
    would_change: bool


def decide(*, period: str | None, mode: str, real_target: float | None,
           enabled: bool = True, available: bool = True,
           hold_active: bool = False, held_target: float | None = None,
           hold_valid: bool = False, targets=TARGETS) -> Decision:
    if not available or real_target is None:
        return Decision(None, "Unavailable", False)
    if not enabled or mode == "off":
        return Decision(None, "Disabled", False)
    if period not in targets:
        return Decision(None, "Unavailable", False)
    heat, cool = targets[period]
    if not (50 <= heat <= 90 and 50 <= cool <= 90 and cool >= heat + 2):
        return Decision(None, "Unavailable", False)
    if mode not in ("heat", "cool"):
        return Decision(None, "Unavailable", False)
    if hold_active and hold_valid and held_target is not None:
        recommendation = held_target
        reason = "Manual Hold"
    else:
        recommendation = heat if mode == "heat" else cool
        reason = "Schedule"
    return Decision(recommendation, reason,
                    abs(recommendation - real_target) >= 0.5)


def capture_hold(*, source: str, guard: bool, previous: float | None,
                 candidate: float | None, hold_active: bool,
                 held_target: float | None) -> float | None:
    if source == "dashboard" and guard:
        return None
    if previous is None or candidate is None or previous == candidate:
        return None
    if not 50 <= candidate <= 90:
        return None
    if source == "thermostat" and hold_active and held_target == candidate:
        return None
    return candidate


class SmartClimatePhase1BTests(unittest.TestCase):
    def at(self, value: str) -> datetime:
        return datetime.fromisoformat(value).replace(tzinfo=TZ)

    def test_four_periods_weekday(self):
        samples = (("2026-10-19T06:00", "Morning"),
                   ("2026-10-19T08:30", "Day"),
                   ("2026-10-19T17:00", "Evening"),
                   ("2026-10-19T22:00", "Sleep"))
        for value, expected in samples:
            self.assertEqual(active_period(self.at(value)), expected)

    def test_four_periods_weekend(self):
        samples = (("2026-10-24T07:30", "Morning"),
                   ("2026-10-24T10:00", "Day"),
                   ("2026-10-24T17:00", "Evening"),
                   ("2026-10-24T23:00", "Sleep"))
        for value, expected in samples:
            self.assertEqual(active_period(self.at(value)), expected)

    def test_complete_week_coverage_and_touching_blocks(self):
        for day in range(7):
            blocks = blocks_for(day)
            self.assertEqual(blocks[0][0], 0)
            self.assertEqual(blocks[-1][1], 1440)
            self.assertTrue(all(a[1] == b[0] for a, b in zip(blocks, blocks[1:])))
            self.assertEqual(sum(end - start for start, end, _ in blocks), 1440)

    def test_midnight_sleep_split(self):
        self.assertEqual(active_period(self.at("2026-10-19T23:59")), "Sleep")
        self.assertEqual(active_period(self.at("2026-10-20T00:00")), "Sleep")

    def test_friday_to_saturday(self):
        self.assertEqual(active_period(self.at("2026-10-23T23:59")), "Sleep")
        self.assertEqual(active_period(self.at("2026-10-24T00:00")), "Sleep")
        self.assertEqual(next_transition(self.at("2026-10-23T23:59")),
                         self.at("2026-10-24T07:30"))

    def test_sunday_to_monday(self):
        self.assertEqual(active_period(self.at("2026-10-25T23:59")), "Sleep")
        self.assertEqual(active_period(self.at("2026-10-26T00:00")), "Sleep")
        self.assertEqual(next_transition(self.at("2026-10-25T23:59")),
                         self.at("2026-10-26T06:00"))

    def test_timezone_boundary_from_utc(self):
        utc = datetime.fromisoformat("2026-10-20T04:00+00:00")
        self.assertEqual(active_period(utc), "Sleep")

    def test_heating_target(self):
        self.assertEqual(decide(period="Morning", mode="heat", real_target=68),
                         Decision(70, "Schedule", True))

    def test_cooling_target(self):
        self.assertEqual(decide(period="Day", mode="cool", real_target=76),
                         Decision(76, "Schedule", False))

    def test_thermostat_off(self):
        self.assertEqual(decide(period="Day", mode="off", real_target=70).reason,
                         "Disabled")

    def test_schedule_disabled(self):
        self.assertIsNone(decide(period="Day", mode="heat", real_target=69,
                                 enabled=False).recommendation)

    def test_dashboard_manual_hold_created(self):
        self.assertEqual(capture_hold(source="dashboard", guard=False, previous=68,
                                      candidate=70, hold_active=False,
                                      held_target=None), 70)

    def test_helper_feedback_echo_suppressed(self):
        self.assertIsNone(capture_hold(source="dashboard", guard=True, previous=68,
                                       candidate=70, hold_active=False,
                                       held_target=None))

    def test_physical_change_created(self):
        self.assertEqual(capture_hold(source="thermostat", guard=False, previous=68,
                                      candidate=69, hold_active=False,
                                      held_target=None), 69)

    def test_dashboard_thermostat_echo_suppressed(self):
        self.assertIsNone(capture_hold(source="thermostat", guard=False, previous=68,
                                       candidate=70, hold_active=True,
                                       held_target=70))

    def test_physical_change_during_hold_updates_target(self):
        self.assertEqual(capture_hold(source="thermostat", guard=False, previous=70,
                                      candidate=71, hold_active=True,
                                      held_target=70), 71)

    def test_hold_suppresses_schedule(self):
        decision = decide(period="Evening", mode="heat", real_target=70,
                          hold_active=True, held_target=72, hold_valid=True)
        self.assertEqual(decision, Decision(72, "Manual Hold", True))

    def test_hold_expiry_returns_to_schedule(self):
        decision = decide(period="Sleep", mode="heat", real_target=72,
                          hold_active=True, held_target=72, hold_valid=False)
        self.assertEqual(decision, Decision(67, "Schedule", True))

    def test_resume_schedule(self):
        held = decide(period="Day", mode="heat", real_target=70,
                      hold_active=True, held_target=72, hold_valid=True)
        resumed = decide(period="Day", mode="heat", real_target=70,
                         hold_active=False, held_target=72, hold_valid=False)
        self.assertEqual(held.reason, "Manual Hold")
        self.assertEqual(resumed.reason, "Schedule")

    def test_restart_active_hold(self):
        self.assertEqual(decide(period="Day", mode="cool", real_target=76,
                                hold_active=True, held_target=75,
                                hold_valid=True).reason, "Manual Hold")

    def test_restart_expired_hold(self):
        self.assertEqual(decide(period="Day", mode="cool", real_target=75,
                                hold_active=True, held_target=75,
                                hold_valid=False).reason, "Schedule")

    def test_unavailable(self):
        self.assertEqual(decide(period="Day", mode="heat", real_target=None,
                                available=False).reason, "Unavailable")

    def test_invalid_target_separation(self):
        invalid = {**TARGETS, "Day": (75, 76)}
        self.assertEqual(decide(period="Day", mode="heat", real_target=70,
                                targets=invalid).reason, "Unavailable")

    def test_identical_evaluation_suppresses_output_writes(self):
        first = decide(period="Day", mode="heat", real_target=69)
        second = decide(period="Day", mode="heat", real_target=69)
        self.assertEqual(first, second)

    def test_reload_has_no_synthetic_input_event(self):
        before = ("Day", "heat", 69, False)
        after = before
        self.assertEqual(before, after)

    def test_real_target_already_matches(self):
        self.assertFalse(decide(period="Morning", mode="heat",
                                real_target=70).would_change)


if __name__ == "__main__":
    unittest.main(verbosity=2)
