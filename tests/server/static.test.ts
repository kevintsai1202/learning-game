/**
 * 班級伺服器同時提供前端（STATIC_DIR）：靜態檔、快取標頭、不影響 API 路由、擋路徑穿越；沒設定時行為不變。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeClient, openTestDb } from './helpers';
import { cacheControlOf } from '../../server/static';
import type { Db } from '../../server/db';

let db: Db;
/** 測試用的建置產物（檔案結構和真正的 dist/ 相同） */
let dist: string;

beforeAll(async () => {
  db = await openTestDb();
  dist = mkdtempSync(path.join(tmpdir(), 'li-static-'));
  const files: Record<string, string> = {
    'index.html': '<!doctype html><title>知識島大冒險</title>',
    'privacy.html': '<!doctype html><title>隱私權政策</title>',
    'assets/index-CZX5ndkw.js': 'console.log(1)',
    'assets/lg-bopomofo-round-DQIZsV5j.woff2': 'font',
    'audio/voice/manifest.json': '{}',
    'audio/voice/000122dc8201d1ab.mp3': 'mp3',
    'audio/music/island.mp3': 'mp3',
    'data/strokes/一.json': '{}',
  };
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dist, name)), { recursive: true });
    writeFileSync(path.join(dist, name), body);
  }
});
afterAll(async () => {
  await db.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('快取規則', () => {
  it('網頁與語音對照表不快取；帶雜湊的程式與語音快取一年；其他一天（Windows 路徑也一樣）', () => {
    const immutable = 'public, max-age=31536000, immutable';
    const day = 'public, max-age=86400';
    expect(cacheControlOf('/app/dist/index.html')).toBe('no-cache');
    expect(cacheControlOf('C:\\app\\dist\\privacy.html')).toBe('no-cache');
    expect(cacheControlOf('/app/dist/audio/voice/manifest.json')).toBe('no-cache');
    expect(cacheControlOf('/app/dist/assets/index-CZX5ndkw.js')).toBe(immutable);
    expect(cacheControlOf('D:\\x\\dist\\assets\\lg-bopomofo-round-DQIZsV5j.woff2')).toBe(immutable);
    expect(cacheControlOf('/app/dist/audio/voice/000122dc8201d1ab.mp3')).toBe(immutable);
    expect(cacheControlOf('/app/dist/audio/music/island.mp3')).toBe(day);
    expect(cacheControlOf('/app/dist/data/strokes/一.json')).toBe(day);
    expect(cacheControlOf('/app/dist/licenses/hanzi-writer.txt')).toBe(day);
  });
});

describe('提供前端', () => {
  it('首頁、程式、音檔都拿得到，快取標頭正確', async () => {
    const { app } = makeClient(db, { staticDir: dist });
    const home = await app.request('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('知識島大冒險');
    expect(home.headers.get('cache-control')).toBe('no-cache');
    const js = await app.request('/assets/index-CZX5ndkw.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toContain('immutable');
    const mp3 = await app.request('/audio/voice/000122dc8201d1ab.mp3');
    expect(mp3.status).toBe(200);
    expect(mp3.headers.get('content-type')).toContain('audio/mpeg');
    expect((await app.request('/privacy.html')).headers.get('cache-control')).toBe('no-cache');
  });

  it('API 路由不受影響；找不到的檔案 404；路徑穿越擋下', async () => {
    const { app, call } = makeClient(db, { staticDir: dist });
    const config = await call('GET', '/api/config');
    expect(config.status).toBe(200);
    expect(config.body).toEqual({ googleClientId: null });
    expect((await call('GET', '/healthz')).body).toEqual({ ok: true });
    expect((await app.request('/missing.txt')).status).toBe(404);
    expect((await app.request('/api/nothing-here')).status).toBe(404);
    expect((await app.request('/../package.json')).status).toBe(404);
    expect((await app.request('/assets/..%2F..%2Fpackage.json')).status).toBe(404);
  });

  it('沒設定 staticDir：首頁 404（本機開發與 e2e 的伺服器行為不變）', async () => {
    const { app } = makeClient(db);
    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/index.html')).status).toBe(404);
  });
});
