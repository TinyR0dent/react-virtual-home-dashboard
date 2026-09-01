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
    DEFAULT_PAYLOAD,
    DOMAIN,
    FLOOR_CONFIG_SLOTS,
    MAX_FLOORS,
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
    vol.Optional("global_config"): dict,
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


def _panel_iframe_url(hass: HomeAssistant) -> str:
    index_path = _panel_target_dir(hass) / "index.html"
    try:
        token = int(index_path.stat().st_mtime_ns)
        return f"/local/{PANEL_TARGET_FOLDER}/index.html?v={token}"
    except OSError:
        return f"/local/{PANEL_TARGET_FOLDER}/index.html"


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


from homeassistant.components import frontend


def _register_sidebar_panel_once(hass: HomeAssistant) -> None:
    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "url": _panel_iframe_url(hass),
            "require_admin": False,
        },
        require_admin=False,
    )


async def _register_sidebar_panel(hass: HomeAssistant) -> None:
    try:
        frontend.async_remove_panel(PANEL_URL_PATH)
    except Exception:
        pass

    try:
        _register_sidebar_panel_once(hass)
    except ValueError as err:
        if f"Overwriting panel {PANEL_URL_PATH}" not in str(err):
            raise

        # During reloads Home Assistant can still retain the existing panel.
        _LOGGER.warning("Panel %s already registered, retrying registration", PANEL_URL_PATH)
        try:
            frontend.async_remove_panel(PANEL_URL_PATH)
        except Exception:
            pass
        _register_sidebar_panel_once(hass)


def _unregister_sidebar_panel(hass: HomeAssistant) -> None:
    try:
        frontend.async_remove_panel(PANEL_URL_PATH)
    except Exception:
        pass

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
    return floors[:MAX_FLOORS]


def _entry_floors(hass: HomeAssistant) -> list[dict[str, Any]]:
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return []

    entry = entries[0]
    source = dict(entry.data)
    source.update(entry.options)

    floors: list[dict[str, Any]] = []

    for slot in FLOOR_CONFIG_SLOTS:
        model_path = str(source.get(slot["model_key"], "")).strip()
        if not model_path:
            continue

        floor_id = slot["id"]
        floor_name = str(source.get(slot["name_key"], slot["default_name"])).strip() or slot["default_name"]
        offset_key = slot["offset_key"]
        default_offset = float(slot["default_offset"])
        y_offset = default_offset if offset_key is None else _safe_float(source.get(offset_key, default_offset), default_offset)

        floors.append(
            {
                "id": floor_id,
                "name": floor_name,
                "model_path": model_path,
                "y_offset": y_offset,
            }
        )

    return floors[:MAX_FLOORS]


def _resolve_payload_floors(hass: HomeAssistant, payload: dict[str, Any]) -> list[dict[str, Any]]:
    configured = _entry_floors(hass)
    if configured:
        return configured

    stored = _sanitize_floors(payload.get("floors"))
    if stored:
        return stored

    return deepcopy(DEFAULT_PAYLOAD["floors"])[:MAX_FLOORS]


def _sanitize_global_config(raw_global_config: Any) -> dict[str, Any]:
    default_config = deepcopy(
        DEFAULT_PAYLOAD.get(
            "global_config",
            {
                "ambient_level": 45,
                "default_floor_index": 0,
                "default_camera_position": None,
                "room_popup_entities": {},
                "room_popup_appearance": {},
            },
        )
    )
    if not isinstance(default_config, dict):
        default_config = {
            "ambient_level": 45,
            "default_floor_index": 0,
            "default_camera_position": None,
            "room_popup_entities": {},
            "room_popup_appearance": {},
        }

    if not isinstance(raw_global_config, dict):
        return default_config

    ambient = _safe_float(raw_global_config.get("ambient_level", default_config.get("ambient_level", 45)), 45.0)
    default_floor_index = int(_safe_float(raw_global_config.get("default_floor_index", default_config.get("default_floor_index", 0)), 0.0))
    camera_position = raw_global_config.get("default_camera_position", default_config.get("default_camera_position"))
    valid_camera_position = (
        isinstance(camera_position, list)
        and len(camera_position) == 3
        and all(isinstance(value, (int, float)) for value in camera_position)
    )
    default_config["ambient_level"] = int(max(0, min(100, round(ambient))))
    default_config["default_floor_index"] = int(max(0, min(MAX_FLOORS - 1, default_floor_index)))
    default_config["default_camera_position"] = (
        [float(camera_position[0]), float(camera_position[1]), float(camera_position[2])] if valid_camera_position else None
    )

    room_popup_entities = raw_global_config.get("room_popup_entities", default_config.get("room_popup_entities", {}))
    sanitized_room_popup_entities: dict[str, list[str]] = {}
    if isinstance(room_popup_entities, dict):
        for area_id, entity_ids in room_popup_entities.items():
            if not isinstance(entity_ids, list):
                continue
            cleaned = [str(entity_id).strip() for entity_id in entity_ids if str(entity_id).strip()]
            unique_cleaned = list(dict.fromkeys(cleaned))
            if unique_cleaned:
                sanitized_room_popup_entities[str(area_id)] = unique_cleaned

    default_config["room_popup_entities"] = sanitized_room_popup_entities

    allowed_icon_keys = {"home", "bedroom", "kitchen", "office", "bathroom", "lounge"}
    allowed_colors = {"#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"}
    room_popup_appearance = raw_global_config.get("room_popup_appearance", default_config.get("room_popup_appearance", {}))
    sanitized_room_popup_appearance: dict[str, dict[str, str]] = {}
    if isinstance(room_popup_appearance, dict):
        for area_id, appearance in room_popup_appearance.items():
            if not isinstance(appearance, dict):
                continue

            display_name = str(appearance.get("display_name", appearance.get("displayName", ""))).strip()[:40]
            icon_key = str(appearance.get("icon_key", appearance.get("iconKey", ""))).strip().lower()
            color = str(appearance.get("color", "")).strip().upper()

            next_appearance: dict[str, str] = {}
            if display_name:
                next_appearance["display_name"] = display_name
            if icon_key in allowed_icon_keys:
                next_appearance["icon_key"] = icon_key
            if color in allowed_colors:
                next_appearance["color"] = color

            if next_appearance:
                sanitized_room_popup_appearance[str(area_id)] = next_appearance

    default_config["room_popup_appearance"] = sanitized_room_popup_appearance
    return default_config


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
        "global_config": _sanitize_global_config(payload.get("global_config")),
        "floors": _resolve_payload_floors(hass, payload),
    }


async def _async_save_payload(hass: HomeAssistant, payload: dict[str, Any]) -> None:
    store = await _async_get_store(hass)
    await store.async_save(payload)


async def _async_save_bindings(
    hass: HomeAssistant,
    version: int,
    bindings: list[Any],
    global_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    current = await _async_read_payload(hass)
    payload = {
        "version": int(version),
        "bindings": list(bindings),
        "global_config": _sanitize_global_config(global_config if global_config is not None else current.get("global_config")),
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
            call.data.get("global_config"),
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
            msg.get("global_config"),
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
    await _register_sidebar_panel(hass)

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
    await _register_sidebar_panel(hass)
