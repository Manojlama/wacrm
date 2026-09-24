import { test, expect } from '@playwright/test';

/** Collect client-side page errors so a broken page fails the test. */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

test('automations list renders the seeded automations', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/automations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Dummy — Welcome new contact')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Dummy — Follow-up on first message')).toBeVisible();
  expect(errors).toEqual([]);
});

test('broadcasts list renders the seeded broadcast as draft', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/broadcasts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Dummy — Winter sale launch')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Draft')).toBeVisible();
  expect(errors).toEqual([]);
});

test('contacts list renders seeded contacts with tags', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/contacts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Priya Sharma')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Aisha Khan')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pipelines board renders seeded deals', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/pipelines', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Dummy — Becker Logistics fleet rollout')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('flows list renders the seeded flow', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/flows', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Dummy — Support menu')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('billing page renders plan + gateway selector without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/billing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Billing & plan' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Payment gateway')).toBeVisible();
  await expect(page.getByText('Starter')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});