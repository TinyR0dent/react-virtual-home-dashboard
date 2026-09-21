from __future__ import annotations

from typing import Any

from homeassistant import config_entries
import voluptuous as vol

from .const import (
    DOMAIN,
    FLOOR_CONFIG_SLOTS,
)

def _defaults() -> dict[str, Any]:
    values: dict[str, Any] = {}
    for slot in FLOOR_CONFIG_SLOTS:
        values[slot["name_key"]] = slot["default_name"]
        values[slot["model_key"]] = slot["default_model_path"]
        if slot["offset_key"] is not None:
            values[slot["offset_key"]] = float(slot["default_offset"])
    return values


DEFAULTS: dict[str, Any] = _defaults()


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    schema_fields: dict[Any, Any] = {}

    for slot in FLOOR_CONFIG_SLOTS:
        name_key = slot["name_key"]
        model_key = slot["model_key"]
        offset_key = slot["offset_key"]

        schema_fields[vol.Required(name_key, default=defaults[name_key])] = str
        model_field = vol.Required if slot["required_model"] else vol.Optional
        schema_fields[model_field(model_key, default=defaults[model_key])] = str

        if offset_key is not None:
            schema_fields[vol.Required(offset_key, default=float(defaults[offset_key]))] = vol.Coerce(float)

    return vol.Schema(schema_fields)


def _clean_model_paths(user_input: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(user_input)
    for slot in FLOOR_CONFIG_SLOTS:
        model_key = slot["model_key"]
        cleaned[model_key] = str(cleaned.get(model_key, "")).strip()
    return cleaned


class DashboardPersistenceConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            cleaned = _clean_model_paths(user_input)
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
            cleaned = _clean_model_paths(user_input)
            return self.async_create_entry(title="", data=cleaned)

        defaults = dict(DEFAULTS)
        defaults.update(self._config_entry.data)
        defaults.update(self._config_entry.options)
        return self.async_show_form(step_id="init", data_schema=_schema(defaults))
