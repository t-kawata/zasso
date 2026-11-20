#!/usr/bin/env node
/**
 * collect-push-evidence.js — deterministic evidence for /epush-branch and /jpush-branch.
 *
 * Prints one Markdown report: state, spec selection, spec evidence, prefix and
 * changed surfaces. The calling command only writes prose from this report; it
 * selects nothing itself. Keep every selection rule here so the prompt stays short.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const MAX_DATE_CANDIDATES = 3;
const MAX_GOAL_LINES = 8;
const MAX_BACKGROUND_LINES = 6;
const MAX_SUMMARY_SPECS = 5;
const MAX_SURFACE_LINES = 40;
const KEYED_HEADING = /^# .*[A-Z][A-Z0-9]*-[0-9]+/;
const KEYED_HEADING_PREFIX = /^# (?:Target ticket is )?[A-Z][A-Z0-9]*-[0-9]+[:— -]+/;

function runGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/, '');
  } catch {
    return '';
  }
}

function lines(text) {
  return text.split('\n').filter((line) => line.length > 0);
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function resolveSpecs(root, cwd) {
  let dir = cwd;
  while (dir === root || dir.startsWith(root + path.sep)) {
    const candidate = path.join(dir, 'specs');
    if (isDirectory(candidate)) return candidate;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  const found = fs.readdirSync(root)
    .filter((name) => name !== 'node_modules' && name !== 'tickets')
    .map((name) => path.join(root, name, 'specs'))
    .filter(isDirectory);
  return found.length === 1 ? found[0] : '';
}

function exactSpecPaths(root, specs, upstream) {
  const outputs = [
    upstream
      ? runGit(['-C', root, 'diff', '--no-renames', '--diff-filter=d', '--name-only', '@{u}...HEAD', '--', specs], root)
      : runGit(['-C', root, 'log', '--name-only', '--pretty=format:', 'HEAD', '--not', '--remotes', '--', specs], root),
    runGit(['-C', root, 'diff', '--no-renames', '--diff-filter=d', '--name-only', 'HEAD', '--', specs], root),
    runGit(['-C', root, 'ls-files', '-o', '--exclude-standard', '--', specs], root),
  ];
  return [...new Set(outputs.flatMap(lines))]
    .filter((file) => file && fs.existsSync(path.join(root, file)))
    .sort();
}

function specEntries(root, specs) {
  let names;
  try {
    names = fs.readdirSync(specs);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = path.join(specs, name);
      try {
        return { file, path: path.relative(root, file), mtime: fs.statSync(file).mtimeMs / 1000 };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function selectDateCandidates(entries, sinceEpoch, nowEpoch) {
  const since = Number(sinceEpoch) || 0;
  const now = Number(nowEpoch) || 0;
  return entries
    .filter((entry) => entry.mtime >= since || now - entry.mtime <= SEVEN_DAYS_SECONDS)
    .sort((left, right) => right.mtime - left.mtime)
    .slice(0, MAX_DATE_CANDIDATES)
    .map((entry) => entry.path);
}

function chooseMode(exact, candidates) {
  if (exact.length > 0) return { mode: 'exact', selected: exact };
  if (candidates.length === 1) return { mode: 'date-inferred', selected: candidates };
  return { mode: 'diff', selected: [] };
}

function firstKeyedHeading(text) {
  return text.split('\n').find((line) => KEYED_HEADING.test(line)) || '';
}

function extractTitle(text) {
  return firstKeyedHeading(text).replace(KEYED_HEADING_PREFIX, '').trim();
}

function sectionAfter(all, startPattern, limit, stopPattern) {
  const start = all.findIndex((line) => startPattern.test(line));
  if (start < 0) return '';
  const body = [];
  for (let index = start + 1; index < all.length; index += 1) {
    if (stopPattern && stopPattern.test(all[index])) break;
    if (/^#{1,6} /.test(all[index])) break;
    body.push(all[index]);
    if (body.length >= limit) break;
  }
  return body.join('\n').trim();
}

function extractSummary(text) {
  const all = text.split('\n');
  const goal = sectionAfter(all, /^#{2,3} Goal\s*$/, MAX_GOAL_LINES, /^#{2,3} Purpose\s*$/);
  if (goal) return goal;
  return sectionAfter(all, /^## Background\s*$/, MAX_BACKGROUND_LINES);
}

const PREFIX_RULES = [
  [/^fix\b/i, 'fix'],
  [/^(?:implement|add|show|render|enable|create|make|introduce|emit|publish)\b/i, 'feat'],
  [/^(?:refactor|remove|simplify|normalize|replace|migrate)\b/i, 'refactor'],
  [/^(?:document|doc)\b/i, 'docs'],
  [/^test\b/i, 'test'],
  [/^(?:optimize|perf)\b/i, 'perf'],
  [/^(?:format|style)\b/i, 'style'],
];

function derivePrefix(title) {
  const text = (title || '').trim();
  const rule = PREFIX_RULES.find(([pattern]) => pattern.test(text));
  return rule ? rule[1] : 'chore';
}

function safeMtime(file) {
  try {
    return fs.statSync(file).mtimeMs / 1000;
  } catch {
    return 0;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function orderedByMtime(root, selected) {
  return selected
    .map((file) => ({ file, mtime: safeMtime(path.join(root, file)) }))
    .sort((left, right) => right.mtime - left.mtime)
    .map((entry) => entry.file);
}

function printEvidence(root, selected) {
  if (selected.length === 0) {
    console.log('none');
    return;
  }
  orderedByMtime(root, selected).forEach((file, index) => {
    const text = readText(path.join(root, file));
    console.log(`### ${file}`);
    const heading = firstKeyedHeading(text);
    if (heading) console.log(heading);
    if (index < MAX_SUMMARY_SPECS) {
      const summary = extractSummary(text);
      if (summary) console.log(summary);
    }
  });
}

function prefixFor(root, selected) {
  if (selected.length === 0) return 'chore';
  const [first] = orderedByMtime(root, selected);
  const text = readText(path.join(root, first));
  const title = extractTitle(text);
  if (title) return derivePrefix(title);
  return derivePrefix(extractSummary(text).split('\n')[0] || '');
}

function printState(state) {
  console.log('## State');
  console.log(`branch=${state.branch}`);
  console.log(`upstream=${state.upstream || 'none'}`);
  console.log(`unpushed=${state.unpushed}`);
  console.log(`uncommitted=${state.uncommitted}`);
  console.log(`conflicts=${state.conflicts}`);
  console.log(`specs=${state.specs || 'ambiguous'}`);
}

function main() {
  const root = runGit(['rev-parse', '--show-toplevel']);
  if (!root) {
    console.log('## State\nnot-a-git-repository');
    return;
  }
  const specs = resolveSpecs(root, process.cwd());
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root);
  const statusLines = lines(runGit(['status', '--porcelain'], root));
  const state = {
    branch: runGit(['branch', '--show-current'], root) || '(detached)',
    upstream,
    unpushed: Number(runGit(['rev-list', '--count', 'HEAD', '--not', '--remotes'], root) || '0'),
    uncommitted: statusLines.length,
    conflicts: statusLines.filter((line) => /^(DD|AU|UD|UA|DU|AA|UU) /.test(line)).length,
    specs,
  };

  let sinceEpoch = '';
  if (upstream) {
    const stamps = lines(runGit(['log', '@{u}..HEAD', '--format=%ct'], root));
    if (stamps.length > 0) sinceEpoch = stamps[stamps.length - 1];
  }
  if (!sinceEpoch) sinceEpoch = runGit(['log', '-1', '--format=%ct'], root);
  if (!sinceEpoch) sinceEpoch = String(Math.floor(Date.now() / 1000));
  const nowEpoch = Math.floor(Date.now() / 1000);

  const exact = specs ? exactSpecPaths(root, specs, upstream) : [];
  const candidates = specs ? selectDateCandidates(specEntries(root, specs), sinceEpoch, nowEpoch) : [];
  const { mode, selected } = chooseMode(exact, candidates);

  printState(state);
  console.log('\n## Mode');
  console.log(mode);
  console.log('\n## Selected specs');
  console.log(selected.length > 0 ? selected.join('\n') : 'none');
  console.log('\n## Spec evidence');
  printEvidence(root, selected);
  console.log('\n## Prefix');
  console.log(prefixFor(root, selected));
  console.log('\n## Changed surfaces');
  console.log(statusLines.slice(0, MAX_SURFACE_LINES).join('\n'));
  const stat = lines(runGit(['diff', 'HEAD', '--stat'], root)).slice(0, MAX_SURFACE_LINES);
  if (stat.length > 0) console.log(stat.join('\n'));
}

module.exports = {
  extractTitle,
  extractSummary,
  derivePrefix,
  selectDateCandidates,
  chooseMode,
};

if (require.main === module) main();
