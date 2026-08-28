"""Central signaling and call-state arbitration for HouseVoice Walkie."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import voluptuous as vol
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

DOMAIN = "housevoice_walkie"
REQUEST_EVENT = "housevoice_walkie_request"
SIGNAL_EVENT = "housevoice_walkie_signal"
STATE_EVENT = "housevoice_walkie_state"

ROOMS = {
    "graham": {"name": "Graham", "enabled": True},
    "cora": {"name": "Cora", "enabled": True},
    "room3": {"name": "Room 3", "enabled": False},
    "room4": {"name": "Room 4", "enabled": False},
}


class WalkieCoordinator:
    """Validate signaling and reserve each room for one active call."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.active: dict[str, dict[str, str]] = {}
        self.unsubscribe: Callable[[], None] | None = None

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
                }
            ),
        )

    async def async_stop(self) -> None:
        if self.unsubscribe:
            self.unsubscribe()
            self.unsubscribe = None
        self.hass.services.async_remove(DOMAIN, "call")

    async def _call_service(self, service_call: Any) -> None:
        sender = service_call.data["from"]
        target = service_call.data["to"]
        if (
            sender not in ROOMS
            or target not in ROOMS
            or sender == target
            or not ROOMS[sender]["enabled"]
            or not ROOMS[target]["enabled"]
            or sender in self.active
            or target in self.active
        ):
            return
        call = {"call_id": f"{sender}-{target}", "from": sender, "to": target}
        self.active[sender] = call
        self.active[target] = call
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
    def _emit_state(self, call: dict[str, str] | None, state: str) -> None:
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
    def _release(self, call: dict[str, str], state: str) -> None:
        self.active.pop(call["from"], None)
        self.active.pop(call["to"], None)
        self._emit_state(call, state)

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

        call = {"call_id": call_id, "from": sender, "to": target}
        if kind == "offer":
            if sender in self.active or target in self.active:
                self._forward({"kind": "decline", "call_id": call_id, "from": "housevoice_walkie", "to": sender})
                return
            self.active[sender] = call
            self.active[target] = call
            self._emit_state(call, "ringing")
            self._forward(data)
            return

        active = self.active.get(sender)
        if not active or active["call_id"] != call_id or active.get("to") != target:
            return
        if kind == "answer":
            self._emit_state(active, "connected")
        elif kind in ("decline", "end"):
            self._release(active, "declined" if kind == "decline" else "ended")
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
