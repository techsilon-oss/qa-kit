#!/usr/bin/env node
// check-private-terms — block private names from entering this public repo.
//
// Reads a list of terms, one per line, from the git-ignored file .private-terms
// at the repo root. Without that file, reads the environment variable
// PRIVATE_TERMS (comma-separated). Lines that are empty or start with "#" are
// ignored. Matching is case-insensitive and whole-word: a term matches only
// when no letter, digit or underscore touches it on either side, so a short
// term does not match inside a longer word. A term may contain spaces.
//
// Searches every tracked file and every commit message reachable from HEAD.
// Prints where each match is, never the term itself.
//
// Usage:
//   node scripts/check-private-terms.mjs                       files and commit messages
//   node scripts/check-private-terms.mjs --message-file <f>    one commit message only (commit-msg hook)
//   node scripts/check-private-terms.mjs --require             fail when no list is configured (CI)
//
// Exit code: 0 when nothing matches, 1 on a match or an error.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIST_FILE = '.private-terms';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function parseArgs(argv) {
  const opts = { messageFile: null, require: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--message-file') opts.messageFile = argv[++i];
    else if (argv[i] === '--require') opts.require = true;
    else throw new Error(`Unknown option "${argv[i]}". Use --message-file <path> or --require.`);
  }
  if (opts.messageFile === undefined) throw new Error('--message-file needs a path.');
  return opts;
}

function loadTerms(root) {
  const file = join(root, LIST_FILE);
  let raw;
  let source;
  if (existsSync(file)) {
    raw = readFileSync(file, 'utf8').split(/\r?\n/);
    source = LIST_FILE;
  } else if (process.env.PRIVATE_TERMS) {
    raw = process.env.PRIVATE_TERMS.split(',');
    source = 'PRIVATE_TERMS';
  } else {
    return { terms: [], source: null };
  }
  const terms = raw
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('#'))
    .map((t) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(t)}(?![\\p{L}\\p{N}_])`, 'iu'));
  return { terms, source };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the 1-based index of each term found in the line.
function termsIn(line, terms) {
  const found = [];
  terms.forEach((re, i) => {
    if (re.test(line)) found.push(i + 1);
  });
  return found;
}

function scanText(text, terms, where, problems) {
  text.split(/\r?\n/).forEach((line, i) => {
    for (const n of termsIn(line, terms)) problems.push(`${where(i + 1)}: matches private term #${n}`);
  });
}

function scanFiles(root, terms, problems) {
  const files = git(['ls-files', '-z'], root).split('\0').filter(Boolean);
  if (files.includes(LIST_FILE)) {
    problems.push(`${LIST_FILE}: the term list is tracked by git. Run "git rm --cached ${LIST_FILE}" and keep it in .gitignore.`);
  }
  for (const f of files) {
    if (f === LIST_FILE) continue;
    const path = join(root, f);
    if (!existsSync(path)) continue; // deleted in the working tree; nothing to publish from here
    const buf = readFileSync(path);
    if (buf.includes(0)) continue; // binary
    scanText(buf.toString('utf8'), terms, (n) => `${f}:${n}`, problems);
  }
}

function scanHistory(root, terms, problems) {
  try {
    git(['rev-parse', '--verify', '-q', 'HEAD'], root);
  } catch {
    return; // no commits yet
  }
  const log = git(['log', '--format=%h%x00%B%x1e', 'HEAD'], root);
  for (const entry of log.split('\x1e')) {
    const [hash, body] = entry.replace(/^\n/, '').split('\0');
    if (!hash || body === undefined) continue;
    scanText(body, terms, (n) => `commit ${hash}, message line ${n}`, problems);
  }
}

function scanMessageFile(file, terms, problems) {
  // git removes "#" comment lines from the message, so they are not checked.
  const text = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => (l.startsWith('#') ? '' : l))
    .join('\n');
  scanText(text, terms, (n) => `commit message, line ${n}`, problems);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  const { terms, source } = loadTerms(root);

  if (terms.length === 0) {
    if (opts.require) {
      console.error(`check-private-terms: no private terms configured. Set the PRIVATE_TERMS secret, or create ${LIST_FILE}.`);
      process.exit(1);
    }
    console.log('check-private-terms: no private terms configured');
    process.exit(0);
  }

  const problems = [];
  if (opts.messageFile) {
    scanMessageFile(opts.messageFile, terms, problems);
  } else {
    scanFiles(root, terms, problems);
    scanHistory(root, terms, problems);
  }

  if (problems.length === 0) {
    console.log(`check-private-terms: OK (${terms.length} terms from ${source})`);
    process.exit(0);
  }
  for (const p of problems) console.error(p);
  console.error(
    `check-private-terms: ${problems.length} match(es). Remove each one, then run again. ` +
      `The terms are numbered as in ${source}; they are not printed.`,
  );
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`check-private-terms: ${err.message}`);
  process.exit(1);
}
