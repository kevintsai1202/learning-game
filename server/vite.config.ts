import { defineConfig } from 'vite';

// 伺服器打包：vite build --ssr，把 server/ 與共用的 src/ 純模組打成一個 Node ESM 檔（server-dist/main.js）。
// node_modules 的套件（hono、pg、zod、PGlite）不打包，執行時從 node_modules 載入。
// publicDir 要關掉，否則會把 public/ 的音檔與筆順資料一起複製過去。
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/main.ts',
    outDir: 'server-dist',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
  },
});
