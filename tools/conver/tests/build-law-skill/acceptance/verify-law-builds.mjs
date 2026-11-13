#!/usr/bin/env node
/**
 * PX-420 — verify a law-build acceptance record.
 *
 * The record is the only persisted proof of an acceptance run. This script
 * never builds a skill. It checks that the recorded source bytes still match
 * and that every recorded built skill still passes the canonical verifier with
 * the recorded closure hash.
 *
 * Usage:
 *   node verify-law-builds.mjs --record <law-builds.json> [--root <repo>]
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const VERIFIER_SCHEMA = 'law-skill-verification/v1';
const INPUT_CONTRACT_SCOPE = 'input-contract';

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function main(argv) {
  const options = parseArgs(argv);
  if (!options.record) {
    process.stdout.write('usage: verify-law-builds.mjs --record <law-builds.json> [--root <repo>]\n');
    return 1;
  }
  const root = resolve(options.root ?? process.cwd());
  const recordPath = isAbsolute(options.record) ? options.record : resolve(root, options.record);
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, 'utf8'));
  } catch (error) {
    process.stdout.write(`# Law build acceptance — FAIL\n\nRecord unreadable: \`${recordPath}\`: ${error.message}\n`);
    return 1;
  }

  const findings = [];
  if (record.schema !== 'law-builds/v1') findings.push(`schema is not law-builds/v1: ${record.schema}`);
  const sourceResults = verifySources({ root, sources: record.sources ?? [], findings });
  const buildResults = verifyBuilds({ root, builds: record.builds ?? [], findings });
  if ((record.builds ?? []).length === 0 && record.scope !== INPUT_CONTRACT_SCOPE) {
    findings.push(`no builds recorded and scope is not ${INPUT_CONTRACT_SCOPE}`);
  }

  const ok = findings.length === 0;
  const results = { sources: sourceResults, builds: buildResults };
  process.stdout.write(render({ recordPath, record, results, findings, ok }));
  return ok ? 0 : 1;
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--record') options.record = argv[++index];
    else if (argument === '--root') options.root = argv[++index];
  }
  return options;
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function verifySources({ root, sources, findings }) {
  return sources.map((source) => {
    const absolute = resolve(root, source.path);
    if (!existsSync(absolute)) {
      findings.push(`source missing: ${source.path}`);
      return { path: source.path, status: 'failed' };
    }
    const text = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sha256 = createHash('sha256').update(text).digest('hex');
    if (source.sha256 && sha256 !== source.sha256) {
      findings.push(`source hash changed: ${source.path}`);
    }
    const lines = splitLines(text).length;
    if (source.lines && lines !== source.lines) {
      findings.push(`source line count changed: ${source.path} ${lines} != ${source.lines}`);
    }
    return { path: source.path, status: sha256 === source.sha256 ? 'machine_verified' : 'failed' };
  });
}

// [::TICKET::] PX-420, PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-420|PX-421|PX-422) --for-spec --no-implementation-order`.
function verifyBuilds({ root, builds, findings }) {
  const verifierPath = join(root, '.claude/scripts/amend-rfc-up/verify-law-skill.mjs');
  if (builds.length > 0 && !existsSync(verifierPath)) {
    findings.push(`canonical verifier missing: ${verifierPath}`);
    return [];
  }
  return builds.map((build) => {
    const skillPath = resolve(root, build.path ?? build.skill);
    if (!existsSync(skillPath)) {
      findings.push(`build missing: ${build.path ?? build.skill}`);
      return { skill: build.skill, status: 'failed', closure_sha256: null };
    }
    const outDir = mkdtempSync(join(tmpdir(), 'law-build-'));
    const outPath = join(outDir, 'verification.json');
    try {
      const mode = build.mode ?? 'dev';
      const sourceRoot = resolve(root, build.source_root ?? '.');
      const aliasPath = resolve(
        root,
        build.path_alias ?? join(dirname(build.path ?? build.skill), `${build.skill}.path-alias.json`),
      );
      const args = [verifierPath, '--skill', skillPath, '--root', root, '--mode', mode, '--out', outPath];
      if (mode === 'dev') args.push('--source-root', sourceRoot, '--path-alias', aliasPath);
      const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
      if (run.status !== 0) {
        findings.push(`verifier failed for ${build.skill}: ${(run.stdout || run.stderr || '').trim()}`);
        return { skill: build.skill, status: 'failed', closure_sha256: null };
      }
      const report = JSON.parse(readFileSync(outPath, 'utf8'));
      if (report.schema !== VERIFIER_SCHEMA) {
        findings.push(`verifier schema mismatch for ${build.skill}: ${report.schema}`);
      }
      const required = report.required_checks ?? Object.keys(report.checks ?? {});
      const failed = required.filter((name) => report.checks?.[name]?.status !== 'machine_verified');
      if (failed.length > 0) {
        findings.push(`verifier checks not machine_verified for ${build.skill}: ${failed.join(', ')}`);
      }
      if (build.closure_sha256 && report.closure_sha256 !== build.closure_sha256) {
        findings.push(`closure hash changed for ${build.skill}`);
      }
      return {
        skill: build.skill,
        status: failed.length === 0 && report.closure_sha256 === build.closure_sha256
          ? 'machine_verified'
          : 'failed',
        closure_sha256: report.closure_sha256 ?? null,
      };
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function render({ recordPath, record, results, findings, ok }) {
  const { sources, builds } = results;
  const lines = [
    `# Law build acceptance — ${ok ? 'PASS' : 'FAIL'}`,
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| Record | \`${recordPath}\` |`,
    `| Scope | ${record.scope ?? '(none)'} |`,
    `| Sources | ${sources.length} |`,
    `| Builds | ${builds.length} |`,
    '',
  ];
  if (sources.length > 0) {
    lines.push('## Sources', '', '| Path | Status |', '|---|---|');
    for (const source of sources) lines.push(`| \`${source.path}\` | ${source.status} |`);
    lines.push('');
  }
  if (builds.length > 0) {
    lines.push('## Builds', '', '| Skill | Status | Closure |', '|---|---|---|');
    for (const build of builds) {
      lines.push(`| \`${build.skill}\` | ${build.status} | \`${build.closure_sha256 ?? '(none)'}\` |`);
    }
    lines.push('');
  }
  lines.push('## Findings', '');
  if (findings.length === 0) lines.push('- none');
  else for (const finding of findings) lines.push(`- ${finding}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-420 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-420 --for-spec --no-implementation-order`.
function splitLines(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

process.exit(main(process.argv.slice(2)));
