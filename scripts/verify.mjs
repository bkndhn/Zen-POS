#!/usr/bin/env node
/**
 * Local pre-release gate: runs the same checks as CI, in the same order.
 * Usage: npm run verify
 */
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'Typecheck', cmd: 'npm', args: ['run', 'typecheck'], required: true },
  { name: 'Lint', cmd: 'npm', args: ['run', 'lint'], required: false },
  { name: 'Tests', cmd: 'npm', args: ['run', 'test'], required: true },
  { name: 'Build', cmd: 'npm', args: ['run', 'build'], required: true },
];

let failed = false;

for (const step of steps) {
  process.stdout.write(`\n=== ${step.name} ===\n`);
  const result = spawnSync(step.cmd, step.args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const ok = result.status === 0;
  if (!ok) {
    process.stdout.write(`\n${step.required ? 'FAILED' : 'WARNING'}: ${step.name}\n`);
    if (step.required) failed = true;
  }
}

process.stdout.write(failed ? '\nVerify FAILED — do not release.\n' : '\nVerify passed — safe to release.\n');
process.exit(failed ? 1 : 0);
