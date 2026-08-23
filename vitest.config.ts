import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default — most of this codebase is geometry and data with no DOM.
    // Component tests opt in with a `@vitest-environment jsdom` docblock.
    environment: 'node',
  },
})
