# HA Dashboard

Interactive 3D floor dashboard for Home Assistant with in-app object binding.

## What End Users Do (No IDE Required)

1. Install the integration from HACS.
2. Open integration options and set GLB paths for each floor.
3. Open the auto-created `HA Dashboard` sidebar item.
4. Click model objects and bind each object to Home Assistant entities.
5. Bindings are saved in Home Assistant storage automatically.

## Home Assistant User Setup

### 1) Install integration

Integration folder: `custom_components/ha_dashboard_persistence`

HACS install:
1. Home Assistant -> HACS -> Integrations -> three-dot menu -> Custom repositories.
2. Add this repository URL.
3. Category: `Integration`.
4. Install `HA Dashboard Persistence`.
5. Restart Home Assistant.

Manual install:
1. Copy `custom_components/ha_dashboard_persistence` into your HA config folder.
2. Restart Home Assistant.

### 2) Configure floor models in HA

Open the integration configuration/options and set:
1. Ground floor name and `ground_model_path` (required).
2. First floor name, `first_model_path` and `first_y_offset` (optional).
3. Second floor name, `second_model_path` and `second_y_offset` (optional).

Model paths should be Home Assistant web paths, for example:

`/local/ha-dashboard/models/ground-floor.glb`

`/local/ha-dashboard/models/first-floor.glb`

### 3) Upload GLB files to Home Assistant

Upload your `.glb` files to `www` using Samba, SSH, File Editor, or another HA file workflow.

Example filesystem location:

`<config>/www/ha-dashboard/models/`

This maps to URL paths:

`/local/ha-dashboard/models/...`

### 4) Open dashboard frontend

The integration automatically installs bundled frontend assets into Home Assistant `www` and registers a sidebar panel named `HA Dashboard`.

Open that sidebar item. On startup it calls integration websocket bootstrap and reads floor config + bindings automatically.

### 5) Bind objects to entities

In the frontend popup:
1. Select model part.
2. Pick binding type (light, door, alarm, climate, presence).
3. Pick target HA entity.
4. Save.

Bindings are persisted server-side via the integration.

## Integration API Contract

Domain: `ha_dashboard_persistence`

Stored payload shape:

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
    }
  ]
}
```

Websocket commands:
1. `ha_dashboard_persistence/bootstrap`
2. `ha_dashboard_persistence/load`
3. `ha_dashboard_persistence/save`
4. `ha_dashboard_persistence/clear`

Services:
1. `ha_dashboard_persistence.save`
2. `ha_dashboard_persistence.clear`

Detailed integration docs are in `homeassistant_integration/README.md`.

## Developer Setup

Only needed if you are developing this repository.

### Prerequisites

1. Node.js >= 18
2. npm >= 7
3. NVM recommended: https://github.com/nvm-sh/nvm

### Local development

Run:

`nvm use && npm i && npm run dev`

### Build

Run:

`npm run build`

### Build Release Artifact (Frontend + Integration)

Run:

`npm run build:release`

This builds the frontend and copies `dist` into:

1. `custom_components/ha_dashboard_persistence/panel_dist`
2. `homeassistant_integration/custom_components/ha_dashboard_persistence/panel_dist`

Those bundled assets are what the integration installs into Home Assistant `www` at runtime.

### Deploy to Home Assistant via SSH

1. Set `.env` values for `VITE_SSH_USERNAME`, `VITE_SSH_HOSTNAME`, and `VITE_SSH_PASSWORD`.
2. Run `npm run deploy`.
3. `VITE_FOLDER_NAME` controls deploy folder and Vite base path.

### Type sync (privacy-safe)

1. Set `VITE_HA_URL` and `VITE_HA_TOKEN` in local env files.
2. Run `npm run sync`.
3. Generated personal entity types are written to ignored `supported-types.local.d.ts`.
4. Tracked `supported-types.d.ts` remains sanitized.
