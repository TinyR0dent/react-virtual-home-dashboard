## Prerequisites
Node version manager - [NVM](https://github.com/nvm-sh/nvm) to easily install and manage node versions

## Local Development
Simply, run `nvm use && npm i && npm run dev` and it will start a local server for you to develop on, it will also watch for changes and reload the page for you. 

## Dependencies

```json
Node.js >=18.0.0
npm >=7.0.0
```

## Building
Run `npm run build` and it will build the files for you, you can then upload them to your home assistant instance using the deploy script mentioned below.

## Deploy to Home Assistant via SSH
1. Replace the values in the .env file provided with your `VITE_SSH_USERNAME`, `VITE_SSH_HOSTNAME` and `VITE_SSH_PASSWORD`.
2. To automatically deploy to your home assistant instance, you can run `npm run deploy` after you've retrieved the SSH information specified [here](https://shannonhochkins.github.io/ha-component-kit/?path=/docs/introduction-deploying--docs), NOTE! The script has already been created for you, you just need to run it after you've updated the .env values.
3. The `VITE_FOLDER_NAME` is the folder that will be created on your home assistant instance, this is where the files will be uploaded to.

## Folder name & Vite
The `VITE_FOLDER_NAME` is the folder that will be created on your home assistant instance, this is where the files will be uploaded to. If you change the `VITE_FOLDER_NAME` variable, it will also update the `vite.config.ts` value named `base` to the same value so that when deployed using the deployment script the pathname's are correct.

## Typescript Sync

1. Replace the values in the `.env` file provided with your own if the script hasn't handled this for you already
2. The `VITE_HA_URL` should be a https url if you want to sync your types successfully.
3. The `VITE_HA_TOKEN` instructions can be found [here](https://shannonhochkins.github.io/ha-component-kit/?path=/docs/introduction-typescriptsync--docs) under the pre-requisites section.

Once you have both the above environment variables set, you can run `npm run sync` and it will create a file for you, you then just have to add it to the tsconfig.json.

### HA TOKEN
The token by default will only be used by local development and the sync-script, if you wish to have your token bundled with your project you can move the declaration in the `.env.development` file to the `.env` file, then remove the `.env.development` file as well as update the `scripts/sync-types.ts` file to remove the `.env.development` loader.

## Further documentation
For further documentation, please visit the [documentation website](https://shannonhochkins.github.io/ha-component-kit/) for more information.

## Home Assistant Persistence Integration

This repository includes an in-repo custom Home Assistant integration for persisting dashboard bindings:

- Folder (HACS/manual install): `custom_components/ha_dashboard_persistence`
- Domain: `ha_dashboard_persistence`

### Install with HACS (Custom Repository)

1. In Home Assistant, open HACS -> Integrations -> three-dot menu -> Custom repositories.
2. Add this GitHub repository URL.
3. Set category to `Integration`.
4. Search/install `HA Dashboard Persistence` from HACS.
5. Restart Home Assistant.

### Manual install

1. Copy `custom_components/ha_dashboard_persistence` to your HA config at `custom_components/ha_dashboard_persistence`.
2. Restart Home Assistant.
3. Use services or websocket commands provided by the integration to save/load bindings.

For full details, see `homeassistant_integration/README.md`.

### GLB Upload Safety Plan

To reduce frontend upload errors, the safest pattern is:

1. Upload GLB files to Home Assistant using existing HA file mechanisms (Samba/File Editor/SSH add-on).
2. Keep this integration as the source of truth for model metadata (which model path/floor to use), not binary upload transport.
3. Add integration services later to set and validate model paths before the frontend consumes them.

This keeps writes server-side and avoids fragile browser-based file handling for production.



# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
