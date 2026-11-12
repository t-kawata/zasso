import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from './lib/atoms.mjs';
import {
  assertBijection,
  assertSkillRegistry,
  parseSkillRegistry,
} from './lib/registry.mjs';
import { findForbiddenTokens, isRedactedMap, sha256 } from './lib/redact.mjs';
import { renderCoverageReport } from './lib/report.mjs';

const SOURCE_FILES = [
  '00-FOUNDATION.md',
  '10-CONTRACTS.md',
  '15-RULE-REGISTRY.md',
  '20-CORE.md',
  '21-OPERATION.md',
  '22-IDENTITY.md',
  '30-REST.md',
  '31-WEBSOCKET.md',
  '32-CLI.md',
  '33-GRPC.md',
  '34-MCP.md',
  '35-A2A.md',
  '40-CONFORMANCE.md',
  '45-DOCUMENTATION.md',
  '47-VALIDATION.md',
  '48-IMPLEMENTATION-BLUEPRINT.md',
  '50-PROJECT-TEMPLATE.md',
  '90-MIGRATION.md',
];
const REGISTRY_FILE = '15-RULE-REGISTRY.md';

const SKILL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_MANIFEST = join(SKILL_ROOT, 'source/manifest.toml');
const DEFAULT_REDACTION = join(SKILL_ROOT, 'source/redaction.sha256.json');
const DEFAULT_LOCK = join(SKILL_ROOT, 'atoms.lock.json');
const DEFAULT_COVERAGE = join(SKILL_ROOT, 'coverage.json');
const DEFAULT_SKILL_REGISTRY = join(SKILL_ROOT, 'source/skill-registry.toml');

class IngestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  const options = parseOptions(argv);

  try {
    if (command === 'manifest') return runManifest(options);
    if (command === 'extract') return runExtract(options);
    if (command === 'classify') return runClassify(options);
    if (command === 'verify') return runVerify(options);
    throw new IngestError(2, 'unknown command: ' + (command ?? '(none)'));
  } catch (error) {
    if (error instanceof IngestError) {
      console.error('ingest: ' + error.message);
      process.exit(error.code);
    }
    console.error(error.stack ?? String(error));
    process.exit(1);
  }
}

function runManifest(options) {
  const sourceDir = options.source
    ?? (existsSync('docs/archive/IMPLEMENTATION-SPEC')
      ? 'docs/archive/IMPLEMENTATION-SPEC'
      : 'docs/IMPLEMENTATION-SPEC');
  const redactionPath = options.redaction ?? DEFAULT_REDACTION;
  const outPath = options.out ?? DEFAULT_MANIFEST;
  const redactionText = readFileSync(redactionPath, 'utf8');
  const redaction = JSON.parse(redactionText);
  if (!isRedactedMap(redaction)) throw new IngestError(15, 'redaction map is not hash-only');

  const files = SOURCE_FILES.map((name) => {
    const path = join(sourceDir, name).replace(/\\/g, '/');
    const text = normalize(readFileSync(path, 'utf8'));
    return { path, sha256: sha256(text) };
  });
  const sourceSetSha256 = sha256(files.map((file) => file.path + '\0' + file.sha256).join('\n'));
  const lines = [
    'spec_version = "0.3.2"',
    'redaction_sha256 = "' + sha256(redactionText) + '"',
    'source_set_sha256 = "' + sourceSetSha256 + '"',
    '',
    ...files.flatMap((file) => [
      '[[file]]',
      'path = "' + file.path + '"',
      'sha256 = "' + file.sha256 + '"',
      '',
    ]),
  ];
  writeAtomic(outPath, lines.join('\n'));
  process.stdout.write('manifest: ' + files.length + ' files -> ' + outPath + '\n');
  return 0;
}

