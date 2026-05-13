import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'public',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'main.tsx'),
      formats: ['cjs'],
      fileName: () => 'main.js',
      name: 'MurmurPlugin',
    },
    rollupOptions: {
      external: ['obsidian'],
      output: {
        exports: 'named',
      },
    },
  },
});