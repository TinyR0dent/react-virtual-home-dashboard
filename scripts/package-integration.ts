import { cp, mkdir, rm, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(currentFile, '..', '..');
const distDir = resolve(repoRoot, 'dist');

const targets = [
  resolve(repoRoot, 'custom_components', 'ha_dashboard_persistence', 'panel_dist'),
  resolve(repoRoot, 'homeassistant_integration', 'custom_components', 'ha_dashboard_persistence', 'panel_dist'),
];

async function assertDistExists() {
  try {
    await access(distDir, constants.F_OK);
  } catch {
    throw new Error('Missing dist directory. Run npm run build before packaging integration assets.');
  }
}

async function copyDistToTarget(target: string) {
  await mkdir(target, { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(distDir, target, { recursive: true });
  console.log(`Copied dist -> ${target}`);
}

async function main() {
  await assertDistExists();
  await Promise.all(targets.map(copyDistToTarget));
  console.log('Integration frontend assets packaged successfully.');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