function runExtract(options) {
  const context = loadContext(options);
  const docs = parseAll(context.manifest, context.redaction, options.source);
  const candidates = docs.map((doc) => ({
    path: doc.path,
    lines: doc.lines,
    coverage: doc.coverage,
    atoms: doc.atoms.filter((atom) => atom.classification === 'normative' || atom.type === 'Rule'),
  }));
  const outPath = options.out;
  if (!outPath) throw new IngestError(10, '--out is required');
  writeAtomic(outPath, JSON.stringify({
    spec_version: context.manifest.spec_version,
    source_manifest_sha256: context.manifestSha256,
    redaction_sha256: context.redactionSha256,
    files: candidates,
  }, null, 2) + '\n');
  process.stdout.write('extract: ' + candidates.length + ' files -> ' + outPath + '\n');
  return 0;
}

function runClassify(options) {
  const context = loadContext(options);
  const docs = parseAll(context.manifest, context.redaction, options.source);
  const decisions = options.decisions
    ? JSON.parse(readFileSync(options.decisions, 'utf8'))
    : {};
  applyDecisions(docs, decisions);

  const { lock, coverage } = buildArtifacts(docs, context);
  const lockPath = options.lock ?? DEFAULT_LOCK;
  const coveragePath = options.coverage ?? DEFAULT_COVERAGE;
  const reportPath = options.report ?? join(dirname(coveragePath), 'coverage.md');
  writeAtomic(lockPath, JSON.stringify(lock, null, 2) + '\n');
  writeAtomic(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
  writeAtomic(reportPath, renderCoverageReport(coverage));
  process.stdout.write('classify: ' + lock.atoms.length + ' atoms, ' + docs.length + ' files -> ' + lockPath + '\n');
  return 0;
}

function runVerify(options) {
  const context = loadContext(options);
  if (context.manifest.redaction_sha256 !== context.redactionSha256) {
    throw new IngestError(10, 'manifest redaction hash mismatch');
  }
  const sourceSetSha256 = sha256(
    context.manifest.files.map((file) => file.path + '\0' + file.sha256).join('\n'),
  );
  if (context.manifest.source_set_sha256 !== sourceSetSha256) {
    throw new IngestError(10, 'manifest source set hash mismatch');
  }

  const docs = parseAll(context.manifest, context.redaction, options.source);
  for (const doc of docs) {
    if (doc.coverage.gaps.length > 0) {
      throw new IngestError(12, 'coverage gap in ' + doc.path + ': ' + doc.coverage.gaps.join(','));
    }
    if (doc.coverage.overlaps.length > 0) {
      throw new IngestError(12, 'coverage overlap in ' + doc.path);
    }
    if (doc.coverage.attributed !== doc.lines) {
      throw new IngestError(12, 'attribution mismatch in ' + doc.path);
    }
  }

  const { lock, coverage } = buildArtifacts(docs, context);
  const lockPath = options.lock ?? DEFAULT_LOCK;
  const coveragePath = options.coverage ?? DEFAULT_COVERAGE;
  if (!existsSync(lockPath)) throw new IngestError(14, 'lock not found: ' + lockPath);
  if (!existsSync(coveragePath)) throw new IngestError(14, 'coverage not found: ' + coveragePath);

  const actualLock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const actualCoverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  if (JSON.stringify(actualLock) !== JSON.stringify(lock)) {
    throw new IngestError(14, 'lock drift: re-run classify');
  }
  if (JSON.stringify(actualCoverage) !== JSON.stringify(coverage)) {
    throw new IngestError(14, 'coverage drift: re-run classify');
  }

  const reportPath = options.report ?? join(dirname(coveragePath), 'coverage.md');
  if (!existsSync(reportPath)) throw new IngestError(14, 'coverage report not found: ' + reportPath);
  if (readFileSync(reportPath, 'utf8') !== renderCoverageReport(coverage)) {
    throw new IngestError(14, 'coverage report drift: re-run classify');
  }

  const skillRegistry = parseSkillRegistry(readFileSync(DEFAULT_SKILL_REGISTRY, 'utf8'));
  assertSkillRegistry(skillRegistry);

  const lines = docs.reduce((total, doc) => total + doc.lines, 0);
  process.stdout.write('verify: ' + docs.length + ' files, ' + lock.atoms.length + ' atoms, ' + lines + ' lines\n');
  return 0;
}

function loadContext(options) {
  const manifestPath = options.manifest ?? DEFAULT_MANIFEST;
  const redactionPath = options.redaction ?? DEFAULT_REDACTION;
  if (!existsSync(manifestPath)) throw new IngestError(10, 'manifest not found: ' + manifestPath);
  if (!existsSync(redactionPath)) throw new IngestError(15, 'redaction not found: ' + redactionPath);

  const manifestText = readFileSync(manifestPath, 'utf8');
  const redactionText = readFileSync(redactionPath, 'utf8');
  const manifest = readManifest(manifestText);
  const redaction = JSON.parse(redactionText);
  if (!isRedactedMap(redaction)) throw new IngestError(15, 'redaction map is not hash-only');

  return {
    manifest,
    manifestSha256: sha256(manifestText),
    redaction,
    redactionSha256: sha256(redactionText),
  };
}

function parseAll(manifest, redaction, sourceDir) {
  const docs = [];
  for (const file of manifest.files) {
    const path = sourceDir ? join(sourceDir, basename(file.path)).replace(/\\/g, '/') : file.path;
    const text = normalize(readFileSync(path, 'utf8'));
    const fileSha256 = sha256(text);
    if (fileSha256 !== file.sha256) {
      throw new IngestError(10, 'source hash mismatch: ' + file.path);
    }
    const doc = parseDocument({ path: file.path, text, redaction });
    docs.push({ ...doc, sha256: fileSha256 });
  }
  return docs;
}

function buildArtifacts(docs, context) {
  const atoms = docs.flatMap((doc) => doc.atoms);
  const registry = registryFromDocs(docs);
  assertBijection(atoms, registry);

  const lock = {
    spec_version: context.manifest.spec_version,
    source_manifest_sha256: context.manifestSha256,
    redaction_sha256: context.redactionSha256,
    atoms,
  };
  const forbidden = findForbiddenTokens(JSON.stringify(lock), context.redaction);
  if (forbidden.length > 0) {
    throw new IngestError(15, 'forbidden identifier in lock: ' + forbidden.length);
  }

  const coverage = {
    spec_version: context.manifest.spec_version,
    source_manifest_sha256: context.manifestSha256,
    files: docs.map((doc) => ({
      path: doc.path,
      sha256: doc.sha256,
      lines: doc.lines,
      attributed: doc.coverage.attributed,
      excluded: doc.coverage.excluded,
      gaps: doc.coverage.gaps,
      overlaps: doc.coverage.overlaps,
    })),
    gaps: docs.flatMap((doc) => doc.coverage.gaps.map((line) => ({ path: doc.path, line }))),
    overlaps: docs.flatMap((doc) => doc.coverage.overlaps.map((overlap) => ({
      path: doc.path,
      line: overlap.line,
      first: overlap.first,
      second: overlap.second,
    }))),
  };
  return { lock, coverage };
}

function registryFromDocs(docs) {
  const doc = docs.find((item) => item.path.endsWith(REGISTRY_FILE));
  if (!doc || !doc.registry || doc.registry.size === 0) {
    throw new IngestError(13, 'registry table not found');
  }
  return doc.registry;
}

function applyDecisions(docs, decisions) {
  for (const doc of docs) {
    for (const atom of doc.atoms) {
      const decision = decisions[atom.id];
      if (!decision) continue;
      atom.classification = decision.classification;
      atom.reason = decision.reason ?? atom.reason;
      if (decision.reviewer) atom.reviewer = decision.reviewer;
    }
  }
}

function readManifest(text) {
  const manifest = {
    spec_version: '',
    redaction_sha256: '',
    source_set_sha256: '',
    files: [],
  };
  let current = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '[[file]]') {
      current = {};
      manifest.files.push(current);
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"(.*)"$/);
    if (!match) continue;
    if (current) current[match[1]] = match[2];
    else manifest[match[1]] = match[2];
  }
  return manifest;
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const equals = body.indexOf('=');
    if (equals >= 0) {
      options[body.slice(0, equals)] = body.slice(equals + 1);
    } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      options[body] = argv[++index];
    } else {
      options[body] = 'true';
    }
  }
  return options;
}

function normalize(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp';
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

main();
