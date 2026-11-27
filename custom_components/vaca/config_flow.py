"""Config flow for Wyoming integration."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

# pylint: disable-next=hass-component-root-import
from homeassistant.components.wyoming.config_flow import WyomingConfigFlow
from homeassistant.config_entries import ConfigEntry, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import callback
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from .const import CONF_HA_URL, DOMAIN
from .data import VAWyomingService

_LOGGER = logging.getLogger(__name__)


class VAWyomingConfigFlow(WyomingConfigFlow, domain=DOMAIN):
    """Handle a config flow for Wyoming integration."""

    async def async_step_zeroconf(
        self, discovery_info: ZeroconfServiceInfo
    ) -> ConfigFlowResult:
        """Handle discovery and update an existing device's endpoint."""
        if discovery_info.port is None:
            return self.async_abort(reason="no_port")

        service = await VAWyomingService.create(
            discovery_info.host, discovery_info.port
        )
        if service is None or not (name := service.get_name()):
            return self.async_abort(reason="no_services")

        unique_id = f"{discovery_info.name}_{name}"
        await self.async_set_unique_id(unique_id)
        endpoint = {
            CONF_HOST: service.host,
            CONF_PORT: service.port,
        }
        self._abort_if_unique_id_configured(
            updates=endpoint, reload_on_update=True
        )

        # Adopt legacy manually configured entries with the stable VACA name
        # instead of offering a duplicate entry after an address change.
        for entry in self._async_current_entries(include_ignore=False):
            if entry.unique_id is None and entry.title == name:
                return self.async_update_reload_and_abort(
                    entry,
                    unique_id=unique_id,
                    data_updates=endpoint,
                    reason="already_configured",
                    reload_even_if_entry_is_unchanged=False,
                )

        self._name = name
        self._service = service
        self.context["title_placeholders"] = {"name": name}
        return await self.async_step_zeroconf_confirm()

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> VAOptionsFlowHandler:
        """Create the options flow."""
        return VAOptionsFlowHandler()


class VAOptionsFlowHandler(OptionsFlow):
    """Handle an options flow for the Wyoming integration."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST]
            port = user_input[CONF_PORT]
            service = await VAWyomingService.create(host, port)
            if service is None or not service.has_services():
                errors["base"] = "cannot_connect"
            else:
                self.hass.config_entries.async_update_entry(
                    self.config_entry,
                    data={
                        **self.config_entry.data,
                        CONF_HOST: host,
                        CONF_PORT: port,
                    },
                )
                return self.async_create_entry(
                    data={
                        **self.config_entry.options,
                        CONF_HA_URL: user_input.get(CONF_HA_URL, ""),
                    }
                )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_HOST,
                    description={
                        "suggested_value": self.config_entry.data[CONF_HOST]
                    },
                ): str,
                vol.Required(
                    CONF_PORT,
                    description={
                        "suggested_value": self.config_entry.data[CONF_PORT]
                    },
                ): vol.All(vol.Coerce(int), vol.Range(min=1, max=65535)),
                vol.Optional(
                    CONF_HA_URL,
                    description={
                        "suggested_value": self.config_entry.options.get(CONF_HA_URL)
                    },
                ): str,
            }
        )
        return self.async_show_form(
            step_id="init", data_schema=schema, errors=errors
        )
