#!/usr/bin/env node
// qa-check — QA Kit's checks. Vendored into a repo by /qa-init. Fix bugs in
// techsilon-oss/qa-kit, never in a copy.
//
// Usage (from the repo root):
//   node scripts/qa-check.mjs records     feature records (R1–R5)
//   node scripts/qa-check.mjs cases       case files (C1–C8)
//   node scripts/qa-check.mjs map         the code → record map (M1–M3)
//   node scripts/qa-check.mjs links       browser tests ↔ cases (L1–L6), when the automation module is on
//   node scripts/qa-check.mjs coverage    a Markdown coverage table; never fails
//   node scripts/qa-check.mjs all         records, cases, map, and links when the automation module is on
//   node scripts/qa-check.mjs commit-msg <file>
//                                         commit-time coupling (K1, K2, K4); run it
//                                         from the commit-msg hook with the hook's $1
//
// Options:
//   --root <dir>   the repo root (default: the current directory)
//
// Settings come from qa-kit.json at the repo root. The spec is docs/SPEC.md in
// techsilon-oss/qa-kit. Exit code: 0 when every check passes, 1 on any problem.
//
// Dependencies: Node 22+ built-ins, git, and the "yaml" package.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ── Settings ─────────────────────────────────────────────────────────────────

const MANIFEST = 'qa-kit.json';

const DEFAULT_SETTINGS = {
  featuresDir: 'docs/features',
  casesSuffix: '.cases.yaml',
  caseIdPattern: '^[A-Z]{2,5}-\\d{2,3}$',
  records: {
    frontmatterKeys: {
      id: 'id',
      title: 'title',
      version: 'version',
      lastVerified: 'last_verified',
      casePrefix: 'case_prefix',
      owner: 'owner',
      status: 'status',
    },
    requiredSections: [
      'What it does',
      'Rules',
      'Who can do what',
      'How it works',
      'Edge cases and known limits',
      "Where it's configured",
      'How to test',
      'Where it lives',
      'Decisions and history',
    ],
    readme: 'README.md',
  },
  codeMap: 'scripts/source-doc-map.json',
  mustMap: [],
  mustMapExceptions: [],
  // Test files are not code: M3 and K1 skip them. Globs, matched against the file name.
  testFilePatterns: ['*.test.*', '*.spec.*'],
  baseline: 'qa-baseline.json',
  trailers: { recordReviewed: 'Docs-Reviewed', testReviewed: 'Test-Reviewed' },
};

