#!/usr/bin/env node
// slack.mjs — Capital Factory Slack CLI. Auth once, then send DMs, using a saved Playwright session.
//
// Commands:
//   auth                          Open a browser, sign in to Slack, save the session for later sends.
//   auth-test                     Verify the saved session (calls Slack auth.test); sends nothing.
//   dm <nick|id> <message…>       Send a direct message. Add --dry-run to preview without sending.
//   nicks                         List saved nicknames.
//   nick add <nick> <id> [name…]  Add/replace a nickname → conversation-id mapping.
//   nick rm  <nick>               Remove a nickname.
//
// Flags:
//   --dry-run     (dm) Resolve the target and print what would be sent; no browser, no send.
//   --headed      (dm) Show the browser window instead of running headless (debugging).
//
// Session cookies + localStorage live in ~/.slack-cf-auth.json (NO password is ever written to disk).
// Nicknames live in ~/.slack-cf-nicknames.json; workspace config in ~/.slack-cf-config.json.

import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const HOME = os.homedir();
const AUTH_FILE = path.join(HOME, '.slack-cf-auth.json');
const NICK_FILE = path.join(HOME, '.slack-cf-nicknames.json');
const CONFIG_FILE = path.join(HOME, '.slack-cf-config.json');
const SIGNIN_URL = 'https://capitalfactory.slack.com/';

const USAGE = `Usage:
  node slack.mjs auth
  node slack.mjs auth-test
  node slack.mjs dm <nick|id> <message…> [--dry-run] [--browser] [--headed]
  node slack.mjs dm <nick|id> --file <path> [--dry-run]    # push a report file (mrkdwn, multi-line)
  node slack.mjs nicks
  node slack.mjs nick add <nick> <conversation-id> [name…]
  node slack.mjs nick rm <nick>

Sends via Slack's web API by default (renders mrkdwn, multi-line, instant).
--browser forces the slower web-client fallback (collapses newlines).`;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function config() { return readJson(CONFIG_FILE, { team: 'T026PFU08', base: 'https://capitalfactory.slack.com' }); }
function nicknames() { return readJson(NICK_FILE, {}); }
function clientUrl(id) { return `https://app.slack.com/client/${config().team}/${id}`; }

// Resolve a nickname or a raw conversation id to { id, name, nick }.
function resolve(target) {
  const nicks = nicknames();
  const key = String(target).toLowerCase();
  if (nicks[key]) return { id: nicks[key].id, name: nicks[key].name || key, nick: key };
  if (/^[CDG][A-Z0-9]+$/.test(target)) return { id: target, name: target, nick: null };
  const known = Object.keys(nicks).join(', ') || '(none)';
  throw new Error(`Unknown target "${target}". Known nicknames: ${known}. Or pass a raw conversation id (D…/C…/G…).`);
}

// ---------- auth ----------
async function auth() {
  const cfg = config();
  const browser = await chromium.launch({ headless: false }); // always headed: the user signs in here
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // Go straight to the in-browser client. Unauthenticated, Slack redirects to sign-in; after
  // sign-in it may bounce through /ssb/redirect (the "open the desktop app" detour) which aborts
  // the navigation — so we never wait on a specific URL. We watch for the session cookie instead.
  await page.goto(`https://app.slack.com/client/${cfg.team}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.error('Sign in to Capital Factory Slack in the browser window. Waiting up to 3 minutes…');

  // Success = Slack's auth cookie "d" is set on .slack.com.
  const deadline = Date.now() + 180000;
  let authed = false;
  while (Date.now() < deadline) {
    const cookies = await ctx.cookies('https://app.slack.com').catch(() => []);
    if (cookies.some((c) => c.name === 'd' && c.value && c.value.length > 20)) { authed = true; break; }
    await page.waitForTimeout(2000);
  }
  if (!authed) { await browser.close(); throw new Error('Timed out waiting for sign-in (no session cookie after 3 min).'); }

  // Load the authenticated web client so localStorage is captured too; tolerate ssb-redirect aborts.
  await page.goto(`https://app.slack.com/client/${cfg.team}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);
  const m = page.url().match(/client\/(T[A-Z0-9]+)/);
  if (m) cfg.team = m[1];
  writeJson(CONFIG_FILE, cfg);
  await ctx.storageState({ path: AUTH_FILE });
  await browser.close();
  if (!fs.existsSync(AUTH_FILE)) throw new Error('Login did not complete — no session saved.');
  console.error(`Saved session to ${AUTH_FILE} (team: ${cfg.team}).`);
}

// ---------- session credentials (for the Slack web API) ----------
// Reads the auth cookie + workspace token from the saved session. Both stay local; they are
// only ever sent to Slack's own API. This is the same "reuse the saved session" pattern the
// union-calendar skill uses against union.vc.
function sessionCreds() {
  const j = readJson(AUTH_FILE, null);
  if (!j) throw new Error(`No saved session (${AUTH_FILE}). Run: node slack.mjs auth`);
  const team = config().team;
  const dCookie = (j.cookies || []).find((c) => c.name === 'd');
  let token = null;
  for (const o of j.origins || []) {
    for (const kv of o.localStorage || []) {
      if (kv.name === 'localConfig_v2') {
        try {
          const conf = JSON.parse(kv.value);
          if (conf.teams && conf.teams[team] && conf.teams[team].token) token = conf.teams[team].token;
        } catch { /* ignore */ }
      }
    }
  }
  if (!dCookie || !token) throw new Error('Session is missing the API token/cookie — run: node slack.mjs auth');
  return { token, d: dCookie.value };
}

// Verify the saved session without sending anything (Slack auth.test).
async function authTest() {
  const { token, d } = sessionCreds();
  const base = config().base || 'https://capitalfactory.slack.com';
  const res = await fetch(`${base}/api/auth.test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Cookie: `d=${d}` },
    body: new URLSearchParams({ token }).toString(),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `non-json (status ${res.status})` }));
  if (!data.ok) {
    const hint = ['not_authed', 'invalid_auth', 'token_revoked', 'token_expired'].includes(data.error)
      ? ' — run: node slack.mjs auth' : '';
    throw new Error(`Slack API error: ${data.error}${hint}`);
  }
  process.stdout.write(JSON.stringify({ ok: true, user: data.user, team: data.team, user_id: data.user_id, team_id: data.team_id }, null, 2) + '\n');
}

// Post a message via Slack's chat.postMessage (renders mrkdwn, multi-line, no browser).
async function apiPost(channel, text) {
  const { token, d } = sessionCreds();
  const base = config().base || 'https://capitalfactory.slack.com';
  const body = new URLSearchParams({ token, channel, text, unfurl_links: 'false', unfurl_media: 'false' });
  const res = await fetch(`${base}/api/chat.postMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Cookie: `d=${d}` },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `non-json (status ${res.status})` }));
  if (!data.ok) {
    const hint = ['not_authed', 'invalid_auth', 'token_revoked', 'token_expired'].includes(data.error)
      ? ' — run: node slack.mjs auth' : '';
    throw new Error(`Slack API error: ${data.error}${hint}`);
  }
  return data;
}

