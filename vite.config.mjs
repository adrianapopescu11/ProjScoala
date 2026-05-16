import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/test.js'),
      output: {
        entryFileNames: 'test.js',
        format: 'iife',
        name: '_EduFlowTest',
      },
    },
    minify: true,
  },
});
