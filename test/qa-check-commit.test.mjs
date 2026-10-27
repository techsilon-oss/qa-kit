// Commit-time coupling: qa-check commit-msg (K1, K2, K4).
//
// Each test builds a real git repo from test/fixtures/pass, commits it, changes
// and stages files, and runs the check against a commit message file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { cleanEnv, git, runNode } from './helpers.mjs';

const QA_CHECK = fileURLToPath(new URL('../skills/qa-init/templates/scripts/qa-check.mjs', import.meta.url));
const PASS = fileURLToPath(new URL('./fixtures/pass/', import.meta.url));
const SIGN_CASES = 'docs/features/sign-in.cases.yaml';
const REF_CASES = 'docs/features/refunds.cases.yaml';

function initRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'qa-kit-commit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(PASS, root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(root, 'config', k, v);
  }
  return root;
}

function repo(t) {
  const root = initRepo(t);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'initial');
  return root;
}

function append(root, rel, text) {
  writeFileSync(join(root, rel), readFileSync(join(root, rel), 'utf8') + text);
}

function editCases(root, rel, fn) {
  const data = parse(readFileSync(join(root, rel), 'utf8'));
  fn(data.cases, data);
  writeFileSync(join(root, rel), stringify(data));
}

const byId = (cases, id) => cases.find((c) => c.id === id);

function check(root, message = 'feat: a change') {
  const file = join(root, '.git', 'QA_TEST_MSG');
  writeFileSync(file, message);
  const r = runNode(QA_CHECK, ['commit-msg', file, '--root', root], { cwd: root });
  const problems = r.stderr
    .split(/\r?\n/)
    .map((l) => /^(K\d) {2}(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ id: m[1], text: m[2] }));
  return { ...r, problems };
}

function assertBlocked(r, id, pattern) {
  assert.equal(r.code, 1, r.output);
  assert.ok(r.problems.length > 0, r.output);
  for (const p of r.problems) assert.equal(p.id, id, `unexpected: ${p.id}  ${p.text}`);
  if (pattern) assert.ok(r.problems.some((p) => pattern.test(p.text)), r.output);
}

function assertPasses(r) {
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /qa-check commit-msg: (OK|merge commit; skipped)/);
}

// ── K1 ───────────────────────────────────────────────────────────────────────

test('K1 fails: staged code without its record', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  git(root, 'add', '-A');
  const r = check(root);
  assertBlocked(r, 'K1', /^docs\/features\/sign-in\.md: The commit changes src\/sign-in\/index\.ts, which maps to this record, but the record is not staged\. Stage it, or add "Docs-Reviewed: docs\/features\/sign-in\.md — <reason>"/);
  assert.equal(r.problems.length, 1);
});

test('K1 passes: the record is staged; the case file gets a reminder, not a block', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  append(root, 'docs/features/sign-in.md', '- 1.1: note the change.\n');
  git(root, 'add', '-A');
  const r = check(root);
  assertPasses(r);
  assert.match(r.stdout, /note: the commit changes src\/sign-in\/index\.ts, which maps to docs\/features\/sign-in\.cases\.yaml\. Check that its cases still hold\./);
});

test('K1 passes with no reminder when the record and the case file are staged', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  append(root, 'docs/features/sign-in.md', '- 1.1: note the change.\n');
  append(root, SIGN_CASES, '# reviewed\n');
  git(root, 'add', '-A');
  const r = check(root);
  assertPasses(r);
  assert.doesNotMatch(r.stdout, /note:/);
});

for (const dash of ['—', '–', '-']) {
  test(`K1 passes: a Docs-Reviewed trailer with a "${dash}" and a real reason`, (t) => {
    const root = repo(t);
    append(root, 'src/sign-in/index.ts', '// change\n');
    git(root, 'add', '-A');
    assertPasses(check(root, `fix: log message\n\nDocs-Reviewed: docs/features/sign-in.md ${dash} only a log line changed\n`));
  });
}

test('K1 fails: a reason shorter than 10 characters', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  git(root, 'add', '-A');
  assertBlocked(check(root, 'fix: x\n\nDocs-Reviewed: docs/features/sign-in.md — ok\n'), 'K1', /The reason in "Docs-Reviewed: docs\/features\/sign-in\.md — ok" is too short/);
});

