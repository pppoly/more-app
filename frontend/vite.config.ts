import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isLiff = mode === 'liff';
  return {
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port: 4173,
    },
    build: {
      rollupOptions: {
        input: isLiff
          ? path.resolve(__dirname, 'liff.html')
          : path.resolve(__dirname, 'index.html'),
      },
    },
  };
});
