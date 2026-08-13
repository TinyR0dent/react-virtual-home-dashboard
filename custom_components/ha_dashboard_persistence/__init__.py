from __future__ import annotations

from copy import deepcopy
import logging
from pathlib import Path
import shutil
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
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
    DEFAULT_PAYLOAD,
    DOMAIN,
    PANEL_DIST_DIRNAME,
    PANEL_ICON,
    PANEL_TARGET_FOLDER,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

SAVE_WS_SCHEMA = {
    "type": f"{DOMAIN}/save",
    "version": int,
    "bindings": list,
}

LOAD_WS_SCHEMA = {
    "type": f"{DOMAIN}/load",
}

CLEAR_WS_SCHEMA = {
    "type": f"{DOMAIN}/clear",
}

BOOTSTRAP_WS_SCHEMA = {
    "type": f"{DOMAIN}/bootstrap",
}



def _default_payload() -> dict[str, Any]:
    return deepcopy(DEFAULT_PAYLOAD)


def _panel_source_dir() -> Path:
    return Path(__file__).resolve().parent / PANEL_DIST_DIRNAME


def _panel_target_dir(hass: HomeAssistant) -> Path:
    return Path(hass.config.path("www")) / PANEL_TARGET_FOLDER


async def _async_install_panel_assets(hass: HomeAssistant) -> None:
    source_dir = _panel_source_dir()
    if not source_dir.exists():
        _LOGGER.warning("Panel assets folder missing: %s", source_dir)
        return

    target_dir = _panel_target_dir(hass)

    def _copy() -> None:
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(source_dir, target_dir)

    await hass.async_add_executor_job(_copy)


from homeassistant.components.panel_custom import async_register_panel

async def _register_sidebar_panel(hass: HomeAssistant) -> None:
    async_register_panel(
        hass,
        webcomponent_name="ha-dashboard-persistence",
        frontend_url_path="ha-dashboard-persistence",
        module_url="/local/ha_dashboard_persistence/main.js",
        sidebar_title="Dashboard Persistence",
        sidebar_icon="mdi:database",
    )

def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _sanitize_floor_item(raw: Any, default_id: str) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    model_path = str(raw.get("model_path", "")).strip()
    if not model_path:
        return None

    floor_id = str(raw.get("id", default_id)).strip() or default_id
    floor_name = str(raw.get("name", floor_id.title())).strip() or floor_id.title()
    y_offset = _safe_float(raw.get("y_offset", 0.0), 0.0)

    return {
        "id": floor_id,
        "name": floor_name,
        "model_path": model_path,
        "y_offset": y_offset,
    }


def _sanitize_floors(raw_floors: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_floors, list):
        return []

    floors: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_floors):
        floor = _sanitize_floor_item(item, f"floor_{idx}")
        if floor is not None:
            floors.append(floor)
    return floors


def _entry_floors(hass: HomeAssistant) -> list[dict[str, Any]]:
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return []

    entry = entries[0]
    source = dict(entry.data)
    source.update(entry.options)

    floors: list[dict[str, Any]] = []

    ground_model = str(source.get(CONF_GROUND_MODEL_PATH, "")).strip()
    if ground_model:
        floors.append(
            {
                "id": "ground",
                "name": str(source.get(CONF_GROUND_NAME, "Ground Floor")).strip() or "Ground Floor",
                "model_path": ground_model,
                "y_offset": 0.0,
            }
        )

    first_model = str(source.get(CONF_FIRST_MODEL_PATH, "")).strip()
    if first_model:
        floors.append(
            {
                "id": "first",
                "name": str(source.get(CONF_FIRST_NAME, "First Floor")).strip() or "First Floor",
                "model_path": first_model,
                "y_offset": _safe_float(source.get(CONF_FIRST_Y_OFFSET, 2.4), 2.4),
            }
        )

    second_model = str(source.get(CONF_SECOND_MODEL_PATH, "")).strip()
    if second_model:
        floors.append(
            {
                "id": "second",
                "name": str(source.get(CONF_SECOND_NAME, "Second Floor")).strip() or "Second Floor",
                "model_path": second_model,
                "y_offset": _safe_float(source.get(CONF_SECOND_Y_OFFSET, 4.8), 4.8),
                "optional": True,
            }
        )

    return floors


def _resolve_payload_floors(hass: HomeAssistant, payload: dict[str, Any]) -> list[dict[str, Any]]:
    configured = _entry_floors(hass)
    if configured:
        return configured

    stored = _sanitize_floors(payload.get("floors"))
    if stored:
        return stored

    return deepcopy(DEFAULT_PAYLOAD["floors"])


async def _async_get_store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    return hass.data[DOMAIN]["store"]


async def _async_read_payload(hass: HomeAssistant) -> dict[str, Any]:
    store = await _async_get_store(hass)
    payload = await store.async_load()
    if not isinstance(payload, dict):
        payload = _default_payload()

    bindings = payload.get("bindings")
    version = payload.get("version")
    if not isinstance(bindings, list):
        bindings = []
    if not isinstance(version, int):
        version = 1

    return {
        "version": version,
        "bindings": bindings,
        "floors": _resolve_payload_floors(hass, payload),
    }


async def _async_save_payload(hass: HomeAssistant, payload: dict[str, Any]) -> None:
    store = await _async_get_store(hass)
    await store.async_save(payload)


async def _async_save_bindings(hass: HomeAssistant, version: int, bindings: list[Any]) -> dict[str, Any]:
    current = await _async_read_payload(hass)
    payload = {
        "version": int(version),
        "bindings": list(bindings),
        "floors": _resolve_payload_floors(hass, current),
    }
    await _async_save_payload(hass, payload)
    return payload


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["store"] = store

    async def async_save_service(call: ServiceCall) -> None:
        await _async_save_bindings(
            hass,
            int(call.data.get("version", 1)),
            list(call.data["bindings"]),
        )

    async def async_clear_service(call: ServiceCall) -> None:
        payload = await _async_read_payload(hass)
        payload["bindings"] = []
        payload["version"] = 1
        await _async_save_payload(hass, payload)

    @websocket_api.websocket_command(SAVE_WS_SCHEMA)
    @websocket_api.async_response
    async def ws_save(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = await _async_save_bindings(
            hass,
            int(msg.get("version", 1)),
            list(msg["bindings"]),
        )
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
        payload = await _async_read_payload(hass)
        payload["bindings"] = []
        payload["version"] = 1
        await _async_save_payload(hass, payload)
        connection.send_result(msg["id"], payload)

    @websocket_api.websocket_command(BOOTSTRAP_WS_SCHEMA)
    @websocket_api.async_response
    async def ws_bootstrap(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = await _async_read_payload(hass)
        connection.send_result(msg["id"], payload)

    hass.services.async_register(DOMAIN, "save", async_save_service)
    hass.services.async_register(DOMAIN, "clear", async_clear_service)

    websocket_api.async_register_command(hass, ws_save)
    websocket_api.async_register_command(hass, ws_load)
    websocket_api.async_register_command(hass, ws_clear)
    websocket_api.async_register_command(hass, ws_bootstrap)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("entries", {})
    hass.data[DOMAIN]["entries"][entry.entry_id] = entry
    await _async_install_panel_assets(hass)
    _register_sidebar_panel(hass)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    entries = hass.data.get(DOMAIN, {}).get("entries", {})
    entries.pop(entry.entry_id, None)

    if not entries:
        _unregister_sidebar_panel(hass)

    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await _async_install_panel_assets(hass)
    _register_sidebar_panel(hass)