test('K1 fails: the trailer names another record', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  git(root, 'add', '-A');
  assertBlocked(check(root, 'fix: x\n\nDocs-Reviewed: docs/features/refunds.md — not related to this change\n'), 'K1', /sign-in\.md/);
});

test('K1 fails: a trailer in a comment line does not count', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  git(root, 'add', '-A');
  assertBlocked(check(root, 'fix: x\n# Docs-Reviewed: docs/features/sign-in.md — only a log line changed\n'), 'K1');
});

test('K1 applies per record: one trailer does not cover two records', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/index.ts', '// change\n');
  append(root, 'src/refunds/index.ts', '// change\n');
  git(root, 'add', '-A');
  const r = check(root, 'fix: x\n\nDocs-Reviewed: docs/features/sign-in.md — only a log line changed\n');
  assertBlocked(r, 'K1', /^docs\/features\/refunds\.md: The commit changes src\/refunds\/index\.ts/);
  assert.equal(r.problems.length, 1);
});

test('K1 passes: a test file is not code', (t) => {
  const root = repo(t);
  append(root, 'src/sign-in/password.test.ts', '// more\n');
  git(root, 'add', '-A');
  assertPasses(check(root));
});

test('K1 reads the staged code map', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'src/sign-in/extra.ts'), 'export {};\n');
  const map = JSON.parse(readFileSync(join(root, 'scripts/source-doc-map.json'), 'utf8'));
  map.mappings[0].source = ['src/sign-in/index.ts']; // extra.ts no longer maps to sign-in
  writeFileSync(join(root, 'scripts/source-doc-map.json'), JSON.stringify(map));
  git(root, 'add', '-A');
  assertPasses(check(root));
});

// ── K2 ───────────────────────────────────────────────────────────────────────

test('K2 fails: a browser-linked case changes its steps, and the spec is not staged', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-01').steps[0].expected = 'The dashboard opens.';
  });
  git(root, 'add', '-A');
  assertBlocked(check(root), 'K2', /^docs\/features\/sign-in\.cases\.yaml SIGN-01: The commit changes its steps, but the linked test e2e\/smoke\/sign-in\.spec\.ts is not staged\. Stage it, or add "Test-Reviewed: SIGN-01 — <reason>"/);
});

test('K2 fails: a title or precondition change counts too', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    const c = byId(cases, 'SIGN-01');
    c.title = 'A visitor signs in';
    c.preconditions = ['The account exists.'];
  });
  git(root, 'add', '-A');
  assertBlocked(check(root), 'K2', /changes its title, its preconditions/);
});

test('K2 fails: removing the browser link counts as a change', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    const c = byId(cases, 'SIGN-01');
    c.type = 'manual';
    delete c.automated_by;
  });
  git(root, 'add', '-A');
  assertBlocked(check(root), 'K2', /changes its browser link/);
});

test('K2 passes: the linked spec is staged', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-01').steps[0].expected = 'The dashboard opens.';
  });
  append(root, 'e2e/smoke/sign-in.spec.ts', '// expects the dashboard\n');
  git(root, 'add', '-A');
  assertPasses(check(root));
});

test('K2 passes: a Test-Reviewed trailer with a reason', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-01').steps[0].expected = 'The home page opens, with the visitor name.';
  });
  git(root, 'add', '-A');
  assertPasses(check(root, 'docs: reword\n\nTest-Reviewed: SIGN-01 — the test already checks the name\n'));
});

test('K2 passes: a change to a case with no browser link', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-02').steps[0].expected = 'The form says: at least 10 characters.';
  });
  git(root, 'add', '-A');
  assertPasses(check(root));
});

test('K2 passes: a change outside title, preconditions and steps', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-01').tags = ['smoke'];
  });
  git(root, 'add', '-A');
  assertPasses(check(root));
});

test('K2 passes: a new case file has nothing at HEAD', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'docs/features/search.cases.yaml'), stringify({
    feature: 'search',
    cases: [{ id: 'SRCH-01', title: 'Find an order', priority: 'P1', type: 'automated', automated_by: 'e2e/search.spec.ts', steps: [{ action: 'Search.', expected: 'Found.' }] }],
  }));
  git(root, 'add', '-A');
  assertPasses(check(root));
});

// ── K4 ───────────────────────────────────────────────────────────────────────

