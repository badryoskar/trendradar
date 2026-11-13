// Static checks on the production build (dist/). Exits non-zero on failure.
// Run after `vite build`: node scripts/verify-dist.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json missing — run `npm run build` first');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

// 1. Manifest invariants
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
const FORBIDDEN = [
  'history',
  'tabs',
  'webRequest',
  'cookies',
  'scripting',
  'unlimitedStorage',
  'alarms',
  'notifications',
  '<all_urls>',
];
for (const p of manifest.permissions ?? []) if (FORBIDDEN.includes(p)) fail(`forbidden permission: ${p}`);
for (const h of manifest.host_permissions ?? []) {
  if (h === '<all_urls>' || h.startsWith('*://') || h === 'https://*/*' || h === 'http://*/*')
    fail(`broad required host permission: ${h}`);
}
for (const h of manifest.optional_host_permissions ?? [])
  if (h.startsWith('http://')) fail(`http optional host permission: ${h}`);
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!/script-src 'self'/.test(csp) || /unsafe-eval|unsafe-inline|https?:/.test(csp)) fail(`weak CSP: ${csp}`);

// 2. Referenced files exist
const referenced = [
  manifest.action?.default_popup,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
for (const f of referenced) if (!existsSync(join(dist, f))) fail(`manifest references missing file: ${f}`);
for (const page of ['popup.html', 'dashboard.html']) if (!existsSync(join(dist, page))) fail(`missing page: ${page}`);

// 3. Bundle content checks
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist);
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/, // AWS
  /sk-[A-Za-z0-9]{20,}/, // generic API secret
  /ghp_[A-Za-z0-9]{30,}/, // GitHub
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /client_secret\s*[:=]\s*["'][^"']{8,}/i,
];
// Hosts allowed to appear in shipped code. None of them is contacted at runtime
// except the HN API (phase 2): w3.org / purl.org are XML namespace identifiers,
// react.dev / reactjs.org are error-message links, json-schema.org are zod
// `$schema` identifiers, example.com is the reserved demo domain.
const ALLOWED_HOSTS = new Set([
  'www.w3.org',
  'reactjs.org',
  'react.dev',
  'json-schema.org',
  'example.com',
  'hacker-news.firebaseio.com',
  'purl.org',
]);
let totalBytes = 0;
for (const f of files) {
  totalBytes += statSync(f).size;
  if (!/\.(js|html|css|json)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const re of SECRET_PATTERNS) if (re.test(text)) fail(`possible secret (${re}) in ${f}`);
  if (/\beval\s*\(|new Function\s*\(/.test(text)) fail(`eval/new Function in ${f}`);
  if (/\.html$/.test(f) && /<script[^>]+src=["']https?:/i.test(text)) fail(`remote script in ${f}`);
  // manifest.json match patterns (https://*/*) are validated in section 1.
  if (f.endsWith('manifest.json')) continue;
  // Only literal hostnames; template fragments such as `http://[${host}]` are not URLs.
  for (const m of text.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
    const host = m[1].toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) fail(`unexpected external host in ${f.slice(dist.length + 1)}: ${host}`);
  }
}

if (failures.length) {
  console.error(`verify-dist: ${failures.length} problem(s)`);
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}
console.log(
  `verify-dist: OK — ${files.length} files, ${(totalBytes / 1024).toFixed(1)} KiB, permissions=${JSON.stringify(manifest.permissions)}, optional_host_permissions=${JSON.stringify(manifest.optional_host_permissions)}`,
);
