/**
 * PATCH-290 — live-check kit for the owner's shared browser (CDP 9333).
 *
 * One entry point, `runLive`, attaches to the persistent Chromium, opens ONE
 * own tab, installs a write-lock, runs the check body, and in `finally` closes
 * the own tab, checks the owner's tabs, prints a summary and exits. It never
 * closes the browser or a context and never sets a page size.
 *
 * See TESTING.md section 4 ("Live checks in the owner's browser") for the rules
 * this kit implements, and scripts/live/README.md for an example.
 */
import { request } from 'node:http';

const CDP_URL = 'http://127.0.0.1:9333';
const ORIGIN = 'http://localhost:3000';
const PADLETS = /\/rest\/v1\/padlets/;
const TESTING_DOC = 'TESTING.md section 4 ("Live checks in the owner\'s browser")';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for methods the write-lock always lets through. */
export function isReadMethod(method) {
  return READ_METHODS.has(String(method ?? '').toUpperCase());
}

/** Reads the row id out of a Supabase padlets response body; null on junk. */
export function padletIdFromBody(text) {
  try {
    const parsed = JSON.parse(text);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    const id = row && row.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Reads `metadata.drawingData.elements` (non-deleted) out of a request body. */
export function drawingElementsFromBody(text) {
  try {
    const parsed = JSON.parse(text);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    let drawing = row && row.metadata && row.metadata.drawingData;
    if (typeof drawing === 'string') drawing = JSON.parse(drawing);
    const elements = Array.isArray(drawing) ? drawing : drawing && drawing.elements;
    if (!Array.isArray(elements)) return [];
    return elements.filter((element) => element && typeof element === 'object' && element.isDeleted !== true);
  } catch {
    return [];
  }
}

/** Rows whose page size is locked (innerWidth !== outerWidth). */
export function lockedTabs(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row
    && typeof row.innerWidth === 'number'
    && typeof row.outerWidth === 'number'
    && row.innerWidth !== row.outerWidth);
}

/** The browser-extension console message that is not a page error. */
export function isExtensionNoise(message) {
  return typeof message === 'string'
    && message.includes('A listener indicated an asynchronous response');
}

async function getChromium() {
  const playwright = await import('playwright');
  return playwright.chromium ?? playwright.default?.chromium;
}

async function createContext(page, net) {
  const writeLock = { active: true, blocked: [] };
  const startedAt = Date.now();
  page.on('response', (response) => {
    const url = response.url();
    if (!PADLETS.test(url)) return;
    const method = response.request().method().toUpperCase();
    if (isReadMethod(method)) return;
    const requestBody = response.request().postData();
    const fromBody = requestBody ? padletIdFromBody(requestBody) : null;
    const fromUrl = (url.match(/id=eq\.([0-9a-fA-F-]+)/) || [])[1] || null;
    net.push({ method, status: response.status(), url, id: fromBody ?? fromUrl, requestBody: requestBody ?? null });
  });
  await page.route('**/*', async (route) => {
    const method = route.request().method().toUpperCase();
    if (isReadMethod(method) || !writeLock.active) {
      await route.continue();
      return;
    }
    writeLock.blocked.push({ method, url: route.request().url() });
    await route.abort();
  });
  return {
    page,
    net,
    writeLock,
    log: (...args) => console.log(...args),
    timing: (label) => {
      const seconds = (Date.now() - startedAt) / 1000;
      console.log(`[live] ${label} ${seconds.toFixed(2)}s`);
      return seconds;
    },
    allowWrites: async (fn) => {
      writeLock.active = false;
      try {
        return await fn();
      } finally {
        writeLock.active = true;
      }
    },
  };
}

function fetchTargets() {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = request(`${CDP_URL}/json/list`, { method: 'GET' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolvePromise(JSON.parse(data));
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
    req.on('error', rejectPromise);
    req.setTimeout(10000, () => req.destroy(new Error('CDP /json/list timed out')));
    req.end();
  });
}

function evaluateInTarget(webSocketDebuggerUrl, expression, timeoutMs = 10000) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timer = setTimeout(() => finish(new Error('CDP evaluate timed out')), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (error) rejectPromise(error);
      else resolvePromise(value);
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.id === 1) {
          finish(null, message.result && message.result.result ? message.result.result.value : null);
        }
      } catch (error) {
        finish(error);
      }
    });
    socket.addEventListener('error', () => finish(new Error('CDP socket error')));
  });
}

/** Raw-CDP check of every page target; returns rows with inner/outer metrics. */
export async function checkOwnerTabs() {
  const targets = await fetchTargets();
  const rows = [];
  for (const target of Array.isArray(targets) ? targets : []) {
    if (!target || target.type !== 'page') continue;
    let metrics = null;
    if (target.webSocketDebuggerUrl) {
      try {
        metrics = await evaluateInTarget(target.webSocketDebuggerUrl, '({ innerWidth, outerWidth, innerHeight, outerHeight })');
      } catch {
        metrics = null;
      }
    }
    rows.push({ url: target.url, title: target.title, ...(metrics || {}) });
  }
  return rows;
}

const EMPTY_CANVAS_POINTS = [[420, 320], [640, 420], [840, 320], [520, 520], [320, 220], [920, 520]];