const RECORD_STATUSES = ['active', 'draft', 'retired'];
const PRIORITIES = ['P0', 'P1', 'P2'];
const CASE_TYPES = ['manual', 'api', 'automated'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mergeDeep(base, over) {
  if (!isPlainObject(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? mergeDeep(base[k], v) : v;
  }
  return out;
}

class UsageError extends Error {}

function loadConfig(root) {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) {
    throw new UsageError(`${MANIFEST} not found in ${root}. Run /qa-init to install QA Kit, or run qa-check from the repo root.`);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new UsageError(`${MANIFEST} is not valid JSON: ${err.message}. Fix the syntax.`);
  }
  const settings = mergeDeep(DEFAULT_SETTINGS, manifest.settings);
  const automation = manifest.modules?.automation ?? {};
  return {
    root,
    settings,
    caseIdRe: new RegExp(settings.caseIdPattern),
    automation: {
      enabled: automation.enabled === true,
      specGlob: automation.specGlob ?? null,
      unlinkedDirs: toList(automation.unlinkedDirs).filter((d) => typeof d === 'string'),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// The glob rules of the code → doc map, shared with govkit:
// "**" matches any run of characters, "/" included; "*" matches any run without "/".
function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

function isTestFile(cfg, path) {
  return matchesAny(path.slice(path.lastIndexOf('/') + 1), cfg.settings.testFilePatterns);
}

// A path in automated_by that matches the automation module's specGlob is a browser link.
function isBrowserSpec(cfg, path) {
  return cfg.automation.specGlob !== null && matchesAny(path, [cfg.automation.specGlob]);
}

function toList(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function isValidDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function normalizeHeading(text) {
  return text.replace(/\s+#+\s*$/, '').replace(/[‘’]/g, "'").trim();
}

function trackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  } catch {
    throw new UsageError(`${root} is not a git repository. The map check reads tracked files with "git ls-files".`);
  }
}

// ── Loading records and case files ───────────────────────────────────────────

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return { error: 'no frontmatter' };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { error: 'the frontmatter has no closing "---" line' };
  let data;
  try {
    data = parseYaml(lines.slice(1, end).join('\n'));
  } catch (err) {
    return { error: `the frontmatter is not valid YAML (${err.message.split('\n')[0]})` };
  }
  if (data === null || data === undefined) data = {};
  if (!isPlainObject(data)) return { error: 'the frontmatter is not a list of "key: value" lines' };
  return { data, body: lines.slice(end + 1), bodyStart: end + 2 };
}

function loadFeatures(cfg) {
  const { root, settings } = cfg;
  const dirRel = settings.featuresDir.replace(/\/+$/, '');
  const dir = join(root, dirRel);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const records = [];
  const caseFiles = [];
  for (const name of names) {
    const rel = `${dirRel}/${name}`;
    if (name.endsWith(settings.casesSuffix)) {
      caseFiles.push(loadCaseFile(cfg, rel, name.slice(0, -settings.casesSuffix.length)));
    } else if (name.endsWith('.md') && name !== settings.records.readme) {
      records.push(loadRecord(cfg, rel, name.slice(0, -'.md'.length)));
    }
  }
  return { dirRel, records, caseFiles };
}

function loadRecord(cfg, rel, featureId) {
  const keys = cfg.settings.records.frontmatterKeys;
  const fm = parseFrontmatter(readText(join(cfg.root, rel)));
  const record = { rel, featureId, fm };
  if (!fm.error) {
    const status = fm.data[keys.status];
    record.status = isBlank(status) ? 'active' : String(status);
    record.title = fm.data[keys.title];
    record.casePrefix = isBlank(fm.data[keys.casePrefix]) ? null : String(fm.data[keys.casePrefix]);
  }
  return record;
}

function loadCaseFile(cfg, rel, featureId) {
  const file = { rel, featureId, data: null, error: null };
  try {
    file.data = parseYaml(readText(join(cfg.root, rel)));
  } catch (err) {
    file.error = err.message.split('\n')[0];
  }
  return file;
}

function casesOf(file) {
  return isPlainObject(file.data) && Array.isArray(file.data.cases) ? file.data.cases : [];
}

function splitLinks(automatedBy) {
  if (typeof automatedBy !== 'string') return [];
  return automatedBy
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Problems ─────────────────────────────────────────────────────────────────

class Report {
  constructor() {
    this.problems = [];
  }
  add(id, where, message) {
    this.problems.push({ id, where, message });
  }
}

// ── records: R1–R5 ───────────────────────────────────────────────────────────

function checkRecords(cfg, features, report) {
  const { settings } = cfg;
  const keys = settings.records.frontmatterKeys;
  const caseFileIds = new Set(features.caseFiles.map((f) => f.featureId));

  for (const r of features.records) {
    if (r.fm.error) {
      report.add('R1', r.rel, `The record has ${r.fm.error}. Start the file with a "---" line, the keys ${keys.id}, ${keys.title}, ${keys.version} and ${keys.lastVerified}, and a closing "---" line.`);
    } else {
      const d = r.fm.data;
      const required = [keys.id, keys.title, keys.version];
      if (r.status === 'active') required.push(keys.lastVerified);
      for (const k of required) {
        if (!(k in d)) report.add('R1', r.rel, `The frontmatter has no "${k}" key. Add it.`);
        else if (k !== keys.lastVerified && isBlank(d[k])) report.add('R1', r.rel, `The frontmatter key "${k}" is empty. Give it a value.`);
      }

      if (keys.id in d && !isBlank(d[keys.id]) && String(d[keys.id]) !== r.featureId) {
        report.add('R2', r.rel, `${keys.id} is "${d[keys.id]}", but the file name gives "${r.featureId}". Make them equal: change ${keys.id}, or rename the file.`);
      }

      const lv = d[keys.lastVerified];
      if (!RECORD_STATUSES.includes(r.status)) {
        report.add('R3', r.rel, `${keys.status} is "${r.status}". Use active, draft or retired.`);
      } else if (r.status === 'active' && keys.lastVerified in d) {
        if (isBlank(lv)) report.add('R3', r.rel, `The record is active but ${keys.lastVerified} is empty. Check the record against the code and set the date (YYYY-MM-DD), or set ${keys.status}: draft.`);
        else if (!isValidDate(lv)) report.add('R3', r.rel, `${keys.lastVerified} is "${lv}", not a valid date. Write it as YYYY-MM-DD.`);
      } else if (r.status === 'draft' && !isBlank(lv)) {
        report.add('R3', r.rel, `The record is a draft but has ${keys.lastVerified} "${lv}". A draft is unverified: clear the date, or verify the record and set ${keys.status}: active.`);
      }

      checkSections(r, settings.records.requiredSections, report);
    }

    if (!caseFileIds.has(r.featureId)) {
      report.add('R5', r.rel, `The record has no case file. Create ${features.dirRel}/${r.featureId}${settings.casesSuffix}.`);
    }
  }
}

function checkSections(record, required, report) {
  const headings = [];
  let inFence = false;
  for (const line of record.fm.body) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = /^##\s+(.+)$/.exec(line);
      if (m) headings.push(normalizeHeading(m[1]));
    }
  }
  const wanted = required.map(normalizeHeading);
  const missing = wanted.filter((w) => !headings.includes(w));
  for (const w of missing) report.add('R4', record.rel, `The section "## ${w}" is missing. Add it.`);
  if (missing.length > 0) return;
  const order = wanted.map((w) => headings.indexOf(w));
  for (let i = 1; i < order.length; i++) {
    if (order[i] < order[i - 1]) {
      report.add('R4', record.rel, `The section "## ${wanted[i]}" comes before "## ${wanted[i - 1]}". Put the sections in this order: ${wanted.join(', ')}.`);
      return;
    }
  }
}

// ── cases: C1–C8 ─────────────────────────────────────────────────────────────

function checkCases(cfg, features, report) {
  const { settings, caseIdRe } = cfg;
  const recordsById = new Map(features.records.map((r) => [r.featureId, r]));
  const seen = new Map(); // case ID → case file

  for (const f of features.caseFiles) {
    if (!recordsById.has(f.featureId)) {
      report.add('C8', f.rel, `The case file has no matching record. Create ${features.dirRel}/${f.featureId}.md, or rename the case file to match its record.`);
    }
    if (f.error) {
      report.add('C7', f.rel, `The case file is not valid YAML (${f.error}), so no cases can be read. Fix the syntax.`);
      continue;
    }
    if (!isPlainObject(f.data)) {
      report.add('C7', f.rel, 'The case file is empty or not a YAML map. It needs "feature:" and a "cases:" list.');
      continue;
    }

    if (String(f.data.feature ?? '') !== f.featureId) {
      const got = isBlank(f.data.feature) ? 'missing' : `"${f.data.feature}"`;
      report.add('C1', f.rel, `feature is ${got}, but the file name gives "${f.featureId}". Set feature: ${f.featureId}.`);
    }

    const cases = f.data.cases;
    if (!Array.isArray(cases) || cases.length === 0) {
      report.add('C7', f.rel, 'The case file has no cases. Add at least one case under "cases:".');
      continue;
    }

    const prefix = recordsById.get(f.featureId)?.casePrefix ?? null;
    cases.forEach((c, i) => checkCase(cfg, f, c, i, prefix, seen, report));
  }
}

function checkCase(cfg, file, c, index, prefix, seen, report) {
  const where = `${file.rel} case ${index + 1}`;
  if (!isPlainObject(c)) {
    report.add('C4', where, 'The case is not a YAML map. Write it as "- id: …" followed by its keys.');
    return;
  }
  const label = typeof c.id === 'string' && c.id ? `${file.rel} ${c.id}` : where;

  // C2: the ID and its prefix.
  if (typeof c.id !== 'string' || !cfg.caseIdRe.test(c.id)) {
    const got = c.id === undefined ? 'missing' : `"${c.id}"`;
    report.add('C2', label, `The case ID is ${got}. It must match ${cfg.settings.caseIdPattern}, for example SIGN-01.`);
  } else {
    if (prefix && c.id.split('-')[0] !== prefix) {
      report.add('C2', label, `The case ID uses the prefix "${c.id.split('-')[0]}", but the record sets case_prefix "${prefix}". Use ${prefix}-…`);
    }
    // C3: unique across the repo.
    if (seen.has(c.id)) {
      report.add('C3', label, `The case ID ${c.id} is already used in ${seen.get(c.id)}. Give this case a new ID; IDs are never reused.`);
    } else {
      seen.set(c.id, file.rel);
    }
  }

  // C4: required keys.
  if (typeof c.title !== 'string' || c.title.trim() === '') report.add('C4', label, 'title is missing or empty. Add a title that names the behaviour.');
  if (!PRIORITIES.includes(c.priority)) report.add('C4', label, `priority is ${c.priority === undefined ? 'missing' : `"${c.priority}"`}. Use P0, P1 or P2.`);
  if (!CASE_TYPES.includes(c.type)) report.add('C4', label, `type is ${c.type === undefined ? 'missing' : `"${c.type}"`}. Use manual, api or automated.`);
  if (!Array.isArray(c.steps) || c.steps.length === 0) report.add('C4', label, 'steps is missing or empty. Add at least one step with an action and an expected result.');

  // C5: a non-manual case names what runs it. A retired case has its links removed.
  if ((c.type === 'api' || c.type === 'automated') && c.status !== 'retired' && isBlank(c.automated_by)) {
    report.add('C5', label, `type is ${c.type}, but automated_by is empty. Name the test file or script that runs this case.`);
  }

  // C6: each step has a plain-string action and expected.
  if (Array.isArray(c.steps)) {
    c.steps.forEach((s, j) => {
      const at = `${label} step ${j + 1}`;
      if (!isPlainObject(s)) {
        report.add('C6', at, 'The step is not a map. Write it as "- action: …" and "expected: …".');
        return;
      }
      for (const k of ['action', 'expected']) {
        const v = s[k];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
          report.add('C6', at, `The step has no ${k}. Add it.`);
        } else if (typeof v !== 'string') {
          report.add('C6', at, `${k} is read as ${Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'a map' : `a ${typeof v}`}, not text. Quote it in the YAML.`);
        }
      }
    });
  }
}

// ── map: M1–M3 ───────────────────────────────────────────────────────────────

function loadCodeMap(cfg, report) {
  const rel = cfg.settings.codeMap;
  const path = join(cfg.root, rel);
  if (!existsSync(path)) {
    report.add('M1', rel, 'The code map does not exist, so no code maps to a record. Run /qa-init, or create it as { "mappings": [] }.');
    return null;
  }
  let data;
  try {
    data = JSON.parse(readText(path));
  } catch (err) {
    report.add('M1', rel, `The code map is not valid JSON (${err.message}). Fix the syntax.`);
    return null;
  }
  if (!isPlainObject(data) || !Array.isArray(data.mappings)) {
    report.add('M1', rel, 'The code map has no "mappings" list. Write it as { "mappings": [ { "source": [...], "docs": [...] } ] }.');
    return null;
  }
  return data.mappings.map((m, i) => ({
    index: i,
    source: toList(m?.source).filter((s) => typeof s === 'string'),
    docs: toList(m?.docs).filter((s) => typeof s === 'string'),
  }));
}

function checkMap(cfg, features, report) {
  const { settings, root } = cfg;
  const mappings = loadCodeMap(cfg, report);
  if (!mappings) return;
  const files = trackedFiles(root);
  const dirPrefix = `${features.dirRel}/`;
  const isFeatureDoc = (p) => p.startsWith(dirPrefix) && (p.endsWith('.md') || p.endsWith(settings.casesSuffix)) && p !== dirPrefix + settings.records.readme;
  const recordPaths = new Set(features.records.map((r) => r.rel));

  // M1: every record or case file a mapping names exists.
  for (const m of mappings) {
    for (const doc of m.docs) {
      if (isFeatureDoc(doc) && !existsSync(join(root, doc))) {
        report.add('M1', `${settings.codeMap} mapping ${m.index + 1}`, `It names ${doc}, which does not exist. Create the file, or fix the path.`);
      }
    }
  }

  // M2: every active record maps from code that exists.
  for (const r of features.records) {
    if (r.fm.error || r.status !== 'active') continue;
    const own = mappings.filter((m) => m.docs.includes(r.rel));
    const hasCode = own.some((m) => files.some((f) => matchesAny(f, m.source)));
    if (!hasCode) {
      const why = own.length === 0 ? 'No mapping names it' : 'Its mappings match no tracked file';
      report.add('M2', r.rel, `The record maps from no code. ${why}. Add a mapping in ${settings.codeMap} from the feature's code to this record.`);
    }
  }

  // M3: every tracked file that must be mapped maps to a record.
  const mapsToRecord = (f) => mappings.some((m) => m.docs.some((d) => recordPaths.has(d)) && matchesAny(f, m.source));
  for (const f of files) {
    if (!matchesAny(f, settings.mustMap) || matchesAny(f, settings.mustMapExceptions) || isTestFile(cfg, f)) continue;
    if (!mapsToRecord(f)) {
      report.add('M3', f, `The file matches mustMap but maps to no record. Add it to a mapping in ${settings.codeMap}, or, if it is never a feature, to mustMapExceptions in ${MANIFEST}.`);
    }
  }
}

// ── links: L1–L6 ─────────────────────────────────────────────────────────────

const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

// Read a string literal that starts at src[i] (a quote). Returns { value, end }.
function readString(src, i) {
  const q = src[i];
  let value = '';
  let j = i + 1;
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') {
      value += src[j + 1] ?? '';
      j += 2;
    } else {
      value += src[j];
      j++;
    }
  }
  return { value, end: j + 1 };
}

