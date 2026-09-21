# Home Assistant Integration: HA Dashboard Persistence

This integration stores dashboard bindings and floor model configuration for the 3D dashboard frontend.

It also ships a bundled frontend (`panel_dist`) that is copied into Home Assistant `www` and shown through a sidebar panel.

## Domain

`ha_dashboard_persistence`

## What It Stores

Storage key: `ha_dashboard_persistence.config`

Payload:

```json
{
  "version": 1,
  "bindings": [],
  "floors": [
    {
      "id": "ground",
      "name": "Ground Floor",
      "model_path": "/local/ha-dashboard/models/ground-floor.glb",
      "y_offset": 0
    },
    {
      "id": "first",
      "name": "First Floor",
      "model_path": "/local/ha-dashboard/models/first-floor.glb",
      "y_offset": 2.4
    }
  ]
}
```

## Install (Manual)

1. Copy `custom_components/ha_dashboard_persistence` into Home Assistant config:
   - `<config>/custom_components/ha_dashboard_persistence`
2. Restart Home Assistant.
3. Add integration in Home Assistant UI.

After setup, a sidebar item `HA Dashboard` is registered automatically.

## Configure Floors in Integration Options

The integration options form provides these keys:

1. `ground_name`
2. `ground_model_path`
3. `first_name`
4. `first_model_path`
5. `first_y_offset`
6. `second_name`
7. `second_model_path`
8. `second_y_offset`

Model paths should be HA web paths such as `/local/ha-dashboard/models/ground-floor.glb`.

## Services

### `ha_dashboard_persistence.save`

Fields:
1. `version` (optional, default `1`)
2. `bindings` (required list)

### `ha_dashboard_persistence.clear`

Resets bindings to an empty list and keeps floor config.

## WebSocket Commands

### Bootstrap

```json
{ "id": 1, "type": "ha_dashboard_persistence/bootstrap" }
```

Returns full runtime payload (`version`, `bindings`, `floors`).

## Frontend Panel Hosting

1. Bundled assets source: `custom_components/ha_dashboard_persistence/panel_dist`
2. Runtime install target: `<config>/www/ha-dashboard`
3. Panel URL target: `/local/ha-dashboard/index.html`

The integration refreshes panel assets on setup and options updates.

### Load

```json
{ "id": 2, "type": "ha_dashboard_persistence/load" }
```

### Save

```json
{
  "id": 3,
  "type": "ha_dashboard_persistence/save",
  "version": 1,
  "bindings": []
}
```

### Clear

```json
{ "id": 4, "type": "ha_dashboard_persistence/clear" }
```
