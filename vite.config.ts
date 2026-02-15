import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Enable HMR for better dev experience
    hmr: true,
    // Disable strict port to allow fallback
    strictPort: false,
  },
  preview: {
    port: 4173,
    // Handle client-side routing for BrowserRouter
    historyApiFallback: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'atproto-vendor': ['@atproto/api'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@atproto/api'],
  },
});
