#!/usr/bin/env node
// mentor_report.mjs — build a daily "available mentor office-hour slots" report
// for this week + next week, formatted for both Slack and Gmail, saved locally.
//
// Usage:
//   node mentor_report.mjs [--out-dir DIR] [--network SLUG] [--tz ZONE] [--no-save]
//
// Defaults: out-dir = ./mentor-reports (cwd), network = saved slug, tz = America/Chicago (Austin).
// Reuses union_calendar.mjs `pull --raw` so it shares the same auth/session logic.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PULL = path.join(HERE, 'union_calendar.mjs');

function parseArgs(argv) {
  const a = { outDir: path.join(process.cwd(), 'mentor-reports'), tz: 'America/Chicago' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out-dir') a.outDir = argv[++i];
    else if (t === '--network') a.network = argv[++i];
    else if (t === '--tz') a.tz = argv[++i];
    else if (t === '--no-save') a.noSave = true;
  }
  return a;
}

// ---- time formatting in a fixed zone (Austin) ----
function makeFmt(tz) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const dayLong = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
  const dayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const clean = (s) => s.replace(/\s?([AP])M/, (m, p) => p.toLowerCase() + 'm'); // "1:00 PM" -> "1:00pm"
  return {
    time: (iso) => clean(time.format(new Date(iso))),
    dayLong: (iso) => dayLong.format(new Date(iso)),
    dayShort: (iso) => dayShort.format(new Date(iso)),
    dayKey: (iso) => dayKey.format(new Date(iso)),
  };
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- core: turn raw pull into available-slot session objects ----
function collectAvailable(data) {
  const sessions = [];
  for (const w of data.weeks) {
    for (const e of w.events) {
      if (!e.isBookable || !(e.availableSlots > 0)) continue;
      const slots = Array.isArray(e.slots) ? e.slots : [];
      sessions.push({
        title: e.title,
        host: ((e.author && e.author[0] && e.author[0].name) || '').replace(/\s+/g, ' ').trim() || null,
        hostHeadline: (e.author && e.author[0] && e.author[0].headline) || null,
        start: e.start_date,
        end: e.end_date,
        open: e.availableSlots,
        totalSlots: slots.length || null,
        slotMins: slots.length ? Math.round((new Date(slots[0].end_date) - new Date(slots[0].start_date)) / 60000) : null,
        location: e.location || null,
        isVirtualOnly: !!e.isVirtualOnly,
        virtual: e.virtualProvider ? e.virtualProvider.name : null,
        tags: (e.tags || []).map((t) => t.name),
        url: e.url ? 'https://union.vc' + e.url : null,
      });
    }
  }
  sessions.sort((a, b) => a.start.localeCompare(b.start));
  return sessions;
}

function placeLabel(s) {
  if (s.isVirtualOnly) return s.virtual ? `Virtual (${s.virtual})` : 'Virtual';
  if (s.location) return s.location.replace(/^Capital Factory Austin Campus:\s*/, '').replace(/Capital Factory Austin Campus/, 'Austin Campus');
  return 'In-person';
}

