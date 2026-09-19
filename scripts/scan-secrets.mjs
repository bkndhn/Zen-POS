#!/usr/bin/env node
/**
 * Fails the build if a private credential looks committed to the repo.
 *
 * Publishable values (Supabase anon key, Firebase Web API key) are allowed:
 * they are designed to ship inside the browser bundle and are protected by
 * Row Level Security / Firebase rules. Anything private must live in the
 * secret store or in an untracked .env.local file.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const PATTERNS = [
  { name: 'Supabase service_role key', re: /\bservice_role\b\s*[:=]\s*["']?eyJ[A-Za-z0-9._-]{40,}/ },
  { name: 'JWT with service_role claim', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl/ },
  { name: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe restricted key', re: /\brk_live_[A-Za-z0-9]{16,}/ },
  { name: 'OpenAI API key', re: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Google service account JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Generic hardcoded secret assignment', re: /(SERVICE_ROLE_KEY|PRIVATE_KEY|CLIENT_SECRET|WEBHOOK_SECRET)\s*[:=]\s*["'][A-Za-z0-9._\-\/+]{16,}["']/ },
];

const SKIP_DIRS = ['node_modules/', 'dist/', 'android/', 'ios/', '.git/', 'package-lock.json', 'bun.lock'];
const SKIP_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.svg', '.pdf', '.zip', '.jar', '.keystore', '.woff', '.woff2', '.ttf'];

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const findings = [];
for (const file of trackedFiles()) {
  if (SKIP_DIRS.some((d) => file.startsWith(d) || file.includes(`/${d}`))) continue;
  if (SKIP_EXT.some((e) => file.toLowerCase().endsWith(e))) continue;
  if (file === 'scripts/scan-secrets.mjs') continue;
  if (!existsSync(file)) continue;

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\u0000')) continue;

  content.split('\n').forEach((line, i) => {
    if (line.includes('scan-secrets:allow')) return;
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) findings.push({ file, line: i + 1, name });
    }
  });
}

// .env must never be allowed to hold a private value, even though it is tracked.
if (existsSync('.env')) {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const key = line.split('=')[0]?.trim();
    if (!key || key.startsWith('#')) continue;
    if (!key.startsWith('VITE_')) {
      findings.push({ file: '.env', line: 0, name: `Non-public variable "${key}" in tracked .env (move it to .env.local or the secret store)` });
    }
  }
}

if (findings.length) {
  console.error('\nSecret scan FAILED — private credentials must never be committed:\n');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.name}`);
  console.error('\nMove the value to .env.local (untracked) or the Supabase secret store.\n');
  process.exit(1);
}

console.log('Secret scan passed — no private credentials found in tracked files.');
