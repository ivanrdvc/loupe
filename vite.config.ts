import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact(), checker({ typescript: true, enableBuild: false })],
})

export default config
