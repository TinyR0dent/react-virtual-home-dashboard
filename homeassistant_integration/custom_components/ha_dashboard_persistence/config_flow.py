from __future__ import annotations

from typing import Any

from homeassistant import config_entries
import voluptuous as vol

from .const import (
    CONF_FIRST_MODEL_PATH,
    CONF_FIRST_NAME,
    CONF_FIRST_Y_OFFSET,
    CONF_GROUND_MODEL_PATH,
    CONF_GROUND_NAME,
    CONF_SECOND_MODEL_PATH,
    CONF_SECOND_NAME,
    CONF_SECOND_Y_OFFSET,
    DOMAIN,
)

DEFAULTS: dict[str, Any] = {
    CONF_GROUND_NAME: "Ground Floor",
    CONF_GROUND_MODEL_PATH: "/local/ha-dashboard/models/ground-floor.glb",
    CONF_FIRST_NAME: "First Floor",
    CONF_FIRST_MODEL_PATH: "/local/ha-dashboard/models/first-floor.glb",
    CONF_FIRST_Y_OFFSET: 2.4,
    CONF_SECOND_NAME: "Second Floor",
    CONF_SECOND_MODEL_PATH: "",
    CONF_SECOND_Y_OFFSET: 4.8,
}


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_GROUND_NAME, default=defaults[CONF_GROUND_NAME]): str,
            vol.Required(CONF_GROUND_MODEL_PATH, default=defaults[CONF_GROUND_MODEL_PATH]): str,
            vol.Required(CONF_FIRST_NAME, default=defaults[CONF_FIRST_NAME]): str,
            vol.Optional(CONF_FIRST_MODEL_PATH, default=defaults[CONF_FIRST_MODEL_PATH]): str,
            vol.Required(CONF_FIRST_Y_OFFSET, default=float(defaults[CONF_FIRST_Y_OFFSET])): vol.Coerce(float),
            vol.Required(CONF_SECOND_NAME, default=defaults[CONF_SECOND_NAME]): str,
            vol.Optional(CONF_SECOND_MODEL_PATH, default=defaults[CONF_SECOND_MODEL_PATH]): str,
            vol.Required(CONF_SECOND_Y_OFFSET, default=float(defaults[CONF_SECOND_Y_OFFSET])): vol.Coerce(float),
        }
    )


class DashboardPersistenceConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            cleaned = dict(user_input)
            cleaned[CONF_GROUND_MODEL_PATH] = str(cleaned[CONF_GROUND_MODEL_PATH]).strip()
            cleaned[CONF_FIRST_MODEL_PATH] = str(cleaned.get(CONF_FIRST_MODEL_PATH, "")).strip()
            cleaned[CONF_SECOND_MODEL_PATH] = str(cleaned.get(CONF_SECOND_MODEL_PATH, "")).strip()
            return self.async_create_entry(title="HA Dashboard Persistence", data=cleaned)

        return self.async_show_form(step_id="user", data_schema=_schema(DEFAULTS))

    @staticmethod
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return DashboardPersistenceOptionsFlow(config_entry)


class DashboardPersistenceOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            cleaned = dict(user_input)
            cleaned[CONF_GROUND_MODEL_PATH] = str(cleaned[CONF_GROUND_MODEL_PATH]).strip()
            cleaned[CONF_FIRST_MODEL_PATH] = str(cleaned.get(CONF_FIRST_MODEL_PATH, "")).strip()
            cleaned[CONF_SECOND_MODEL_PATH] = str(cleaned.get(CONF_SECOND_MODEL_PATH, "")).strip()
            return self.async_create_entry(title="", data=cleaned)

        defaults = dict(DEFAULTS)
        defaults.update(self._config_entry.data)
        defaults.update(self._config_entry.options)
        return self.async_show_form(step_id="init", data_schema=_schema(defaults))
