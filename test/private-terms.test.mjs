import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, makeRepo, runNode, writeFiles } from './helpers.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-private-terms.mjs', import.meta.url));

// Made-up terms. They exist only inside these tests.
const TERMS = 'zorblax,quindle corp';

const run = (cwd, args = [], env = {}) => runNode(SCRIPT, args, { cwd, env });

function assertNoTermPrinted(output) {
  assert.doesNotMatch(output, /zorblax/i);
  assert.doesNotMatch(output, /quindle corp/i);
}

test('with no list, it says so and passes', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'zorblax\n' } });
  const r = run(root);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /no private terms configured/);
});

test('with no list and --require, it fails', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'hello\n' } });
  const r = run(root, ['--require']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no private terms configured/);
});

test('a clean repo passes', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'sign-in and refunds\n' } });
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /OK \(2 terms from PRIVATE_TERMS\)/);
});

test('a term in a tracked file fails, with file and line, without the term', (t) => {
  const root = makeRepo(t, { files: { 'docs/notes.md': 'line one\nbuilt for Zorblax users\n' } });
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /docs\/notes\.md:2: matches private term #1/);
  assertNoTermPrinted(r.output);
});

test('matching is case-insensitive and finds terms with spaces', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'QUINDLE CORP\n' } });
  const r = run(root, [], { PRIVATE_TERMS: ' Zorblax , Quindle Corp ' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /a\.md:1: matches private term #2/);
});

test('a term matches whole words only', (t) => {
  const root = makeRepo(t, {
    files: { 'a.md': 'zorbify the zorbs\nsnake_zorb\nzorb2\n', 'b.md': 'built on Zorb-based parts\n', 'c.md': 'see (ZORB).\n' },
  });
  const r = run(root, [], { PRIVATE_TERMS: 'zorb' });
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.stderr, /a\.md/);
  assert.match(r.stderr, /b\.md:1: matches private term #1/);
  assert.match(r.stderr, /c\.md:1: matches private term #1/);
});

test('a term with regex characters is matched literally', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'zorb plus\n', 'b.md': 'zorb+ here\n' } });
  const r = run(root, [], { PRIVATE_TERMS: 'zorb+' });
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.stderr, /a\.md/);
  assert.match(r.stderr, /b\.md:1/);
});

test('a term in a commit message fails', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'clean\n' }, message: 'feat: port from zorblax' });
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /commit [0-9a-f]+, message line 1: matches private term #1/);
  assertNoTermPrinted(r.output);
});

test('an untracked file is not checked', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'clean\n' } });
  writeFiles(root, { 'scratch.md': 'zorblax\n' });
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 0, r.output);
});

test('a staged new file is checked', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'clean\n' } });
  writeFiles(root, { 'b.md': 'zorblax\n' });
  git(root, 'add', 'b.md');
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /b\.md:1/);
});

test('binary files are skipped', (t) => {
  const root = makeRepo(t);
  writeFileSync(join(root, 'img.bin'), Buffer.from([0, 1, 2, ...Buffer.from('zorblax')]));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'add binary');
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 0, r.output);
});

test('.private-terms is read, ignores comments, and wins over the environment', (t) => {
  const root = makeRepo(t, { files: { '.gitignore': '.private-terms\n', 'a.md': 'mentions plimbo\n' } });
  writeFiles(root, { '.private-terms': '# local list\n\nplimbo\n' });
  const r = run(root, [], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^a\.md:1: matches private term #1$/m);
  assert.match(r.stderr, /numbered as in \.private-terms/);
  assert.doesNotMatch(r.output, /plimbo/i);
});

test('a tracked .private-terms fails', (t) => {
  const root = makeRepo(t, { files: { '.private-terms': 'plimbo\n', 'a.md': 'clean\n' } });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /the term list is tracked by git/);
});

test('--message-file checks only the message, and skips comment lines', (t) => {
  const root = makeRepo(t, { files: { 'a.md': 'zorblax\n' } });
  const msg = join(root, 'MSG');
  writeFileSync(msg, 'feat: add search\n# Please enter the commit message. zorblax\n');
  assert.equal(run(root, ['--message-file', msg], { PRIVATE_TERMS: TERMS }).code, 0);

  writeFileSync(msg, 'feat: add search\n\nAsked for by Quindle Corp.\n');
  const r = run(root, ['--message-file', msg], { PRIVATE_TERMS: TERMS });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /commit message, line 3: matches private term #2/);
  assertNoTermPrinted(r.output);
});

test('an unknown option fails with a plain message', (t) => {
  const root = makeRepo(t);
  const r = run(root, ['--nope']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown option "--nope"/);
});
