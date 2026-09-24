import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const AUTH_DIR = join(ROOT, 'e2e', '.auth');
const STATE_PATH = join(AUTH_DIR, 'session.json');
const USER_STATE = join(AUTH_DIR, 'test-user.json');

const TEST_EMAIL = 'e2e-smoke@wacrm.local';
const ACCOUNT_ID = '6932b983-2893-45ca-976d-714a1a428937'; // Manoj lama
const LEN = 24;

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

export default async function globalSetup(config: FullConfig) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('.env.local is missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  mkdirSync(AUTH_DIR, { recursive: true });

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const password = Array.from({ length: LEN }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + 'Aa1!';

  let userId: string;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (list?.users ?? []).find((u) => u.email === TEST_EMAIL);
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Smoke' },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    userId = data.user.id;
  }

  // Point the bootstrap profile at Manoj's account as an agent. The
  // `handle_new_user` trigger first creates a personal account + profile;
  // we rehome the profile and then drop the orphan personal account.
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .update({ account_id: ACCOUNT_ID, account_role: 'agent', full_name: 'E2E Smoke' })
    .eq('user_id', userId)
    .select('id');
  if (profErr) throw new Error(`profile update failed: ${profErr.message}`);
  if (!prof || prof.length === 0) {
    const { error: insErr } = await admin.from('profiles').insert({
      user_id: userId,
      full_name: 'E2E Smoke',
      email: TEST_EMAIL,
      account_id: ACCOUNT_ID,
      account_role: 'agent',
    });
    if (insErr) throw new Error(`profile insert failed: ${insErr.message}`);
  }
  await admin.from('accounts').delete().eq('owner_user_id', userId);

  writeFileSync(USER_STATE, JSON.stringify({ id: userId, email: TEST_EMAIL, password }, null, 2));

  // Log in through the real UI so cookie storage matches the app exactly.
  const baseURL = (config.projects[0].use.baseURL as string) ?? 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => u.pathname.startsWith('/dashboard'), { timeout: 60_000 });
  } catch (e) {
    throw new Error(`Login did not reach /dashboard. body=${await page.textContent('body')}`);
  }
  await page.waitForTimeout(1500);
  await context.storageState({ path: STATE_PATH });
  await browser.close();
  console.log(`[e2e:setup] session saved for ${TEST_EMAIL}`);
}