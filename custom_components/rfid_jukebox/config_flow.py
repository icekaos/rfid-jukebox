"""Config flow per RFID Jukebox."""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_DEFAULT_MEDIA_PLAYER, DOMAIN


def _media_player_schema(default=None) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_DEFAULT_MEDIA_PLAYER, default=default
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="media_player")
            )
        }
    )


class RfidJukeboxConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title="RFID Jukebox", data={}, options=user_input
            )

        return self.async_show_form(
            step_id="user", data_schema=_media_player_schema()
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return RfidJukeboxOptionsFlow()


class RfidJukeboxOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input: dict | None = None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current = self.config_entry.options.get(CONF_DEFAULT_MEDIA_PLAYER)
        return self.async_show_form(
            step_id="init", data_schema=_media_player_schema(default=current)
        )
