import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const USER_STATE = join(ROOT, 'e2e', '.auth', 'test-user.json');

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export default async function globalTeardown() {
  if (!existsSync(USER_STATE)) return;
  const { id } = JSON.parse(readFileSync(USER_STATE, 'utf8'));
  const env = loadEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  await admin.from('accounts').delete().eq('owner_user_id', id);
  try {
    await admin.auth.admin.deleteUser(id);
    console.log(`[e2e:teardown] removed test user ${id}`);
  } catch (e) {
    console.warn(`[e2e:teardown] deleteUser failed: ${(e as Error).message}`);
  }
}