import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const buildTime = new Date().toISOString();
  return {
    plugins: [vue()],
    resolve: {
      // Prefer TS sources when both .ts and emitted .js exist next to each other.
      extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    server: {
      host: '127.0.0.1',
      port: 4173,
    },
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
  };
});