// Fallback send by driving the web client in a browser (slower; collapses newlines).
async function browserSend(who, message, headed) {
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(clientUrl(who.id), { waitUntil: 'domcontentloaded' });
    if (/\/(signin|sign_in|workspace-signin)/.test(page.url())) {
      throw new Error('Session expired — run: node slack.mjs auth');
    }
    const box = page
      .locator('[data-qa="message_input"] [role="textbox"], [data-qa="message_input"] div[contenteditable="true"]')
      .first();
    await box.waitFor({ state: 'visible', timeout: 30000 });
    await box.click();
    await page.keyboard.type(message.replace(/\r?\n/g, ' '));
    const sendBtn = page.locator('[data-qa="texty_send_button"]').first();
    if (await sendBtn.isEnabled({ timeout: 2000 }).catch(() => false)) await sendBtn.click();
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ---------- dm ----------
async function dm({ target, message, file, dryRun, headed, browser }) {
  if (!target) throw new Error('Usage: node slack.mjs dm <nick|id> <message…> | --file <path>');
  const who = resolve(target);

  let text = message;
  if (file) text = fs.readFileSync(file, 'utf8').replace(/\s+$/, '');
  if (!text) throw new Error('Empty message — provide text or --file <path>.');

  if (dryRun) {
    process.stdout.write(JSON.stringify({
      dryRun: true, to: who, via: browser ? 'browser' : 'api',
      chars: text.length, preview: text.slice(0, 240), message: text,
    }, null, 2) + '\n');
    return;
  }

  if (browser) {
    if (!fs.existsSync(AUTH_FILE)) throw new Error(`No saved session (${AUTH_FILE}). Run: node slack.mjs auth`);
    await browserSend(who, text, headed);
    process.stdout.write(JSON.stringify({ sent: true, via: 'browser', to: who, chars: text.length }, null, 2) + '\n');
    return;
  }

  const data = await apiPost(who.id, text);
  process.stdout.write(JSON.stringify({ sent: true, via: 'api', to: who, ts: data.ts, chars: text.length }, null, 2) + '\n');
}

// ---------- nicknames ----------
function cmdNicks() {
  const n = nicknames();
  const keys = Object.keys(n);
  if (!keys.length) { console.error('No nicknames saved.'); return; }
  for (const k of keys) process.stdout.write(`${k}\t${n[k].id}\t${n[k].name || ''}\n`);
}
function cmdNick(rest) {
  const [sub, a, b, ...c] = rest;
  const n = nicknames();
  if (sub === 'add') {
    if (!a || !b) throw new Error('Usage: node slack.mjs nick add <nick> <conversation-id> [name…]');
    n[a.toLowerCase()] = { id: b, name: c.join(' ') || a };
    writeJson(NICK_FILE, n);
    console.error(`Saved "${a.toLowerCase()}" → ${b}`);
  } else if (sub === 'rm' || sub === 'remove') {
    if (!a) throw new Error('Usage: node slack.mjs nick rm <nick>');
    delete n[a.toLowerCase()];
    writeJson(NICK_FILE, n);
    console.error(`Removed "${a.toLowerCase()}"`);
  } else {
    throw new Error('Usage: node slack.mjs nick add <nick> <id> [name…] | nick rm <nick>');
  }
}

// ---------- main ----------
const argv = process.argv.slice(2);
const flags = { dryRun: false, headed: false, browser: false, file: null };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--headed') flags.headed = true;
  else if (a === '--browser') flags.browser = true;
  else if (a === '--file') flags.file = argv[++i];
  else pos.push(a);
}
const [cmd, ...rest] = pos;

try {
  if (cmd === 'auth') await auth();
  else if (cmd === 'auth-test' || cmd === 'whoami') await authTest();
  else if (cmd === 'dm') await dm({ target: rest[0], message: rest.slice(1).join(' '), ...flags });
  else if (cmd === 'nicks') cmdNicks();
  else if (cmd === 'nick') cmdNick(rest);
  else { console.error(USAGE); process.exit(2); }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
