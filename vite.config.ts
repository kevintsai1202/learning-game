import { execFileSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 這次建置的版本號（更新通知，docs/plans/update-notice.md）：GitHub Pages 的建置有 GITHUB_SHA；
 * 本機用 git 的提交編號；Zeabur 的建置環境沒有 .git（.dockerignore），用建置時間
 */
function buildId(): string {
  let sha = process.env.GITHUB_SHA ?? '';
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = '';
    }
  }
  return sha ? sha.slice(0, 12) : `t${Date.now()}`;
}
const BUILD_ID = buildId();

/** 建置時輸出 version.json（網頁定時讀它，和自己的版本號不一樣就提示更新） */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, builtAt: new Date().toISOString() }) });
    },
  };
}

// base 用相對路徑：同一份建置可以放在任何靜態主機的子路徑、本機 preview，或直接部署到 Zeabur / GitHub Pages
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), versionFile()],
  // 網頁裡的版本號（開發模式是空的：不檢查更新）
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : '') },
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
}));
