import { readFileSync } from "node:fs";
import { beforeAll, it } from "vitest";
import { getCheckoutUrl } from "@/lib/subscriptions/lifecycle";
import { getAccountProvider, isProviderConfigured } from "@/lib/subscriptions/gateway";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ACC = "6932b983-2893-45ca-976d-714a1a428937";

beforeAll(() => {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.trim().startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
});

it("diagnose", async () => {
  const admin = supabaseAdmin();
  const provider = await getAccountProvider(admin, ACC);
  console.log("provider:", provider, "| configured:", isProviderConfigured(provider));
  const url = await getCheckoutUrl(ACC);
  console.log("checkoutUrl:", url);
  console.log("result:", url ? "PASS" : "FAIL");
});