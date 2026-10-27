#!/usr/bin/env node
// Point git at .githooks/ for this clone. Runs from "npm install" (the prepare script).
// Outside a git work tree (for example an installed package), it does nothing.

import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
} catch {
  console.log('install-hooks: not a git work tree; skipped');
  process.exit(0);
}
execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
console.log('install-hooks: core.hooksPath = .githooks');
