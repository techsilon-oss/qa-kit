#!/usr/bin/env node
// Run test/*.test.mjs with node:test.
//
// The file list is explicit because "node --test" with no arguments also runs every
// script under test/, and the fixture repos there hold files that are not tests.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = readdirSync('test')
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join('test', f));
if (files.length === 0) {
  console.error('run-tests: no test/*.test.mjs files found');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
