import { typeSync } from '@hakit/core/sync';
import { config } from 'dotenv';
import { readFile, writeFile } from 'fs/promises';
// First, load the base .env file
config({ path: '.env' });
// Then load the .env.development file which should have the token
config({ path: '.env.development' });

const SAFE_TYPES_STUB = `// Safe tracked stub. Local generated types are stored in supported-types.local.d.ts\n\nimport '@hakit/core';\n\ndeclare module '@hakit/core' {\n  export interface CustomEntityNameContainer {\n    names: \`\${string}.\${string}\`;\n  }\n}\n\nexport {};\n`;

(async function () {
  await typeSync({
    url: process.env.VITE_HA_URL!,
    token: process.env.VITE_HA_TOKEN!,
  });

  // Move generated, potentially sensitive HA-specific data into a local ignored file.
  const generated = await readFile('supported-types.d.ts', 'utf8');
  await writeFile('supported-types.local.d.ts', generated, 'utf8');
  await writeFile('supported-types.d.ts', SAFE_TYPES_STUB, 'utf8');
})();
