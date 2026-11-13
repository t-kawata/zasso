// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
/**
 * PX-423 — producer-side integration gate.
 *
 * `check` proves six fixed host lines. `write` inserts or repairs them at one
 * fixed anchor. The lines contain no skill name, so a second build cannot add
 * a second block; the only per-skill state is the installed skill directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_LINES,
  FILE_KEYS,
  INTEGRATION_MARKER,
  LAW_SECTION_PATTERNS,
  MAX_CHECKPOINT_LENGTH,
  PIPELINE_COMMANDS,
  anchorIndex,
  checkpointIndexes,
  findLawSection,
  isValidCheckpointLine,
  normalizeHostText,
  outsideCheckpointIndexes,
} from './law-integration/contract.mjs';
import {
  exists,
  readText,
  sha256Text,
  splitLines,
  writeAtomic,
} from './law-verify/source.mjs';

const REPORT_SCHEMA = 'law-integration-verification/v1';
const SKILL_NAME = /^[a-z][a-z0-9-]*-law$/;

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    claude: null,
    commands: null,
    skills: null,
    mode: 'check',
    requireSkill: false,
    out: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') options.root = argv[++index];
    else if (argument === '--claude') options.claude = argv[++index];
    else if (argument === '--commands') options.commands = argv[++index];
    else if (argument === '--skills') options.skills = argv[++index];
    else if (argument === '--mode') options.mode = argv[++index];
    else if (argument === '--require-skill') options.requireSkill = true;
    else if (argument === '--out') options.out = argv[++index];
    else return { error: `unknown argument: ${argument}` };
  }
  const root = path.resolve(options.root);
  const claude = path.resolve(options.claude ?? path.join(root, '.claude/CLAUDE.md'));
  const commands = path.resolve(options.commands ?? path.join(root, '.claude/commands'));
  const skills = path.resolve(options.skills ?? path.join(root, '.claude/skills'));
  if (!['check', 'write'].includes(options.mode)) return { error: `invalid mode: ${options.mode}` };
  return { root, claude, commands, skills, mode: options.mode, requireSkill: options.requireSkill, out: options.out };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function hostFiles({ root, claude, commands }) {
  return [
    { key: 'claude', file: claude, relative: path.relative(root, claude).replace(/\\/g, '/') },
    ...PIPELINE_COMMANDS.map((key) => {
      const file = path.join(commands, `${key}.md`);
      return { key, file, relative: path.relative(root, file).replace(/\\/g, '/') };
    }),
  ];
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function finding(status, codes, extra = {}) {
  return { status, codes: [...new Set(codes)], ...extra };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function inspectHostFile({ key, file }) {
  if (!exists(file)) {
    return finding('failed', ['INTEGRATION_MISSING'], { file: null, line: null });
  }
  const lines = splitLines(normalizeHostText(readText(file)));
  const section = findLawSection(lines, LAW_SECTION_PATTERNS[key]);
  if (!section) {
    return finding('failed', ['INTEGRATION_MISSING'], { file: null, line: null });
  }
  const codes = [];
  const outside = outsideCheckpointIndexes(lines, section);
  if (outside.length > 0) codes.push('INTEGRATION_LOCATION');
  const indexes = checkpointIndexes(lines, section);
  if (indexes.length === 0) codes.push('INTEGRATION_MISSING');
  if (indexes.length > 1) codes.push('INTEGRATION_DUPLICATE');
  const lineIndex = indexes[0] ?? null;
  if (lineIndex !== null) {
    const line = lines[lineIndex].trim();
    if (/--(?:root|source-root|path-alias)/.test(line)) codes.push('INTEGRATION_CLI_LEAK');
    if (line !== CANONICAL_LINES[key] || !isValidCheckpointLine(line)) codes.push('INTEGRATION_DRIFT');
    if (lineIndex !== anchorIndex(lines, section)) codes.push('INTEGRATION_LOCATION');
  }
  return finding(codes.length === 0 ? 'machine_verified' : 'failed', codes, {
    file: null,
    line: lineIndex === null ? null : lineIndex + 1,
    line_sha256: sha256Text(CANONICAL_LINES[key]),
  });
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function inspectSkills(skillsDirectory, requireSkill) {
  if (!exists(skillsDirectory)) {
    return finding(requireSkill ? 'failed' : 'skipped', requireSkill ? ['INTEGRATION_NO_SKILL'] : [], {
      discovered: [],
    });
  }
  const discovered = fs.readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SKILL_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const codes = [];
  for (const name of discovered) {
    const skill = path.join(skillsDirectory, name);
    if (!exists(path.join(skill, 'SKILL.md')) || !exists(path.join(skill, 'dist/skill.mjs'))) {
      codes.push('INTEGRATION_SKILL_INVALID');
    }
  }
  if (discovered.length === 0) {
    return finding(requireSkill ? 'failed' : 'skipped', requireSkill ? ['INTEGRATION_NO_SKILL'] : [], {
      discovered,
    });
  }
  return finding(codes.length === 0 ? 'machine_verified' : 'failed', codes, { discovered });
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function prepareHostFile({ key, file, relative }) {
  if (!exists(file)) return { error: finding('failed', ['INTEGRATION_MISSING'], { file: relative }) };
  const original = normalizeHostText(readText(file));
  const lines = splitLines(original);
  const section = findLawSection(lines, LAW_SECTION_PATTERNS[key]);
  if (!section) return { error: finding('failed', ['INTEGRATION_MISSING'], { file: relative }) };
  const outside = outsideCheckpointIndexes(lines, section);
  if (outside.length > 0) return { error: finding('failed', ['INTEGRATION_LOCATION'], { file: relative }) };
  const indexes = checkpointIndexes(lines, section);
  if (indexes.length > 1) return { error: finding('failed', ['INTEGRATION_DUPLICATE'], { file: relative }) };
  const canonical = CANONICAL_LINES[key];
  if (indexes.length === 1
    && lines[indexes[0]].trim() === canonical
    && indexes[0] === anchorIndex(lines, section)) {
    return { key, file, relative, original, next: original, changed: false };
  }
  const before = lines.slice(0, section.start + 1);
  const rest = lines
    .slice(section.start + 1, section.end)
    .filter((line, offset) => !indexes.includes(section.start + 1 + offset))
    .filter((line, offset, array) => !(offset === 0 && line.trim() === ''))
    .filter((line, offset, array) => !(offset === array.length - 1 && line.trim() === ''));
  const after = lines.slice(section.end);
  const nextLines = [...before, '', canonical, ''];
  if (rest.length > 0) nextLines.push(...rest, '');
  nextLines.push(...after);
  return { key, file, relative, original, next: `${nextLines.join('\n').replace(/\n+$/, '')}\n`, changed: true };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function writePrepared(prepared, backupRoot) {
  for (const entry of prepared) {
    if (!entry.changed) continue;
    const backup = path.join(backupRoot, entry.relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(entry.file, backup);
  }
  try {
    for (const entry of prepared) {
      if (!entry.changed) continue;
      writeAtomic(entry.file, entry.next);
    }
  } catch (error) {
    for (const entry of prepared) {
      if (!entry.changed) continue;
      const backup = path.join(backupRoot, entry.relative);
      if (!exists(backup)) continue;
      try {
        writeAtomic(entry.file, readText(backup));
      } catch {
        // The original file was never written when the directory denied the
        // temporary file; the backup remains the authoritative copy.
      }
    }
    return { ok: false, error };
  }
  return { ok: true };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function closure({ checks, skills }) {
  return sha256Text(JSON.stringify({
    lines: CANONICAL_LINES,
    files: FILE_KEYS,
    skills: skills.discovered ?? [],
  }));
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function render({ mode, root, checks, skills }) {
  const failed = Object.values(checks).some((entry) => entry.status !== 'machine_verified')
    || skills.status === 'failed';
  return {
    schema: REPORT_SCHEMA,
    mode,
    root,
    status: failed ? 'failed' : 'machine_verified',
    checks,
    skills,
    closure_sha256: closure({ checks, skills }),
  };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.error) {
    process.stdout.write(`${JSON.stringify({ schema: REPORT_SCHEMA, status: 'failed', error: options.error })}\n`);
    return 2;
  }
  const files = hostFiles(options);
  const skills = inspectSkills(options.skills, options.requireSkill);
  let report;
  if (options.mode === 'write') {
    const prepared = [];
    for (const entry of files) {
      const result = prepareHostFile(entry);
      if (result.error) {
        prepared.push({ key: entry.key, error: result.error });
        continue;
      }
      prepared.push(result);
    }
    const blocked = prepared.find((entry) => entry.error);
    if (blocked) {
      const checks = Object.fromEntries(prepared.map((entry) => [entry.key, entry.error ?? finding('machine_verified', [])]));
      report = render({ mode: options.mode, root: options.root, checks, skills });
      report.status = 'failed';
    } else {
      const write = writePrepared(prepared, path.join(options.root, 'target/law/backup/integration'));
      const checks = Object.fromEntries(prepared.map((entry) => [
        entry.key,
        write.ok
          ? finding('machine_verified', [], { line: null, line_sha256: sha256Text(CANONICAL_LINES[entry.key]) })
          : finding('failed', ['INTEGRATION_WRITE_FAILED']),
      ]));
      if (!write.ok) skills.status = 'failed';
      report = render({ mode: options.mode, root: options.root, checks, skills });
    }
  } else {
    const checks = Object.fromEntries(files.map((entry) => {
      const result = inspectHostFile(entry);
      return [entry.key, { ...result, file: entry.relative }];
    }));
    report = render({ mode: options.mode, root: options.root, checks, skills });
  }
  if (options.out) writeAtomic(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report.status === 'machine_verified' ? 0 : 1;
}

export { main };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
