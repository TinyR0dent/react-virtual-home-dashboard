from __future__ import annotations

from copy import deepcopy
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
import voluptuous as vol

from .const import DEFAULT_PAYLOAD, DOMAIN, STORAGE_KEY, STORAGE_VERSION

SAVE_SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional("version", default=1): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Required("bindings"): list,
    }
)

SAVE_WS_SCHEMA = vol.Schema(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Optional("version", default=1): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Required("bindings"): list,
    }
)

LOAD_WS_SCHEMA = vol.Schema({vol.Required("type"): f"{DOMAIN}/load"})

CLEAR_WS_SCHEMA = vol.Schema({vol.Required("type"): f"{DOMAIN}/clear"})


def _default_payload() -> dict[str, Any]:
    return deepcopy(DEFAULT_PAYLOAD)


async def _async_get_store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    return hass.data[DOMAIN]["store"]


async def _async_read_payload(hass: HomeAssistant) -> dict[str, Any]:
    store = await _async_get_store(hass)
    payload = await store.async_load()
    if not isinstance(payload, dict):
        return _default_payload()

    bindings = payload.get("bindings")
    version = payload.get("version")
    if not isinstance(bindings, list) or not isinstance(version, int):
        return _default_payload()

    return payload


async def _async_save_payload(hass: HomeAssistant, payload: dict[str, Any]) -> None:
    store = await _async_get_store(hass)
    await store.async_save(payload)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["store"] = store

    async def async_save_service(call: ServiceCall) -> None:
        payload = {
            "version": int(call.data.get("version", 1)),
            "bindings": list(call.data["bindings"]),
        }
        await _async_save_payload(hass, payload)

    async def async_clear_service(call: ServiceCall) -> None:
        await _async_save_payload(hass, _default_payload())

    @websocket_api.websocket_command(SAVE_WS_SCHEMA)
    @websocket_api.async_response
    async def ws_save(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = {
            "version": int(msg.get("version", 1)),
            "bindings": list(msg["bindings"]),
        }
        await _async_save_payload(hass, payload)
        connection.send_result(msg["id"], payload)

    @websocket_api.websocket_command(LOAD_WS_SCHEMA)
    @websocket_api.async_response
    async def ws_load(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = await _async_read_payload(hass)
        connection.send_result(msg["id"], payload)

    @websocket_api.websocket_command(CLEAR_WS_SCHEMA)
    @websocket_api.async_response
    async def ws_clear(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = _default_payload()
        await _async_save_payload(hass, payload)
        connection.send_result(msg["id"], payload)

    hass.services.async_register(DOMAIN, "save", async_save_service, schema=SAVE_SERVICE_SCHEMA)
    hass.services.async_register(DOMAIN, "clear", async_clear_service)

    websocket_api.async_register_command(hass, ws_save)
    websocket_api.async_register_command(hass, ws_load)
    websocket_api.async_register_command(hass, ws_clear)

    return True
