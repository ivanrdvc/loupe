import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
})
