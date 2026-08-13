# Home Assistant Integration: Dashboard Persistence

This folder contains a lightweight Home Assistant custom integration used by this dashboard to persist binding configuration server-side.

## Domain

`ha_dashboard_persistence`

## What It Stores

A JSON payload in Home Assistant storage:

```json
{
  "version": 1,
  "bindings": []
}
```

Storage key: `ha_dashboard_persistence.config`

## Install (Manual)

1. Copy `custom_components/ha_dashboard_persistence` into your Home Assistant config at:
   - `<config>/custom_components/ha_dashboard_persistence`
2. Restart Home Assistant.
3. Confirm the integration is loaded (check logs for import/setup errors).

## Services

### `ha_dashboard_persistence.save`

Fields:
- `version` (optional, default `1`)
- `bindings` (required list)

### `ha_dashboard_persistence.clear`

Resets payload to default empty bindings.

## WebSocket Commands

These commands are intended for the frontend app.

### Load

```json
{ "id": 1, "type": "ha_dashboard_persistence/load" }
```

### Save

```json
{
  "id": 2,
  "type": "ha_dashboard_persistence/save",
  "version": 1,
  "bindings": []
}
```

### Clear

```json
{ "id": 3, "type": "ha_dashboard_persistence/clear" }
```

## Notes

- The browser app should treat Home Assistant as source of truth.
- Local storage can remain a short-term fallback/cache.
- Add schema migration when `version` changes.
