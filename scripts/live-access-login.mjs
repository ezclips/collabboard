// Logs in as the LIVE_ACCESS_EMAIL/LIVE_ACCESS_PASSWORD account (see .env.local)
// against a running dev server and saves Playwright storage state, for ad-hoc
// authenticated browser checks against a user's real canvases.
//
// Usage:
//   node scripts/live-access-login.mjs [outputStatePath] [baseUrl]
//
// Defaults: outputStatePath = scripts/.live-access-state.json (gitignored),
// baseUrl = http://localhost:3000. The output path should normally be
// overridden to a scratch/temp directory outside the repo — this file
// contains live session tokens and must never be committed.
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

function readEnvLocal(key) {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
    const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return (match?.[1] ?? '').trim();
  } catch {
    return '';
  }
}

const EMAIL = process.env.LIVE_ACCESS_EMAIL || readEnvLocal('LIVE_ACCESS_EMAIL');
const PASSWORD = process.env.LIVE_ACCESS_PASSWORD || readEnvLocal('LIVE_ACCESS_PASSWORD');
const STATE_PATH = process.argv[2] || 'scripts/.live-access-state.json';
const BASE_URL = process.argv[3] || 'http://localhost:3000';

if (!EMAIL || !PASSWORD) {
  console.error(JSON.stringify({ ok: false, error: 'LIVE_ACCESS_EMAIL / LIVE_ACCESS_PASSWORD not set in .env.local' }));
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const signIn = page.getByRole('button', { name: /^Sign In$/i });
    await signIn.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000); // hydration settle
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await signIn.click();
    await page.waitForURL('**/dashboard**', { timeout: 30000 });
    break;
  } catch (error) {
    if (attempt === 3) {
      await browser.close();
      throw error;
    }
    await page.waitForTimeout(2000);
  }
}

await page.context().storageState({ path: STATE_PATH });
console.log(JSON.stringify({ ok: true, statePath: STATE_PATH }));
await browser.close();