test('K4 fails: a case is removed', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    cases.splice(cases.findIndex((c) => c.id === 'SIGN-03'), 1);
  });
  git(root, 'add', '-A');
  assertBlocked(check(root), 'K4', /^docs\/features\/sign-in\.cases\.yaml SIGN-03: The commit removes the case SIGN-03\. Cases are never deleted: restore it and set "status: retired" on it instead\./);
});

test('K4 fails: a case file is deleted', (t) => {
  const root = repo(t);
  git(root, 'rm', '-q', REF_CASES);
  const r = check(root);
  assertBlocked(r, 'K4');
  assert.deepEqual(r.problems.map((p) => p.text.split(':')[0]), [`${REF_CASES} REF-01`, `${REF_CASES} REF-02`]);
});

test('K4 fails: a staged case file that does not parse', (t) => {
  const root = repo(t);
  append(root, SIGN_CASES, '  - id: [broken\n');
  git(root, 'add', '-A');
  assertBlocked(check(root), 'K4', /not valid YAML .* K4 cannot check that no case was removed/);
});

test('K4 passes: a retired case stays', (t) => {
  const root = repo(t);
  editCases(root, SIGN_CASES, (cases) => {
    byId(cases, 'SIGN-03').status = 'retired';
  });
  git(root, 'add', '-A');
  assertPasses(check(root));
});

test('K4 passes: a case moves to another case file', (t) => {
  const root = repo(t);
  let moved;
  editCases(root, SIGN_CASES, (cases) => {
    moved = cases.splice(cases.findIndex((c) => c.id === 'SIGN-03'), 1)[0];
  });
  editCases(root, REF_CASES, (cases) => cases.push(moved));
  git(root, 'add', '-A');
  assertPasses(check(root));
});

// ── Whole-commit behaviour ───────────────────────────────────────────────────

test('the first commit passes K2 and K4, and K1 still applies', (t) => {
  const root = initRepo(t);
  git(root, 'add', '-A');
  assertPasses(check(root));

  git(root, 'rm', '-q', '--cached', 'docs/features/sign-in.md');
  assertBlocked(check(root), 'K1', /sign-in\.md/);
});

test('a merge commit is skipped', (t) => {
  const root = repo(t);
  git(root, 'checkout', '-q', '-b', 'topic');
  append(root, 'src/sign-in/index.ts', '// change on topic\n');
  git(root, 'commit', '-q', '-am', 'topic change');
  git(root, 'checkout', '-q', 'main');
  append(root, 'src/refunds/index.ts', '// change on main\n');
  append(root, 'docs/features/refunds.md', '- note\n');
  git(root, 'commit', '-q', '-am', 'main change');
  git(root, 'merge', '-q', '--no-ff', '--no-commit', 'topic');
  const r = check(root);
  assertPasses(r);
  assert.match(r.stdout, /merge commit; skipped/);
});

test('commit-msg without a message file says what it needs', (t) => {
  const root = repo(t);
  const r = runNode(QA_CHECK, ['commit-msg', '--root', root], { cwd: root });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /commit-msg needs the commit message file/);
});

test('installed as a real commit-msg hook, it blocks and lets through', (t) => {
  const root = repo(t);
  const node = process.execPath.replace(/\\/g, '/');
  const hook = join(root, '.git', 'hooks', 'commit-msg');
  writeFileSync(hook, `#!/bin/sh\nexec "${node}" "${QA_CHECK.replace(/\\/g, '/')}" commit-msg "$1"\n`);
  chmodSync(hook, 0o755);
  const commit = (msg) => spawnSync('git', ['commit', '-q', '-m', msg], { cwd: root, encoding: 'utf8', env: cleanEnv() });

  append(root, 'src/sign-in/index.ts', '// change\n');
  git(root, 'add', '-A');
  const blocked = commit('feat: change sign-in');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /K1 {2}docs\/features\/sign-in\.md/);

  const ok = commit('feat: change sign-in\n\nDocs-Reviewed: docs/features/sign-in.md — internal refactor, same behaviour');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(git(root, 'log', '-1', '--format=%s'), /feat: change sign-in/);
});

test('every check ID K1, K2, K4 has a passing and a failing test', () => {
  const names = readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/test\(`?'?(K\d) (fails|passes)/g) ?? [];
  for (const id of ['K1', 'K2', 'K4']) {
    for (const kind of ['fails', 'passes']) {
      assert.ok(names.some((n) => n.includes(`${id} ${kind}`)), `${id} has no "${kind}" test`);
    }
  }
});
