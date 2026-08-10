import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri sets these when running `tauri android dev` / `tauri ios dev`.
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    strictPort: true,
    // A physical phone/emulator cannot reach 127.0.0.1 on the dev machine, so
    // bind to the LAN address Tauri hands us during mobile dev.
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 3001,
        }
      : undefined,
  },
})
