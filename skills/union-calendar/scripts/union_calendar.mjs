#!/usr/bin/env node
// union_calendar.mjs — pull union.vc community calendar into machine-readable JSON.
//
// Commands:
//   login                 Open a browser, sign in, save the session for later pulls.
//   pull  [options]       Fetch the calendar for one or more weeks as JSON (no browser launch).
//
// pull options:
//   --weeks N             How many consecutive weeks to fetch, starting this week. Default 2 (this week + next).
//   --date YYYY-MM-DD     Anchor date for "week 0". Default: today (local time).
//   --network SLUG        Community slug (e.g. capital_factory). Default: saved slug, else capital_factory.
//   --out FILE            Write JSON to FILE instead of stdout.
//   --raw                 Emit the raw union.vc items instead of the normalized shape.
//
// Auth is stored as browser cookies in ~/.union-vc-auth.json (no password is ever written to disk).
// The community slug detected at login is stored in ~/.union-vc-config.json.

import { chromium, request } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const HOME = os.homedir();
const AUTH_FILE = path.join(HOME, '.union-vc-auth.json');
const CONFIG_FILE = path.join(HOME, '.union-vc-config.json');
const BASE = 'https://union.vc';

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}

function fmtDate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function parseArgs(argv) {
  const a = { weeks: 2 };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--weeks') a.weeks = parseInt(argv[++i], 10);
    else if (t === '--date') a.date = argv[++i];
    else if (t === '--network') a.network = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--raw') a.raw = true;
  }
  return a;
}

// ---------- login ----------
async function login() {
  const email = process.env.UNION_EMAIL || '';
  const password = process.env.UNION_PASSWORD || '';
  const headless = !!(email && password); // headless auto-fill when creds provided, else headed manual

  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  // Open the sign-in modal (trigger: <a data-target="login-modal">Login</a>).
  await page.locator('[data-target="login-modal"]').first().click().catch(() => {});

  const emailField = page.locator('#user_email');
  await emailField.waitFor({ state: 'visible', timeout: 15000 });

  if (email && password) {
    await emailField.fill(email);
    await page.locator('#user_password').fill(password);
    // Submit the Devise form (#new_user → POST /sign-in).
    await page.locator('#new_user [name="commit"], #new_user button[type="submit"]').first().click();
  } else {
    console.error('Sign in manually in the browser window. Waiting up to 3 minutes…');
  }

  // Success = navigated to a community page (/<slug>) and the login form is gone.
  await page.waitForURL((url) => /https:\/\/union\.vc\/[^/]+/.test(url.href) && !/\/$/.test(url.pathname), { timeout: email ? 30000 : 180000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Detect the community slug from the current URL (e.g. https://union.vc/capital_factory).
  const slug = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
  if (slug && !['users', 'login', 'sessions'].includes(slug)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ network: slug }, null, 2));
  }

  await ctx.storageState({ path: AUTH_FILE });
  await browser.close();

  if (!fs.existsSync(AUTH_FILE)) throw new Error('Login did not complete — no session saved.');
  console.error(`Saved session to ${AUTH_FILE}` + (slug ? ` (network: ${slug})` : ''));
}

// ---------- normalize ----------
const stripHtml = (h) => (h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function normalize(it) {
  return {
    title: it.title,
    type: it.type,                       // Event | OfficeHour | PrivateOfficeHour
    label: it.label,
    start: it.start_date,                // ISO 8601 with tz offset
    end: it.end_date,
    day: (it.start_date || '').slice(0, 10),
    location: it.location || null,
    virtual: it.virtualProvider ? it.virtualProvider.name : null,
    isVirtualOnly: !!it.isVirtualOnly,
    isVirtualFriendly: !!it.isVirtualFriendly,
    tags: (it.tags || []).map((t) => t.name),
    host: it.author && it.author[0] ? it.author[0].name : null,
    hostHeadline: it.author && it.author[0] ? it.author[0].headline : null,
    url: it.url ? BASE + it.url : null,
    availableSlots: it.availableSlots,
    isBookable: !!it.isBookable,
    isBooked: !!it.isBooked,
    isAttending: !!it.isAttending,
    isHosting: !!it.isHosting,
    isScarce: !!it.isScarce,
    isPast: !!it.isPast,
    summary: stripHtml(it.summary),
  };
}

// ---------- pull ----------
async function pull(opts) {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(`No saved session (${AUTH_FILE}). Run: node union_calendar.mjs login`);
  }
  const network = opts.network || readConfig().network || 'capital_factory';
  const anchor = opts.date ? new Date(opts.date + 'T12:00:00') : new Date();
  const weeks = Number.isFinite(opts.weeks) && opts.weeks > 0 ? opts.weeks : 2;

  const ctx = await request.newContext({ storageState: AUTH_FILE, baseURL: BASE });
  const result = { generatedAt: new Date().toISOString(), network, weeks: [] };

  try {
    for (let i = 0; i < weeks; i++) {
      const d = new Date(anchor.getTime() + i * 7 * 86400000);
      const date = fmtDate(d);
      const res = await ctx.get(`/${network}/programming.json?date=${date}`, {
        headers: { Accept: 'application/json' },
      });
      const ctype = res.headers()['content-type'] || '';
      if (!res.ok() || !ctype.includes('json')) {
        throw new Error(
          `Calendar fetch failed (status ${res.status()}, type "${ctype}"). ` +
          `Session may have expired — run: node union_calendar.mjs login`
        );
      }
      const items = await res.json();
      const events = opts.raw ? items : items.map(normalize);
      const byDay = {};
      for (const e of (opts.raw ? items.map(normalize) : events)) byDay[e.day] = (byDay[e.day] || 0) + 1;
      result.weeks.push({ index: i, anchorDate: date, count: items.length, byDay, events });
    }
  } finally {
    await ctx.dispose();
  }

  const json = JSON.stringify(result, null, 2);
  if (opts.out) {
    fs.writeFileSync(opts.out, json);
    console.error(`Wrote ${result.weeks.reduce((n, w) => n + w.count, 0)} events across ${weeks} week(s) to ${opts.out}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

// ---------- main ----------
const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'login') await login();
  else if (cmd === 'pull') await pull(parseArgs(rest));
  else {
    console.error('Usage:\n  node union_calendar.mjs login\n  node union_calendar.mjs pull [--weeks N] [--date YYYY-MM-DD] [--network SLUG] [--out FILE] [--raw]');
    process.exit(2);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
