import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  
  build: {
    // Output to Django static files
    outDir: 'home/static/home/dist',
    emptyOutDir: true,
    
    // Disable minification for easier debugging
    minify: false,
    
    // Generate manifest for Django integration
    manifest: true,
    
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'home/static/home/js/main.jsx')
      },
      output: {
        // Consistent naming for Django templates (no hash for easier referencing)
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  
  server: {
    // Dev server settings
    port: 3000,
    strictPort: false,
    cors: true
  },
  
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  }
});