/** Navigates to a board and waits for it to hydrate. */
export async function openBoard(ctx, boardId) {
  const { page } = ctx;
  await page.goto(`${ORIGIN}/dashboard/canvas/${boardId}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[data-canvas-layout]:not([data-canvas-layout=""])', { timeout: 200000, state: 'attached' });
  await page.locator('[data-padlet-id]').first().waitFor({ state: 'attached', timeout: 120000 });
}

/** Right-clicks empty canvas until "New Draw" appears, then opens the editor. */
export async function openNewDraw(ctx) {
  const { page } = ctx;
  const newDraw = page
    .getByRole('menuitem', { name: /New Draw/i })
    .or(page.getByText('New Draw', { exact: true }))
    .first();
  let opened = false;
  for (const [x, y] of EMPTY_CANVAS_POINTS) {
    await page.mouse.click(x, y, { button: 'right' });
    try {
      await newDraw.waitFor({ state: 'visible', timeout: 800 });
      opened = true;
      break;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  if (!opened) throw new Error('openNewDraw: the "New Draw" menu item never appeared');
  await newDraw.click();
  await page.locator('.excalidraw').first().waitFor({ state: 'visible', timeout: 60000 });
}

/** Our own library button when present, else Excalidraw's stock trigger. */
async function resolveLibraryTrigger(page) {
  const own = page.locator('[data-drawing-library-button]').first();
  if (await own.isVisible().catch(() => false)) return own;
  return page.locator('.excalidraw .sidebar-trigger').first();
}

/** Opens the Excalidraw library sidebar and waits for a unit. */
export async function openLibrary(ctx) {
  const { page } = ctx;
  const trigger = await resolveLibraryTrigger(page);
  await trigger.waitFor({ state: 'visible', timeout: 30000 });
  if (!(await page.locator('.library-unit').first().isVisible().catch(() => false))) {
    await trigger.click();
  }
  await page.locator('.library-unit').first().waitFor({ state: 'visible', timeout: 30000 });
}

/** Closes the library sidebar (best-effort; waits until the units hide). */
export async function closeLibrary(ctx) {
  const { page } = ctx;
  const unit = page.locator('.library-unit').first();
  if (await unit.isVisible().catch(() => false)) {
    const trigger = await resolveLibraryTrigger(page);
    if (await trigger.isVisible().catch(() => false)) await trigger.click();
  }
  await unit.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Inserts the library item at `index` onto the canvas. */
export async function insertLibraryItem(ctx, index) {
  const { page } = ctx;
  const unit = page.locator('.library-unit').nth(index);
  await unit.waitFor({ state: 'visible', timeout: 30000 });
  await unit.click();
  await page.waitForTimeout(300);
}

/** Saves the open drawing; returns `{ status, id, elements }` from the POST. */
export async function saveDrawing(ctx) {
  const { page } = ctx;
  return ctx.allowWrites(async () => {
    const save = page.getByRole('button', { name: /Save Changes/i }).first();
    await save.waitFor({ state: 'visible', timeout: 30000 });
    const responsePromise = page.waitForResponse(
      (response) => PADLETS.test(response.url()) && response.request().method().toUpperCase() === 'POST',
      { timeout: 60000 },
    );
    await save.click();
    const response = await responsePromise;
    const responseBody = await response.text();
    const requestBody = response.request().postData() || '';
    return {
      status: response.status(),
      id: padletIdFromBody(responseBody),
      elements: drawingElementsFromBody(requestBody),
    };
  });
}

/** Deletes a board post through the card's context menu; returns the status. */
export async function deletePost(ctx, id) {
  const { page } = ctx;
  return ctx.allowWrites(async () => {
    const card = page.locator(`[data-padlet-id="${id}"]`).first();
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.waitFor({ state: 'visible', timeout: 30000 });
    await card.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      const targets = [element.querySelector('[data-ai-render-state]'), element.firstElementChild, element].filter(Boolean);
      for (const target of targets) {
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
          button: 2,
        }));
      }
    });
    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete")').first();
    await deleteItem.waitFor({ state: 'visible', timeout: 15000 });
    const responsePromise = page.waitForResponse(
      (response) => PADLETS.test(response.url()) && response.request().method().toUpperCase() === 'DELETE',
      { timeout: 60000 },
    );
    await deleteItem.click();
    const confirm = page.locator('[role="dialog"] button:has-text("Delete"), [role="alertdialog"] button:has-text("Delete")').last();
    await confirm.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
    if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
    const response = await responsePromise;
    return response.status();
  });
}

/**
 * Runs one live check in its own tab. Always closes the tab, checks the
 * owner's tabs and exits 0 (ok) or 1 (body threw / a tab check failed).
 */
export async function runLive(name, body) {
  const net = [];
  const errors = [];
  let ctx = null;
  let page = null;
  let code = 0;
  try {
    const chromium = await getChromium();
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 180000 });
    const context = browser.contexts()[0];
    page = await context.newPage();
    page.on('pageerror', (error) => {
      const message = error && error.message ? error.message : String(error);
      if (!isExtensionNoise(message)) errors.push(message);
    });
    ctx = await createContext(page, net);
    await body(ctx);
  } catch (error) {
    code = 1;
    const message = error && error.message ? error.message : String(error);
    console.error(`[live:${name}] failed: ${message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    let tabs = [];
    try {
      tabs = await checkOwnerTabs();
    } catch (error) {
      code = 1;
      const message = error && error.message ? error.message : String(error);
      console.error(`[live:${name}] tab check failed: ${message}`);
    }
    const locked = lockedTabs(tabs);
    if (locked.length > 0) code = 1;
    const blocked = ctx ? ctx.writeLock.blocked.length : 0;
    console.log(`[live:${name}] blockedWrites=${blocked} pageErrors=${errors.length} ownerTabs=${tabs.length} lockedTabs=${locked.length}`);
    if (errors.length > 0) console.log(`[live:${name}] pageErrors: ${JSON.stringify(errors)}`);
    for (const row of locked) {
      console.log(`[live:${name}] LOCKED ${row.url || ''} innerWidth=${row.innerWidth} outerWidth=${row.outerWidth} — a page-size lock outlives its connection; see ${TESTING_DOC} to unlock (ask the owner to press F5).`);
    }
    process.exit(code);
  }
}