// Find test declarations: test(, test.only(, test.skip(, test.fixme(, test.fail(,
// test.slow(, followed by a string title. Comments and strings are skipped, so a
// commented-out test or a "test(" inside a string is not a test. test.describe,
// hooks, test.step and a conditional test.skip(condition, "reason") are not tests.
function findTests(src) {
  const tests = [];
  let line = 1;
  let i = 0;
  const lineAt = (from, to) => {
    for (let k = from; k < to; k++) if (src[k] === '\n') line++;
  };
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      lineAt(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      const { end } = readString(src, i);
      lineAt(i, end);
      i = end;
    } else if (c === '\n') {
      line++;
      i++;
    } else if (/[A-Za-z_$]/.test(c) && !/[\w$.]/.test(src[i - 1] ?? '')) {
      const m = /^test(?:\.([A-Za-z]+))?\s*\(\s*(["'`])/.exec(src.slice(i, i + 40));
      if (m && (m[1] === undefined || TEST_MODIFIERS.has(m[1]))) {
        const quoteAt = i + m[0].length - 1;
        lineAt(i, quoteAt);
        const { value, end } = readString(src, quoteAt);
        tests.push({ title: value, line });
        lineAt(quoteAt, end);
        i = end;
      } else {
        const word = /^[\w$]+/.exec(src.slice(i))[0];
        i += word.length;
      }
    } else {
      i++;
    }
  }
  return tests;
}

// The case IDs at the start of a title: "SIGN-01 …" or "SIGN-01, SIGN-02 …".
function titleIds(cfg, title) {
  const inner = cfg.settings.caseIdPattern.replace(/^\^/, '').replace(/\$$/, '');
  const re = new RegExp(`^\\s*((?:${inner})(?:\\s*,\\s*(?:${inner}))*)(?=[\\s:]|$)`);
  const m = re.exec(title);
  return m ? m[1].split(',').map((s) => s.trim()) : [];
}

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function checkLinks(cfg, features, report) {
  const { root } = cfg;
  const { specGlob, unlinkedDirs } = cfg.automation;
  if (!specGlob) {
    throw new UsageError(`The automation module is on but has no specGlob. Set modules.automation.specGlob in ${MANIFEST}, for example "e2e/**/*.spec.ts".`);
  }
  const dirs = unlinkedDirs.map((d) => normalizePath(d).replace(/\/?$/, '/'));
  const specs = trackedFiles(root).filter((f) => matchesAny(f, [specGlob]));
  const linked = specs.filter((f) => !dirs.some((d) => f.startsWith(d)));

  const cases = new Map(); // id → { c, file }
  for (const f of features.caseFiles) {
    for (const c of casesOf(f)) {
      if (isPlainObject(c) && typeof c.id === 'string' && !cases.has(c.id)) cases.set(c.id, { c, file: f.rel });
    }
  }

  const testsByFile = new Map();
  for (const f of specs) testsByFile.set(f, findTests(readText(join(root, f))));

  // L1–L4: every test in a linked file proves cases that exist and name its file.
  for (const f of linked) {
    for (const t of testsByFile.get(f)) {
      const where = `${f}:${t.line}`;
      const ids = titleIds(cfg, t.title);
      if (ids.length === 0) {
        report.add('L1', where, `The test "${t.title}" names no case ID at the start of its title. Start the title with the ID of the case it proves, for example "SIGN-01 …". If it proves no case, add the case first.`);
        continue;
      }
      for (const id of ids) {
        const hit = cases.get(id);
        if (!hit) {
          report.add('L2', where, `The test names ${id}, which is in no case file. Fix the ID, or add the case first.`);
        } else if (hit.c.type !== 'automated' || hit.c.status === 'retired') {
          const what = hit.c.status === 'retired' ? 'is retired' : `has type ${hit.c.type ?? '(none)'}`;
          report.add('L3', where, `The test proves ${id}, but the case ${what} in ${hit.file}. Set type: automated on an active case, or remove ${id} from the title.`);
        } else if (!splitLinks(hit.c.automated_by).map(normalizePath).includes(f)) {
          report.add('L4', where, `The test proves ${id}, but its automated_by in ${hit.file} does not name ${f}. Add ${f} to automated_by.`);
        }
      }
    }
  }

  // L5–L6: every spec file a case names exists, and has a test that starts with its ID.
  for (const [id, { c, file }] of cases) {
    if (c.status === 'retired') continue;
    for (const link of splitLinks(c.automated_by).map(normalizePath).filter((p) => isBrowserSpec(cfg, p))) {
      const where = `${file} ${id}`;
      if (!existsSync(join(root, link))) {
        report.add('L5', where, `automated_by names ${link}, which does not exist. Create the spec, or fix the path.`);
      } else if (!(testsByFile.get(link) ?? findTests(readText(join(root, link)))).some((t) => titleIds(cfg, t.title).includes(id))) {
        report.add('L6', where, `automated_by names ${link}, but no test there starts with ${id}. Start the title of the test that proves it with "${id} …".`);
      }
    }
  }
}

// ── coverage ─────────────────────────────────────────────────────────────────

function baselineSize(cfg) {
  const path = join(cfg.root, cfg.settings.baseline);
  if (!existsSync(path)) return 0;
  try {
    const data = JSON.parse(readText(path));
    return toList(data?.unmapped).length + toList(data?.unlinkedSpecs).length;
  } catch {
    return 0;
  }
}

function coverage(cfg, features) {
  const isBrowserLink = (p) => isBrowserSpec(cfg, p);
  const filesById = new Map(features.caseFiles.map((f) => [f.featureId, f]));
  const ids = [...new Set([...features.records.map((r) => r.featureId), ...filesById.keys()])].sort();
  const recordsById = new Map(features.records.map((r) => [r.featureId, r]));

  const rows = [];
  const total = { cases: 0, manual: 0, api: 0, unit: 0, browser: 0, p0: [] };
  for (const id of ids) {
    const record = recordsById.get(id);
    const cases = filesById.has(id) ? casesOf(filesById.get(id)).filter((c) => isPlainObject(c) && c.status !== 'retired') : [];
    const row = { cases: cases.length, manual: 0, api: 0, unit: 0, browser: 0, p0: [] };
    for (const c of cases) {
      if (c.type === 'manual') row.manual++;
      else if (c.type === 'api') row.api++;
      else if (c.type === 'automated') {
        if (splitLinks(c.automated_by).some(isBrowserLink)) row.browser++;
        else row.unit++;
      }
      if (c.priority === 'P0' && (c.type === 'manual' || c.type === 'api')) row.p0.push(String(c.id));
    }
    for (const k of ['cases', 'manual', 'api', 'unit', 'browser']) total[k] += row[k];
    total.p0.push(...row.p0);
    let name = id;
    if (!record) name += ' (no record)';
    else if (record.status === 'draft') name += ' (draft)';
    else if (record.status === 'retired') name += ' (retired)';
    rows.push([name, row.cases, row.manual, row.api, row.unit, row.browser, row.p0.join(', ') || '—']);
  }

  const lines = [
    '| Feature | Cases | Manual | API | Automated: unit/API | Automated: browser | P0 cases not automated |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    `| **Total** | ${total.cases} | ${total.manual} | ${total.api} | ${total.unit} | ${total.browser} | ${total.p0.length} |`,
    '',
    `Draft records: ${features.records.filter((r) => r.status === 'draft').length}. Baseline: ${baselineSize(cfg)} paths.`,
  ];
  return lines.join('\n');
}

// ── commit-msg: K1, K2, K4 ───────────────────────────────────────────────────
//
// Runs from the repo's commit-msg hook. Reads the staged files and their staged
// content (git show :<path>), and compares case files with HEAD.

function gitOut(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

// The content of `path` at `rev` ("" means the index), or null when it is not there.
function gitShow(root, rev, path) {
  try {
    return gitOut(root, ['show', `${rev}:${path}`]);
  } catch {
    return null;
  }
}

function hasHead(root) {
  try {
    gitOut(root, ['rev-parse', '--verify', '-q', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function isMerge(root) {
  const path = gitOut(root, ['rev-parse', '--git-path', 'MERGE_HEAD']).trim();
  return existsSync(resolve(root, path));
}

function stagedFiles(root, filter) {
  return gitOut(root, ['diff', '--cached', '--name-only', '-z', `--diff-filter=${filter}`]).split('\0').filter(Boolean);
}

// The message as git will store it: no "#" comment lines, nothing below a scissors line.
function readMessage(file) {
  const lines = readText(file).split(/\r?\n/);
  const cut = lines.findIndex((l) => /^# -+ >8 -+$/.test(l));
  return (cut === -1 ? lines : lines.slice(0, cut)).filter((l) => !l.startsWith('#'));
}

// "<Name>: <subject> — <reason>". The dash may be —, – or -, with a space on each side.
function parseTrailers(lines, name) {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+?)\\s+[—–-]\\s+(.*)$`, 'i');
  const out = [];
  for (const line of lines) {
    const m = re.exec(line.trim());
    if (m) out.push({ subject: m[1].trim(), reason: m[2].trim(), line: line.trim() });
    else if (new RegExp(`^${name}:`, 'i').test(line.trim())) out.push({ subject: null, reason: '', line: line.trim() });
  }
  return out;
}

const MIN_REASON = 10;

// Is `subject` excused by a trailer? Returns null when excused, or the reason it is not.
function trailerFor(trailers, subject, name, form) {
  const own = trailers.filter((t) => t.subject === subject);
  if (own.length === 0) return `Stage it, or add "${name}: ${form} — <reason>" to the commit message.`;
  if (own.some((t) => t.reason.length >= MIN_REASON)) return null;
  return `The reason in "${own[0].line}" is too short. Write ${MIN_REASON} or more characters after the dash.`;
}

function stagedCodeMap(cfg) {
  const rel = cfg.settings.codeMap;
  const text = gitShow(cfg.root, '', rel) ?? (existsSync(join(cfg.root, rel)) ? readText(join(cfg.root, rel)) : null);
  if (text === null) return [];
  try {
    const data = JSON.parse(text);
    return toList(data?.mappings).map((m) => ({
      source: toList(m?.source).filter((s) => typeof s === 'string'),
      docs: toList(m?.docs).filter((s) => typeof s === 'string'),
    }));
  } catch {
    return []; // qa-check map reports a broken map
  }
}

function featuresDirOf(cfg) {
  return `${cfg.settings.featuresDir.replace(/\/+$/, '')}/`;
}

function isRecordPath(cfg, p) {
  const dir = featuresDirOf(cfg);
  return p.startsWith(dir) && p.endsWith('.md') && !p.slice(dir.length).includes('/') && p !== dir + cfg.settings.records.readme;
}

function isCaseFilePath(cfg, p) {
  const dir = featuresDirOf(cfg);
  return p.startsWith(dir) && p.endsWith(cfg.settings.casesSuffix) && !p.slice(dir.length).includes('/');
}

// K1: staged code needs its records staged, or a Docs-Reviewed trailer per record.
function checkK1(cfg, staged, message, report, notes) {
  const name = cfg.settings.trailers.recordReviewed;
  const trailers = parseTrailers(message, name);
  const stagedSet = new Set(staged);
  const code = staged.filter((f) => !isTestFile(cfg, f) && !isRecordPath(cfg, f) && !isCaseFilePath(cfg, f));
  const mappings = stagedCodeMap(cfg);

  const needed = new Map(); // record or case file → code that needs it
  for (const m of mappings) {
    const hits = code.filter((f) => matchesAny(f, m.source));
    if (hits.length === 0) continue;
    for (const doc of m.docs) {
      if (!isRecordPath(cfg, doc) && !isCaseFilePath(cfg, doc)) continue;
      if (!needed.has(doc)) needed.set(doc, new Set());
      for (const h of hits) needed.get(doc).add(h);
    }
  }

  for (const [doc, hits] of [...needed].sort(([a], [b]) => a.localeCompare(b))) {
    if (stagedSet.has(doc)) continue;
    const exists = existsSync(join(cfg.root, doc)) || gitShow(cfg.root, '', doc) !== null || gitShow(cfg.root, 'HEAD', doc) !== null;
    if (!exists) continue; // the doc exists nowhere; qa-check map reports it (M1)
    const files = [...hits].sort();
    const what = files.length === 1 ? files[0] : `${files[0]} and ${files.length - 1} more`;
    if (isRecordPath(cfg, doc)) {
      const why = trailerFor(trailers, doc, name, doc);
      if (why) report.add('K1', doc, `The commit changes ${what}, which maps to this record, but the record is not staged. ${why}`);
    } else {
      notes.push(`note: the commit changes ${what}, which maps to ${doc}. Check that its cases still hold.`);
    }
  }
}

function parseCaseYaml(text) {
  if (text === null) return { cases: null };
  try {
    const data = parseYaml(text);
    return { cases: isPlainObject(data) && Array.isArray(data.cases) ? data.cases.filter(isPlainObject) : [] };
  } catch (err) {
    return { cases: null, error: err.message.split('\n')[0] };
  }
}

function browserLinks(cfg, c) {
  return splitLinks(c?.automated_by).filter((p) => isBrowserSpec(cfg, p));
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// K2: a changed case with a browser link needs its spec staged, or a Test-Reviewed trailer.
function checkK2(cfg, stagedWithDeletes, message, report) {
  const name = cfg.settings.trailers.testReviewed;
  const trailers = parseTrailers(message, name);
  const stagedSet = new Set(stagedWithDeletes);

  for (const file of stagedWithDeletes.filter((f) => isCaseFilePath(cfg, f))) {
    const before = parseCaseYaml(gitShow(cfg.root, 'HEAD', file)).cases;
    if (!before) continue; // a new case file, or one that did not parse at HEAD
    const after = new Map((parseCaseYaml(gitShow(cfg.root, '', file)).cases ?? []).map((c) => [c.id, c]));

    for (const old of before) {
      const now = after.get(old.id);
      if (!now) continue; // removed or moved: K4 decides
      const linksBefore = browserLinks(cfg, old);
      const linksNow = browserLinks(cfg, now);
      if (linksBefore.length === 0 && linksNow.length === 0) continue;
      const changed = ['title', 'preconditions', 'steps'].filter((k) => !sameValue(old[k], now[k]));
      const unlinked = linksBefore.filter((l) => !linksNow.includes(l));
      if (changed.length === 0 && unlinked.length === 0) continue;

      const specs = [...new Set([...linksBefore, ...linksNow])].sort();
      const unstaged = specs.filter((s) => !stagedSet.has(s));
      if (unstaged.length === 0) continue;
      const why = trailerFor(trailers, String(old.id), name, String(old.id));
      if (why) {
        const what = [...changed.map((k) => `its ${k}`), ...(unlinked.length ? ['its browser link'] : [])].join(', ');
        report.add('K2', `${file} ${old.id}`, `The commit changes ${what}, but the linked test ${unstaged.join(', ')} is not staged. ${why}`);
      }
    }
  }
}

function caseIdsIn(cfg, rev) {
  const files =
    rev === 'HEAD'
      ? gitOut(cfg.root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).split('\0').filter(Boolean)
      : gitOut(cfg.root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const ids = new Map(); // id → file
  const unreadable = [];
  for (const f of files.filter((p) => isCaseFilePath(cfg, p))) {
    const { cases, error } = parseCaseYaml(gitShow(cfg.root, rev, f));
    if (error) unreadable.push({ file: f, error });
    for (const c of cases ?? []) if (typeof c.id === 'string' && !ids.has(c.id)) ids.set(c.id, f);
  }
  return { ids, unreadable };
}

// K4: no commit removes a case ID that exists at HEAD.
function checkK4(cfg, report) {
  const before = caseIdsIn(cfg, 'HEAD');
  const after = caseIdsIn(cfg, '');
  for (const u of after.unreadable) {
    report.add('K4', u.file, `The staged case file is not valid YAML (${u.error}), so K4 cannot check that no case was removed. Fix the syntax.`);
  }
  const unreadable = new Set(after.unreadable.map((u) => u.file));
  for (const [id, file] of [...before.ids].sort(([a], [b]) => a.localeCompare(b))) {
    if (after.ids.has(id) || unreadable.has(file)) continue;
    report.add('K4', `${file} ${id}`, `The commit removes the case ${id}. Cases are never deleted: restore it and set "status: retired" on it instead.`);
  }
}

function commitMsg(cfg, messageFile) {
  const report = new Report();
  const notes = [];
  if (isMerge(cfg.root)) {
    console.log('qa-check commit-msg: merge commit; skipped');
    return 0;
  }
  const message = readMessage(messageFile);
  checkK1(cfg, stagedFiles(cfg.root, 'ACMR'), message, report, notes);
  if (hasHead(cfg.root)) {
    checkK2(cfg, stagedFiles(cfg.root, 'ACMRD'), message, report);
    checkK4(cfg, report);
  }
  for (const n of notes) console.log(n);
  if (report.problems.length === 0) {
    console.log('qa-check commit-msg: OK');
    return 0;
  }
  for (const p of report.problems) console.error(`${p.id}  ${p.where}: ${p.message}`);
  const n = report.problems.length;
  console.error(`qa-check commit-msg: commit blocked, ${n} problem${n === 1 ? '' : 's'}.`);
  return 1;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const CHECKS = {
  records: checkRecords,
  cases: checkCases,
  map: checkMap,
  links: checkLinks,
};

function runChecks(cfg, names) {
  const features = loadFeatures(cfg);
  const report = new Report();
  for (const n of names) CHECKS[n](cfg, features, report);
  return report;
}

function printReport(label, report) {
  if (report.problems.length === 0) {
    console.log(`qa-check ${label}: OK`);
    return 0;
  }
  for (const p of report.problems) console.error(`${p.id}  ${p.where}: ${p.message}`);
  const n = report.problems.length;
  console.error(`qa-check ${label}: ${n} problem${n === 1 ? '' : 's'}.`);
  return 1;
}

function parseArgs(argv) {
  const opts = { command: null, args: [], root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') {
      if (!argv[i + 1]) throw new UsageError('--root needs a directory.');
      opts.root = resolve(argv[++i]);
    } else if (!opts.command) opts.command = argv[i];
    else opts.args.push(argv[i]);
  }
  const want = opts.command === 'commit-msg' ? 1 : 0;
  if (opts.args.length > want) throw new UsageError(`Unexpected argument "${opts.args[want]}".`);
  return opts;
}

const USAGE = 'Usage: node scripts/qa-check.mjs <records|cases|map|links|coverage|all|commit-msg <file>> [--root <dir>]';

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.command) throw new UsageError(USAGE);
  const cfg = loadConfig(opts.root);
  switch (opts.command) {
    case 'records':
    case 'cases':
    case 'map':
      return printReport(opts.command, runChecks(cfg, [opts.command]));
    case 'links':
      if (!cfg.automation.enabled) {
        console.log('qa-check links: the automation module is off; nothing to check');
        return 0;
      }
      return printReport('links', runChecks(cfg, ['links']));
    case 'all':
      return printReport('all', runChecks(cfg, ['records', 'cases', 'map', ...(cfg.automation.enabled ? ['links'] : [])]));
    case 'coverage':
      console.log(coverage(cfg, loadFeatures(cfg)));
      return 0;
    case 'commit-msg':
      if (opts.args.length === 0) throw new UsageError('commit-msg needs the commit message file: the hook\'s $1.');
      if (!existsSync(opts.args[0])) throw new UsageError(`The commit message file ${opts.args[0]} does not exist.`);
      return commitMsg(cfg, resolve(opts.args[0]));
    default:
      throw new UsageError(`Unknown command "${opts.command}". ${USAGE}`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`qa-check: ${err instanceof UsageError ? err.message : err.stack}`);
  process.exitCode = 1;
}
