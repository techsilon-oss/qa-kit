#!/usr/bin/env node
// qa-check — QA Kit's checks. Vendored into a repo by /qa-init. Fix bugs in
// techsilon-oss/qa-kit, never in a copy.
//
// Usage (from the repo root):
//   node scripts/qa-check.mjs records     feature records (R1–R5)
//   node scripts/qa-check.mjs cases       case files (C1–C8)
//   node scripts/qa-check.mjs map         the code → record map (M1–M3)
//   node scripts/qa-check.mjs coverage    a Markdown coverage table; never fails
//   node scripts/qa-check.mjs all         records, cases and map
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
    automation: { enabled: automation.enabled === true, specGlob: automation.specGlob ?? null },
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
  const isBrowserLink = (p) => cfg.automation.specGlob !== null && matchesAny(p, [cfg.automation.specGlob]);
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

// ── CLI ──────────────────────────────────────────────────────────────────────

const CHECKS = {
  records: checkRecords,
  cases: checkCases,
  map: checkMap,
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
  const opts = { command: null, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') {
      if (!argv[i + 1]) throw new UsageError('--root needs a directory.');
      opts.root = resolve(argv[++i]);
    } else if (!opts.command) opts.command = argv[i];
    else throw new UsageError(`Unexpected argument "${argv[i]}".`);
  }
  return opts;
}

const USAGE = 'Usage: node scripts/qa-check.mjs <records|cases|map|coverage|all> [--root <dir>]';

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.command) throw new UsageError(USAGE);
  const cfg = loadConfig(opts.root);
  switch (opts.command) {
    case 'records':
    case 'cases':
    case 'map':
      return printReport(opts.command, runChecks(cfg, [opts.command]));
    case 'all':
      return printReport('all', runChecks(cfg, ['records', 'cases', 'map']));
    case 'coverage':
      console.log(coverage(cfg, loadFeatures(cfg)));
      return 0;
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