function groupByDay(sessions, F) {
  const map = new Map();
  for (const s of sessions) {
    const k = F.dayKey(s.start);
    if (!map.has(k)) map.set(k, { label: F.dayLong(s.start), items: [] });
    map.get(k).items.push(s);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

// ---- renderers ----
function renderSlack(sessions, meta, F) {
  const L = [];
  L.push(`*:calendar: Capital Factory — Available Mentor Office Hours*`);
  L.push(`_${meta.range} · ${sessions.length} open sessions · ${meta.totalOpen} bookable slots · generated ${meta.gen}_`);
  if (!sessions.length) { L.push('\n_No open mentor slots in this window._'); return L.join('\n'); }
  for (const day of groupByDay(sessions, F)) {
    L.push(`\n*${day.label}*`);
    for (const s of day.items) {
      const place = s.isVirtualOnly ? ':globe_with_meridians:' : ':office:';
      const slotInfo = s.slotMins ? `${s.open} open (${s.slotMins}m)` : `${s.open} open`;
      const tags = s.tags.slice(0, 3).join(', ');
      const link = s.url ? ` · <${s.url}|Book>` : '';
      L.push(`• ${F.time(s.start)}–${F.time(s.end)} — *${s.host || s.title}* · ${slotInfo} · ${place} ${placeLabel(s)}${tags ? ` · _${tags}_` : ''}${link}`);
    }
  }
  return L.join('\n');
}

function renderGmailHtml(sessions, meta, F) {
  const P = [];
  P.push(`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:680px;line-height:1.45">`);
  P.push(`<h2 style="margin:0 0 2px">Capital Factory — Available Mentor Office Hours</h2>`);
  P.push(`<div style="color:#666;font-size:13px;margin-bottom:16px">${esc(meta.range)} &middot; <b>${sessions.length}</b> open sessions &middot; <b>${meta.totalOpen}</b> bookable slots &middot; generated ${esc(meta.gen)}</div>`);
  if (!sessions.length) { P.push(`<p><i>No open mentor slots in this window.</i></p></div>`); return P.join('\n'); }
  for (const day of groupByDay(sessions, F)) {
    P.push(`<h3 style="margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid #eee">${esc(day.label)}</h3>`);
    P.push(`<table style="border-collapse:collapse;width:100%;font-size:14px">`);
    for (const s of day.items) {
      const slotInfo = s.slotMins ? `${s.open} open · ${s.slotMins}m` : `${s.open} open`;
      const tags = s.tags.slice(0, 3).map(esc).join(', ');
      const place = (s.isVirtualOnly ? '🌐 ' : '🏢 ') + esc(placeLabel(s));
      const who = esc(s.host || s.title);
      const book = s.url ? `<a href="${esc(s.url)}" style="color:#2563eb;text-decoration:none">Book →</a>` : '';
      P.push(`<tr style="border-top:1px solid #f0f0f0">`);
      P.push(`<td style="padding:6px 10px 6px 0;white-space:nowrap;color:#444;vertical-align:top">${F.time(s.start)}–${F.time(s.end)}</td>`);
      P.push(`<td style="padding:6px 10px 6px 0;vertical-align:top"><b>${who}</b>${tags ? `<div style="color:#888;font-size:12px">${tags}</div>` : ''}</td>`);
      P.push(`<td style="padding:6px 10px 6px 0;white-space:nowrap;color:#555;vertical-align:top">${slotInfo}</td>`);
      P.push(`<td style="padding:6px 10px 6px 0;white-space:nowrap;color:#555;vertical-align:top">${place}</td>`);
      P.push(`<td style="padding:6px 0;white-space:nowrap;vertical-align:top">${book}</td>`);
      P.push(`</tr>`);
    }
    P.push(`</table>`);
  }
  P.push(`</div>`);
  return P.join('\n');
}

function renderText(sessions, meta, F) {
  const L = [];
  L.push(`Capital Factory — Available Mentor Office Hours`);
  L.push(`${meta.range} | ${sessions.length} open sessions | ${meta.totalOpen} bookable slots | generated ${meta.gen}`);
  if (!sessions.length) { L.push('\nNo open mentor slots in this window.'); return L.join('\n'); }
  for (const day of groupByDay(sessions, F)) {
    L.push(`\n${day.label}`);
    for (const s of day.items) {
      const slotInfo = s.slotMins ? `${s.open} open (${s.slotMins}m)` : `${s.open} open`;
      const tags = s.tags.slice(0, 3).join(', ');
      L.push(`  ${F.time(s.start)}-${F.time(s.end)}  ${s.host || s.title}  | ${slotInfo} | ${placeLabel(s)}${tags ? ` | ${tags}` : ''}`);
      if (s.url) L.push(`      ${s.url}`);
    }
  }
  return L.join('\n');
}

// ---- main ----
async function main() {
  const a = parseArgs(process.argv.slice(2));
  const F = makeFmt(a.tz);
  const pullArgs = ['pull', '--raw', '--weeks', '2'];
  if (a.network) pullArgs.push('--network', a.network);
  const { stdout } = await execFileP('node', [PULL, ...pullArgs], { maxBuffer: 32 * 1024 * 1024 });
  const data = JSON.parse(stdout);

  const sessions = collectAvailable(data);
  const totalOpen = sessions.reduce((n, s) => n + s.open, 0);
  const first = data.weeks[0]?.events[0]?.start_date;
  const lastWeek = data.weeks[data.weeks.length - 1];
  const last = lastWeek?.events[lastWeek.events.length - 1]?.start_date;
  const meta = {
    range: first && last ? `${F.dayShort(first)} – ${F.dayShort(last)}` : '',
    totalOpen,
    gen: new Intl.DateTimeFormat('en-US', { timeZone: a.tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
    network: data.network,
  };

  const slack = renderSlack(sessions, meta, F);
  const html = renderGmailHtml(sessions, meta, F);
  const text = renderText(sessions, meta, F);

  const out = { slack, html, text, sessions, meta };

  if (!a.noSave) {
    fs.mkdirSync(a.outDir, { recursive: true });
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: a.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const base = `mentor-slots-${stamp}`;
    const files = {
      [`${base}.slack.md`]: slack,
      [`${base}.gmail.html`]: html,
      [`${base}.txt`]: text,
      [`${base}.json`]: JSON.stringify({ meta, sessions }, null, 2),
    };
    // also keep "latest.*" copies for easy scripting
    const latest = { 'latest.slack.md': slack, 'latest.gmail.html': html, 'latest.txt': text };
    for (const [name, body] of Object.entries({ ...files, ...latest })) {
      fs.writeFileSync(path.join(a.outDir, name), body);
    }
    out.savedDir = a.outDir;
    out.savedBase = base;
  }
  return out;
}

main()
  .then((out) => {
    // Print a human preview to stderr, machine JSON-ish summary to stdout.
    process.stderr.write('\n===== SLACK PREVIEW =====\n' + out.slack + '\n\n===== TEXT PREVIEW =====\n' + out.text + '\n');
    if (out.savedDir) process.stderr.write(`\nSaved to ${out.savedDir} (base: ${out.savedBase}, plus latest.*)\n`);
    process.stdout.write(JSON.stringify({ openSessions: out.sessions.length, openSlots: out.meta.totalOpen, savedDir: out.savedDir || null }) + '\n');
  })
  .catch((err) => { console.error('Error:', err.message); process.exit(1); });
