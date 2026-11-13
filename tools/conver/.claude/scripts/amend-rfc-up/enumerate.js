'use strict';

/**
 * /amend-rfc-up law enumeration.
 *
 * The law's delivery interface is `applies` / `resolve`, not the raw `okf/`.
 * This module reads the machine-readable manifest: units, phases, and every
 * `delivery: must` node in the package's phase scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LAW_APPLIES_SKIP_EXIT = 3;
const MANIFEST_FILENAME = 'manifest.json';
const MUST_DELIVERY = 'must';
const CODE_FENCE_PATTERN = /```[^\n]*\n([\s\S]*?)```/g;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function defaultRunner({ lawPath, args }) {
  const result = spawnSync(process.execPath, [lawPath, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Read a `| Name | value |` row from the law's Markdown table. */
function readTableRow(text, label) {
  const pattern = new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|]+)\\|`);
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/** Parse the matched unit and phase list from `applies` output. */
function parseAppliesOutput(text) {
  const unitMatch = text.match(/\|\s*Matched units\s*\|\s*`([^`]+)`\s*\(([^)]+)\)/);
  if (!unitMatch) return null;
  const unitId = unitMatch[1];
  const role = unitMatch[2];
  const phasesText = readTableRow(text, 'Phases');
  const phases = phasesText
    ? phasesText.split(',').map((phase) => phase.trim()).filter(Boolean)
    : [];
  return { unitId, role, phases };
}

/** Run `applies`; exit 3 is the law's own skip, never an error. */
function runLawApplies({ lawPath, repoRoot, packageDir, runner = defaultRunner }) {
  const args = ['applies', '--root', repoRoot, '--paths', `${packageDir}/`];
  const result = runner({ lawPath, args });
  if (result.status === LAW_APPLIES_SKIP_EXIT) {
    return { applies: false, code: 'LAW_NOT_APPLICABLE', stdout: result.stdout };
  }
  if (result.status !== 0) {
    throw fail('LAW_APPLIES_FAILED', `law applies exited ${result.status}`, {
      stderr: result.stderr,
    });
  }
  const parsed = parseAppliesOutput(result.stdout);
  if (parsed === null) {
    throw fail('LAW_UNIT_NOT_FOUND', 'law applies printed no matched unit', {
      stdout: result.stdout,
    });
  }
  return { applies: true, ...parsed, stdout: result.stdout };
}

/** Run `resolve` and read the manifest it wrote. */
function resolveLawClosure({ lawPath, repoRoot, packageDir, lawOut, runner = defaultRunner }) {
  fs.mkdirSync(lawOut, { recursive: true });
  const manifestPath = path.join(lawOut, MANIFEST_FILENAME);
  const args = ['resolve', '--root', repoRoot, '--paths', `${packageDir}/`, '--out', manifestPath];
  const result = runner({ lawPath, args, manifestPath, lawOut });
  if (result.status !== 0) {
    throw fail('LAW_RESOLVE_FAILED', `law resolve exited ${result.status}`, {
      stderr: result.stderr,
    });
  }
  if (!fs.existsSync(manifestPath)) {
    throw fail('LAW_RESOLVE_FAILED', `law resolve did not write ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/** The manifest unit for the package. */
function selectPackageUnit({ manifest, packageDir, unitId = null }) {
  const packageName = path.basename(packageDir);
  const unit = (manifest.units || []).find((candidate) => (
    (unitId !== null && (candidate.id === unitId || candidate.crate === unitId))
    || candidate.crate === packageName
    || candidate.id === packageName
  ));
  if (!unit) {
    throw fail('LAW_UNIT_NOT_FOUND', `no manifest unit for ${packageName}`, {
      units: (manifest.units || []).map((candidate) => candidate.id),
    });
  }
  return unit;
}

/** Every `must` node in the requested phases. */
function extractMustRules({ manifest, phases }) {
  const phaseSet = new Set(phases || []);
  return (manifest.nodes || [])
    .filter((node) => node.delivery === MUST_DELIVERY && phaseSet.has(node.phase))
    .map((node) => ({
      id: node.id,
      phase: node.phase,
      requirement: node.body || '',
      body: node.body || '',
      references: node.references || [],
      file: node.file || null,
      contentSha256: node.content_sha256 || null,
    }));
}

/** Every code fence in a text. */
function extractCodeBlocks(text) {
  const blocks = [];
  for (const match of String(text || '').matchAll(CODE_FENCE_PATTERN)) {
    blocks.push({ code: match[0] });
  }
  return blocks;
}

/** Code examples a rule carries directly or through its reference nodes. */
function selectReferenceExamples({ rule, manifest, limit = 3 }) {
  const nodesById = new Map((manifest.nodes || []).map((node) => [node.id, node]));
  const examples = [];
  for (const referenceId of rule.references || []) {
    const node = nodesById.get(referenceId);
    if (!node) continue;
    for (const block of extractCodeBlocks(node.body)) {
      examples.push({ nodeId: node.id, code: block.code });
    }
  }
  for (const block of extractCodeBlocks(rule.requirement)) {
    examples.push({ nodeId: rule.id, code: block.code });
  }
  const seen = new Set();
  const unique = [];
  for (const example of examples) {
    if (seen.has(example.code)) continue;
    seen.add(example.code);
    unique.push(example);
  }
  return unique.slice(0, limit);
}

/** The full enumeration for one package. */
function enumerateRules({ lawPath, repoRoot, packageDir, lawOut, phases = null, runner = defaultRunner }) {
  const applies = runLawApplies({ lawPath, repoRoot, packageDir, runner });
  if (!applies.applies) return applies;
  const manifest = resolveLawClosure({ lawPath, repoRoot, packageDir, lawOut, runner });
  const unit = selectPackageUnit({ manifest, packageDir, unitId: applies.unitId });
  const scopedPhases = phases || applies.phases;
  const rules = extractMustRules({ manifest, phases: scopedPhases })
    .map((rule) => ({
      ...rule,
      examples: selectReferenceExamples({ rule, manifest }),
    }));
  return { applies: true, unit, phases: scopedPhases, rules, manifest };
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function main(argv = process.argv.slice(2)) {
  const packageDir = path.resolve(argumentValue(argv, 'cwd') || process.cwd());
  const repoRoot = argumentValue(argv, 'repo') || path.resolve(packageDir);
  const lawPath = argumentValue(argv, 'law')
    || path.join(repoRoot, '.claude/skills/rust-interface-law/dist/skill.mjs');
  const lawOut = path.resolve(argumentValue(argv, 'law-out') || path.join(packageDir, 'target', 'law'));
  const phasesArgument = argumentValue(argv, 'phases');
  const phases = phasesArgument ? phasesArgument.split(',').map((phase) => phase.trim()).filter(Boolean) : null;
  try {
    const result = enumerateRules({ lawPath, repoRoot, packageDir, lawOut, phases });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.applies ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'ENUMERATE_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  extractCodeBlocks,
  extractMustRules,
  enumerateRules,
  parseAppliesOutput,
  resolveLawClosure,
  runLawApplies,
  selectPackageUnit,
  selectReferenceExamples,
};
