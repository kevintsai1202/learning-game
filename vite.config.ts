import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 用相對路徑：同一份建置可以放在任何靜態主機的子路徑、本機 preview，或直接部署到 Zeabur / GitHub Pages
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // three 本身約 900 KB（gzip 約 250 KB），是 3D 遊戲的必要成本
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        // three 與 React 分開打包，改版時瀏覽器快取比較不會整包失效
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|@react-three)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
