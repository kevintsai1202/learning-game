# 班級伺服器（server/）的映像檔。Zeabur 偵測到根目錄的 Dockerfile 就用它部署（步驟見 docs/deploy-zeabur.md）。
# 前端不在這裡：前端由 GitHub Actions 部署到 GitHub Pages（.github/workflows/deploy.yml）。
#
# 環境變數（Zeabur 後台設定）：DATABASE_URL（必填；沒設會啟動失敗，正式映像沒有 PGlite）、ALLOWED_ORIGINS、GOOGLE_CLIENT_ID。
# GOOGLE_TEST_JWKS／ALLOW_TEST_GOOGLE 只給 e2e 用，正式環境絕不能設。

# ---------- 建置：打包 server/ 與共用的 src/ 純模組成 server-dist/main.js ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run server:build

# ---------- 執行：只裝 dependencies（hono、pg、jose、ws、zod 等），不含開發工具 ----------
FROM node:24-slim
WORKDIR /app
# 每日送禮上限、收禮日期依台灣時間計算
ENV NODE_ENV=production PORT=8080 TZ=Asia/Taipei
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
EXPOSE 8080
# exec 形式：node 是 PID 1，收得到 SIGTERM，main.ts 的 shutdown 才會關好連線與資料庫
CMD ["node", "server-dist/main.js"]
