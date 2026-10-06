"""Central signaling and call-state arbitration for HouseVoice Walkie."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

import voluptuous as vol
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

DOMAIN = "housevoice_walkie"
REQUEST_EVENT = "housevoice_walkie_request"
SIGNAL_EVENT = "housevoice_walkie_signal"
STATE_EVENT = "housevoice_walkie_state"
CALL_TIMEOUT_SECONDS = 30

ROOMS = {
    "graham": {"name": "Graham", "enabled": True},
    "cora": {"name": "Cora", "enabled": True},
    "parents": {"name": "Parents", "enabled": False},
}


class WalkieCoordinator:
    """Validate signaling and reserve each room for one active call."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.active: dict[str, dict[str, Any]] = {}
        self._call_timeouts: dict[str, asyncio.TimerHandle] = {}
        self.unsubscribe: Callable[[], None] | None = None

    @callback
    def _set_diagnostics(
        self,
        *,
        state: str,
        sender: str | None = None,
        target: str | None = None,
    ) -> None:
        timestamp = dt_util.now().isoformat()
        self.hass.states.async_set("sensor.housevoice_walkie_last_request", timestamp)
        self.hass.states.async_set("sensor.housevoice_walkie_last_caller", sender or "unknown")
        self.hass.states.async_set("sensor.housevoice_walkie_last_recipient", target or "unknown")
        self.hass.states.async_set("sensor.housevoice_walkie_call_state", state)

    async def async_start(self) -> None:
        self.unsubscribe = self.hass.bus.async_listen(REQUEST_EVENT, self._handle_request)
        self.hass.services.async_register(
            DOMAIN,
            "call",
            self._call_service,
            schema=vol.Schema(
                {
                    vol.Required("from"): cv.string,
                    vol.Required("to"): cv.string,
                    vol.Optional("call_id"): cv.string,
                }
            ),
        )
        self.hass.services.async_register(
            DOMAIN,
            "client_log",
            self._client_log_service,
            schema=vol.Schema(
                {
                    vol.Required("room_id"): cv.string,
                    vol.Required("stage"): cv.string,
                    vol.Optional("detail", default=""): cv.string,
                }
            ),
        )

    async def _client_log_service(self, service_call: Any) -> None:
        room_id = service_call.data["room_id"]
        stage = service_call.data["stage"]
        detail = service_call.data["detail"]
        self.hass.states.async_set(
            f"sensor.housevoice_walkie_{room_id}_client_stage",
            stage,
            {"detail": detail, "timestamp": dt_util.now().isoformat()},
        )

    async def async_stop(self) -> None:
        if self.unsubscribe:
            self.unsubscribe()
            self.unsubscribe = None
        for handle in self._call_timeouts.values():
            handle.cancel()
        self._call_timeouts.clear()
        self.hass.services.async_remove(DOMAIN, "call")
        self.hass.services.async_remove(DOMAIN, "client_log")

    async def _call_service(self, service_call: Any) -> None:
        sender = service_call.data["from"]
        target = service_call.data["to"]
        call_id = service_call.data.get("call_id") or f"{sender}-{target}"
        self._set_diagnostics(state="requested", sender=sender, target=target)
        if (
            sender not in ROOMS
            or target not in ROOMS
            or sender == target
            or not ROOMS[sender]["enabled"]
            or not ROOMS[target]["enabled"]
            or bool(self.active)
        ):
            self._set_diagnostics(state="rejected", sender=sender, target=target)
            self._forward(
                {
                    "kind": "busy",
                    "call_id": call_id,
                    "from": "housevoice_walkie",
                    "to": sender,
                }
            )
            return
        call: dict[str, Any] = {
            "call_id": call_id,
            "from": sender,
            "to": target,
            "state": "ringing",
        }
        self.active[sender] = call
        self.active[target] = call
        self._schedule_timeout(call)
        self._set_diagnostics(state="ringing", sender=sender, target=target)
        self._emit_state(call, "ringing")
        self._forward(
            {
                "kind": "start",
                "call_id": call["call_id"],
                "from": target,
                "to": sender,
            }
        )

    @callback
    def _emit_state(self, call: dict[str, Any] | None, state: str) -> None:
        self._set_diagnostics(
            state=state,
            sender=call.get("from") if call else None,
            target=call.get("to") if call else None,
        )
        self.hass.bus.async_fire(
            STATE_EVENT,
            {
                "state": state,
                "call_id": call.get("call_id") if call else None,
                "from": call.get("from") if call else None,
                "to": call.get("to") if call else None,
            },
        )

    @callback
    def _forward(self, data: dict[str, Any]) -> None:
        self.hass.bus.async_fire(SIGNAL_EVENT, data)

    @callback
    def _release(self, call: dict[str, Any], state: str) -> None:
        timeout = self._call_timeouts.pop(call["call_id"], None)
        if timeout:
            timeout.cancel()
        self.active.pop(call["from"], None)
        self.active.pop(call["to"], None)
        self._emit_state(call, state)

    def _schedule_timeout(self, call: dict[str, Any]) -> None:
        self._call_timeouts[call["call_id"]] = self.hass.loop.call_later(
            CALL_TIMEOUT_SECONDS, self._timeout_call, call["call_id"]
        )

    @callback
    def _timeout_call(self, call_id: str) -> None:
        call = next(
            (active for active in self.active.values() if active["call_id"] == call_id),
            None,
        )
        if not call:
            return
        self._release(call, "timeout")
        self._forward_terminal(call, "end")

    @callback
    def _forward_terminal(self, call: dict[str, Any], kind: str) -> None:
        """Tell every browser in both rooms to release this call."""
        self._forward(
            {
                "kind": kind,
                "call_id": call["call_id"],
                "from": call["from"],
                "to": call["to"],
            }
        )
        self._forward(
            {
                "kind": kind,
                "call_id": call["call_id"],
                "from": call["to"],
                "to": call["from"],
            }
        )

    async def _handle_request(self, event: Event) -> None:
        data = dict(event.data)
        sender = data.get("from")
        target = data.get("to")
        call_id = data.get("call_id")
        kind = data.get("kind")
        if (
            sender not in ROOMS
            or target not in ROOMS
            or sender == target
            or not ROOMS[sender]["enabled"]
            or not ROOMS[target]["enabled"]
            or not call_id
        ):
            return

        call: dict[str, Any] = {
            "call_id": call_id,
            "from": sender,
            "to": target,
            "state": "ringing",
        }
        if kind == "offer":
            active = self.active.get(sender)
            if self.active and not active:
                self._forward({"kind": "decline", "call_id": call_id, "from": "housevoice_walkie", "to": sender})
                return
            if active and (
                active["call_id"] != call_id
                or {active["from"], active["to"]} != {sender, target}
            ):
                self._forward({"kind": "decline", "call_id": call_id, "from": "housevoice_walkie", "to": sender})
                return
            if not active:
                self.active[sender] = call
                self.active[target] = call
                self._schedule_timeout(call)
                active = call
            client_id = data.get("client_id")
            selected_client_id = active.get("offer_client_id")
            if selected_client_id:
                if selected_client_id != client_id:
                    self._forward(
                        {
                            "kind": "caller_selected",
                            "call_id": call_id,
                            "from": target,
                            "to": sender,
                            "winner_client_id": selected_client_id,
                        }
                    )
                return
            active["offer_client_id"] = client_id
            self._forward(
                {
                    "kind": "caller_selected",
                    "call_id": call_id,
                    "from": target,
                    "to": sender,
                    "winner_client_id": client_id,
                }
            )
            self._emit_state(call, "ringing")
            self._forward(data)
            return

        active = self.active.get(sender)
        if (
            not active
            or active["call_id"] != call_id
            or {active["from"], active["to"]} != {sender, target}
        ):
            return
        if kind == "answer":
            if active.get("state") == "connected":
                return
            active["state"] = "connected"
            active["answer_client_id"] = data.get("client_id")
            timeout = self._call_timeouts.pop(call_id, None)
            if timeout:
                timeout.cancel()
            self._emit_state(active, "connected")
            self._forward(data)
            self._forward(
                {
                    "kind": "accepted_elsewhere",
                    "call_id": call_id,
                    "from": target,
                    "to": sender,
                    "winner_client_id": data.get("client_id"),
                }
            )
            return
        elif kind in ("decline", "end"):
            self._release(active, "declined" if kind == "decline" else "ended")
            self._forward_terminal(active, kind)
            return
        self._forward(data)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the central Walkie signaling coordinator."""
    coordinator = WalkieCoordinator(hass)
    await coordinator.async_start()
    hass.data[DOMAIN] = coordinator
    return True


async def async_unload(hass: HomeAssistant) -> bool:
    """Unload the coordinator."""
    coordinator: WalkieCoordinator | None = hass.data.pop(DOMAIN, None)
    if coordinator:
        await coordinator.async_stop()
    return True
