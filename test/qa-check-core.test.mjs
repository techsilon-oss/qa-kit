// Core checks: records (R1–R5), cases (C1–C8), map (M1–M3), links (L1–L6), coverage, all.
//
// Every fixture is test/fixtures/pass with an overlay copied on top: the files in
// test/fixtures/<name>/ replace or add to the passing repo. Each failing fixture
// must raise its own check ID and no other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, runNode } from './helpers.mjs';

const QA_CHECK = fileURLToPath(new URL('../skills/qa-init/templates/scripts/qa-check.mjs', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

function fixture(t, name) {
  const root = mkdtempSync(join(tmpdir(), `qa-kit-${name}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(FIXTURES, 'pass'), root, { recursive: true });
  if (name !== 'pass') cpSync(join(FIXTURES, name), root, { recursive: true });
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  return root;
}

function qaCheck(root, ...args) {
  const r = runNode(QA_CHECK, [...args, '--root', root], { cwd: root });
  const problems = r.stderr
    .split(/\r?\n/)
    .map((l) => /^([A-Z]\d+) {2}(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ id: m[1], text: m[2] }));
  return { ...r, problems };
}

// ── The passing repo ─────────────────────────────────────────────────────────

for (const command of ['records', 'cases', 'map', 'links', 'all']) {
  test(`pass: qa-check ${command} passes`, (t) => {
    const r = qaCheck(fixture(t, 'pass'), command);
    assert.equal(r.code, 0, r.output);
    assert.match(r.stdout, new RegExp(`qa-check ${command}: OK`));
  });
}

// ── Passing edge cases ───────────────────────────────────────────────────────

const PASSING = [
  ['pass-R1-draft-no-date', 'records', 'a draft needs no last_verified key'],
  ['pass-R4-apostrophe', 'records', "curly apostrophes, closing #'s and extra sections are fine"],
  ['pass-M2-draft', 'map', 'a draft record may map from no code'],
  ['pass-M3-exception', 'map', 'a path in mustMapExceptions needs no record'],
  ['pass-M3-test-file', 'map', 'a test file needs no record'],
  ['pass-L-automation-off', 'all', 'with the automation module off, links are not checked'],
];

for (const [name, command, why] of PASSING) {
  test(`${name}: ${why}`, (t) => {
    const r = qaCheck(fixture(t, name), command);
    assert.equal(r.code, 0, r.output);
  });
}

// ── Failing fixtures: one per check ID, sometimes more ───────────────────────

const FAILING = [
  ['fail-R1', 'records', 'R1', /no "title" key/],
  ['fail-R2', 'records', 'R2', /id is "signin", but the file name gives "sign-in"/],
  ['fail-R3-empty-date', 'records', 'R3', /active but last_verified is empty/],
  ['fail-R3-bad-date', 'records', 'R3', /"2026-02-30", not a valid date/],
  ['fail-R3-dated-draft', 'records', 'R3', /draft but has last_verified/],
  ['fail-R3-bad-status', 'records', 'R3', /status is "live"/],
  ['fail-R4-missing', 'records', 'R4', /"## Rules" is missing/],
  ['fail-R4-order', 'records', 'R4', /"## Who can do what" comes before "## Rules"/],
  ['fail-R5', 'records', 'R5', /search\.md: The record has no case file/],
  ['fail-C1', 'cases', 'C1', /feature is "signin"/],
  ['fail-C2-pattern', 'cases', 'C2', /case ID is "sign-3"/],
  ['fail-C2-prefix', 'cases', 'C2', /prefix "LOGIN", but the record sets case_prefix "SIGN"/],
  ['fail-C3', 'cases', 'C3', /sign-in\.cases\.yaml SIGN-01: The case ID SIGN-01 is already used in docs\/features\/refunds\.cases\.yaml/],
  ['fail-C4', 'cases', 'C4', /priority is "P3"|title is missing/],
  ['fail-C5', 'cases', 'C5', /SIGN-02: type is automated, but automated_by is empty/],
  ['fail-C6', 'cases', 'C6', /expected is read as a number, not text\. Quote it in the YAML|has no action|expected is read as a map/],
  ['fail-C7-empty', 'cases', 'C7', /has no cases/],
  ['fail-C7-yaml', 'cases', 'C7', /not valid YAML/],
  ['fail-C8', 'cases', 'C8', /search\.cases\.yaml: The case file has no matching record\. Create docs\/features\/search\.md/],
  ['fail-M1', 'map', 'M1', /names docs\/features\/sign-up\.md, which does not exist/],
  ['fail-M2', 'map', 'M2', /search\.md: The record maps from no code\. No mapping names it/],
  ['fail-M2-no-code', 'map', 'M2', /Its mappings match no tracked file/],
  ['fail-M3', 'map', 'M3', /src\/search\/index\.ts: The file matches mustMap but maps to no record/],
  ['fail-L1', 'links', 'L1', /^e2e\/smoke\/sign-in\.spec\.ts:25: The test "signs out" names no case ID at the start of its title/],
  ['fail-L2', 'links', 'L2', /The test names SIGN-09, which is in no case file/],
  ['fail-L3', 'links', 'L3', /proves SIGN-03, but the case has type manual in docs\/features\/sign-in\.cases\.yaml/],
  ['fail-L3-retired', 'links', 'L3', /proves REF-02, but the case is retired/],
  ['fail-L4', 'links', 'L4', /proves SIGN-02, but its automated_by in docs\/features\/sign-in\.cases\.yaml does not name e2e\/smoke\/sign-in\.spec\.ts/],
  ['fail-L5', 'links', 'L5', /SIGN-06: automated_by names e2e\/smoke\/sign-out\.spec\.ts, which does not exist/],
  ['fail-L6', 'links', 'L6', /SIGN-06: automated_by names e2e\/smoke\/sign-in\.spec\.ts, but no test there starts with SIGN-06/],
];

for (const [name, command, id, message] of FAILING) {
  test(`${name}: qa-check ${command} fails with ${id} only`, (t) => {
    const r = qaCheck(fixture(t, name), command);
    assert.equal(r.code, 1, r.output);
    assert.ok(r.problems.length > 0, `no problems parsed from:\n${r.output}`);
    for (const p of r.problems) assert.equal(p.id, id, `unexpected problem: ${p.id}  ${p.text}`);
    for (const p of r.problems) assert.match(p.text, message);
  });
}

test('fail-C4 and fail-C6 report each bad key and step', (t) => {
  const c4 = qaCheck(fixture(t, 'fail-C4'), 'cases');
  assert.equal(c4.problems.length, 2, c4.output);
  const c6 = qaCheck(fixture(t, 'fail-C6'), 'cases');
  assert.equal(c6.problems.length, 3, c6.output);
});

test('every check ID R1–R5, C1–C8, M1–M3, L1–L6 has a failing fixture', () => {
  const covered = new Set(FAILING.map(([, , id]) => id));
  const ids = [1, 2, 3, 4, 5].map((n) => `R${n}`).concat([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `C${n}`), ['M1', 'M2', 'M3'], [1, 2, 3, 4, 5, 6].map((n) => `L${n}`));
  for (const id of ids) assert.ok(covered.has(id), `${id} has no failing fixture`);
});

// ── all ──────────────────────────────────────────────────────────────────────

test('all runs records, cases, map and links together', (t) => {
  const root = fixture(t, 'fail-M3');
  cpSync(join(FIXTURES, 'fail-R2'), root, { recursive: true });
  cpSync(join(FIXTURES, 'fail-L1'), root, { recursive: true });
  writeFileSync(join(root, 'docs/features/sign-in.cases.yaml'), readFileSync(join(root, 'docs/features/sign-in.cases.yaml'), 'utf8').replace('feature: sign-in', 'feature: signin'));
  git(root, 'add', '-A');
  const r = qaCheck(root, 'all');
  assert.equal(r.code, 1);
  assert.deepEqual([...new Set(r.problems.map((p) => p.id))].sort(), ['C1', 'L1', 'M3', 'R2']);
  assert.match(r.stderr, /qa-check all: 4 problems\./);
});

test('links is skipped when the automation module is off', (t) => {
  const r = qaCheck(fixture(t, 'pass-L-automation-off'), 'links');
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /the automation module is off; nothing to check/);
});

// ── coverage ─────────────────────────────────────────────────────────────────

test('coverage prints the table, marks drafts, and skips retired cases', (t) => {
  const r = qaCheck(fixture(t, 'pass'), 'coverage');
  assert.equal(r.code, 0);
  assert.equal(
    r.stdout.trim(),
    [
      '| Feature | Cases | Manual | API | Automated: unit/API | Automated: browser | P0 cases not automated |',
      '|---|---:|---:|---:|---:|---:|---|',
      '| refunds (draft) | 1 | 0 | 1 | 0 | 0 | — |',
      '| sign-in | 5 | 1 | 1 | 1 | 2 | SIGN-03, SIGN-04 |',
      '| **Total** | 6 | 1 | 2 | 1 | 2 | 2 |',
      '',
      'Draft records: 1. Baseline: 0 paths.',
    ].join('\n'),
  );
});

test('coverage never fails, even on a broken case file', (t) => {
  const r = qaCheck(fixture(t, 'fail-C7-yaml'), 'coverage');
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /\| sign-in \| 0 \|/);
});

// ── Usage ────────────────────────────────────────────────────────────────────

test('without qa-kit.json, it points to /qa-init', (t) => {
  const root = fixture(t, 'pass');
  unlinkSync(join(root, 'qa-kit.json'));
  const r = qaCheck(root, 'records');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /qa-kit\.json not found .* Run \/qa-init/);
});

test('an unknown command prints the usage', (t) => {
  const r = qaCheck(fixture(t, 'pass'), 'nope');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown command "nope"\. Usage:/);
});

test('without a code map, map says how to create one', (t) => {
  const root = fixture(t, 'pass');
  unlinkSync(join(root, 'scripts/source-doc-map.json'));
  const r = qaCheck(root, 'map');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /M1 {2}scripts\/source-doc-map\.json: The code map does not exist/);
});

// ── The installed docs/features/README.md ────────────────────────────────────

test('the README template lists the default required sections, in order', () => {
  const readme = readFileSync(fileURLToPath(new URL('../skills/qa-init/templates/docs/features/README.md', import.meta.url)), 'utf8');
  const source = readFileSync(QA_CHECK, 'utf8');
  const block = /requiredSections: \[([\s\S]*?)\]/.exec(source)[1];
  const sections = [...block.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
  assert.equal(sections.length, 9);
  let at = readme.indexOf('Write these sections');
  for (const s of sections) {
    const next = readme.indexOf(`. ${s}\n`, at);
    assert.ok(next > at, `"${s}" is missing or out of order in the README template`);
    at = next;
  }
});
