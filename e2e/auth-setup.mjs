import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_DIR = join(ROOT, 'e2e', '.auth');
const STATE_PATH = join(AUTH_DIR, 'session.json');

if (existsSync(STATE_PATH)) {
  console.log('[e2e:auth] session already exists at', STATE_PATH);
  process.exit(0);
}

mkdirSync(AUTH_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log(`[e2e:auth] Opening ${BASE_URL}/login — log in manually in the window (email + password).`);

await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

try {
  await page.waitForURL((u) => u.pathname.startsWith('/dashboard'), { timeout: 300_000 });
  console.log('[e2e:auth] Reached /dashboard — logged in.');
} catch {
  console.error('[e2e:auth] Login not completed within 5 minutes. Session NOT saved.');
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(1500);
await context.storageState({ path: STATE_PATH });
console.log('[e2e:auth] Session saved to', STATE_PATH);
await browser.close();