import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import dotenv from 'dotenv';
dotenv.config();

const folderName = process.env.VITE_FOLDER_NAME?.trim() || 'ha-dashboard';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Local dev should serve from root so /public fallback model URLs work out of the box.
  base: command === 'build' ? `/local/${folderName}/` : '/',
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(`${Date.now()}`),
  },
  plugins: [react()],
}));
