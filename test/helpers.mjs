// Shared helpers for tests that need a real, throwaway git repo.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// A git hook exports GIT_DIR, GIT_INDEX_FILE and others. Inherited by a child,
// they would point its git commands at the outer repo. Drop them all.
export function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && k !== 'PRIVATE_TERMS') env[k] = v;
  }
  return { ...env, ...extra };
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
}

export function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

// Create a temp repo. With `files`, stage them and commit with `message`.
export function makeRepo(t, { files = null, message = 'initial commit' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qa-kit-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.autocrlf', 'false');
  if (files) {
    writeFiles(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', message);
  }
  return root;
}

export function runNode(script, args, { cwd, env = {} }) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: cleanEnv(env) });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, output: r.stdout + r.stderr };
}
