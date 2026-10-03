# 班級伺服器（server/）的映像檔，同時提供前端（dist/）：GitHub Pages 被學校網路擋住時，改用伺服器的網址也能玩。
# Zeabur 偵測到根目錄的 Dockerfile 就用它部署（步驟見 docs/deploy-zeabur.md）。GitHub Pages 那一份由 .github/workflows/deploy.yml 建置。
#
# 環境變數（Zeabur 後台設定）：DATABASE_URL（必填；沒設會啟動失敗，正式映像沒有 PGlite）、ALLOWED_ORIGINS、GOOGLE_CLIENT_ID。
# GOOGLE_TEST_JWKS／ALLOW_TEST_GOOGLE 只給 e2e 用，正式環境絕不能設。

# ---------- 建置：伺服器（server-dist/main.js）與前端（dist/） ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 前端用 same-origin：伺服器網址就是目前網頁的網址，換網域不必重新建置。
# 用 npx vite build 而不是 npm run build：後者先跑 tsc，tsc 會檢查沒有上傳的 tests/
RUN npm run server:build && VITE_SERVER_URL=same-origin npx vite build

# ---------- 執行：只裝 dependencies（hono、pg、jose、ws、zod 等），不含開發工具 ----------
FROM node:24-slim
# Zeabur 後台顯示用的標籤
LABEL "language"="nodejs"
LABEL "framework"="hono"
WORKDIR /app
# 每日送禮上限、收禮日期依台灣時間計算
ENV NODE_ENV=production PORT=8080 TZ=Asia/Taipei STATIC_DIR=/app/dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
COPY --from=build /app/dist ./dist
EXPOSE 8080
# exec 形式：node 是 PID 1，收得到 SIGTERM，main.ts 的 shutdown 才會關好連線與資料庫
CMD ["node", "server-dist/main.js"]
