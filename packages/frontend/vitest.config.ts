import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Dedupe React across the workspace to avoid two copies (would crash hooks).
    // Resolution itself is left to Node/Vite — npm hoists react to the root
    // node_modules in this workspace, so hardcoded aliases would break.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    server: {
      deps: {
        inline: [/@testing-library\//],
      },
    },
  },
});
