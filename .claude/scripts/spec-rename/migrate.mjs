import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { computeSelfHash } from '../workspacify-tree/lib/render.mjs';
import { buildReferenceBlock } from '../workspacify-allocate/lib/reference-block.mjs';
import {
  computeAllocateSelfHash,
  resealAllocateManifest,
} from '../workspacify-allocate/lib/allocate-manifest.mjs';
import { computeRfcDigest } from '../spec-formula/ledger.mjs';
import { recordIdOf } from '../shared-obligations/evidence.mjs';

const require = createRequire(import.meta.url);
const {
  rebuildTreeManifestHashes,
  rebuildDesignHashes,
  rebuildDistributionDigests,
  verifyAllocateChain,
} = require('../tickets/rebuild-design-hashes.js');

export const OLD_SPEC = 'GaiaSekkeiShiyousho_v32.md';
export const NEW_SPEC = 'SYSTEM-DESIGN.md';
export const OLD_SEQ_JSON = 'GaiaSekkeiShiyousho_v32-sequences.json';
export const NEW_SEQ_JSON = 'SYSTEM-DESIGN-sequences.json';
export const OLD_SEQ_MD = 'GaiaSekkeiShiyousho_v32-sequences.md';
export const NEW_SEQ_MD = 'SYSTEM-DESIGN-sequences.md';

const OLD_TOKEN = 'GaiaSekkeiShiyousho_v32';
const NEW_TOKEN = 'SYSTEM-DESIGN';
const TREE_MANIFEST = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const EVIDENCE_MANIFEST = 'educe-sequences/EVIDENCE-MANIFEST.json';
const EDUCE_STATUS = 'educe-sequences/status.json';
const EDUCE_DEMAND = 'educe-sequences/demand.json';
const SMOOTH_STATUS = 'smooth-sequences/status.json';
const SMOOTH_VERDICT = 'SMOOTH-VERDICT.json';

const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.jsonl', '.js', '.mjs', '.cjs', '.rs', '.toml', '.txt',
  '.html', '.out', '.yaml', '.yml', '.sh',
]);
const TEXT_FILENAMES = new Set(['Makefile']);

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'target', 'dist', 'build']);

/** Frozen history and audit zones; a byte in one of these is never rewritten. */
const FROZEN_PATTERNS = [
  /^regeneration\//,
  /^archive\//,
  /^docs\/archive\//,
  /^progress-gif\//,
  /^smooth-sequences\/archive\//,
  /^educe-sequences\/archive\//,
  /^educe-sequences\/readings-[^/]*\.jsonl$/,
  /^educe-sequences\/EVIDENCE-MANIFEST\.json$/,
  /^educe-sequences\/status\.json$/,
  /^educe-sequences\/demand\.json$/,
  /^smooth-sequences\/status\.json$/,
  /^smooth-sequences\/SMOOTH-SEQUENCES\.(json|md)$/,
  /^smooth-sequences\/(CALIBRATION|COMPLETION-CERTIFICATE|JUDGMENT-WORKLIST|SPEC-COMPLETENESS-WORKLIST)\.json$/,
  /^SMOOTH-VERDICT\.json$/,
  /^SMOOTH-SEQUENCES-REPAIRS\.json$/,
  /^SMOOTH-SEQUENCES-ANNOTATIONS\.json$/,
  /^crates\/.*\/(Tickets\.pre-[^/]*|Status\.json\.bak[^/]*|Tickets-\d{14}\.json|[^/]*\.pre-[^/]*|[^/]*\.bak[^/]*)$/,
];

/** Owner-regenerated files: the migration does not text-edit them generically. */
const OWNER_REGENERATED_PATTERNS = [
  /^educe-sequences\/readings-[^/]*\.jsonl$/,
  /^educe-sequences\/EVIDENCE-MANIFEST\.json$/,
  /^educe-sequences\/status\.json$/,
  /^educe-sequences\/demand\.json$/,
  /^smooth-sequences\/status\.json$/,
  /^smooth-sequences\/SMOOTH-SEQUENCES\.(json|md)$/,
  /^smooth-sequences\/(CALIBRATION|COMPLETION-CERTIFICATE|JUDGMENT-WORKLIST|SPEC-COMPLETENESS-WORKLIST)\.json$/,
  /^SMOOTH-VERDICT\.json$/,
];

const DEFAULT_TICKET_PATHS = ['Tickets.json', 'specs/', '.conver-history.jsonl'];

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function toPosix(path) {
  return path.split('\\').join('/');
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function digestOfBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function digestOfFile(file) {
  return digestOfBytes(readFileSync(file));
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function atomicWrite(file, content) {
  const staged = `${file}.partial.${process.pid}`;
  writeFileSync(staged, content);
  renameSync(staged, file);
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isTextCandidate(relativePath) {
  const name = basename(relativePath);
  if (TEXT_FILENAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot));
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isFrozen(relativePath) {
  return FROZEN_PATTERNS.some((pattern) => pattern.test(relativePath));
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isOwnerRegenerated(relativePath) {
  return OWNER_REGENERATED_PATTERNS.some((pattern) => pattern.test(relativePath));
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isTooling(relativePath) {
  return relativePath.startsWith('.claude/scripts/spec-rename/')
    || relativePath.startsWith('.claude/tests/scripts/spec-rename/');
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isTicketPath(relativePath, ticketPaths) {
  return ticketPaths.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

/** Every regular text file under root, as root-relative POSIX paths. */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function walkTextFiles(root) {
  const found = [];
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        walk(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const full = join(directory, entry.name);
      const rel = toPosix(relative(root, full));
      if (isTextCandidate(rel)) found.push(rel);
    }
  }
  walk(root);
  return found.sort();
}

/** Refuse a write outside the live set before it happens. */
export function assertWritable(root, relativePath) {
  const normalized = toPosix(relativePath);
  if (isFrozen(normalized)) {
    throw new Error(`FROZEN_PATH_WRITE_REFUSED: ${normalized}`);
  }
  if (isTooling(normalized)) {
    throw new Error(`TOOLING_PATH_WRITE_REFUSED: ${normalized}`);
  }
  if (!existsSync(join(root, normalized))) {
    // A new file is allowed only when the caller is the migration itself.
    return normalized;
  }
  return normalized;
}

/** Classify the workspace before any write. */
export async function classify({ root, ticketPaths = DEFAULT_TICKET_PATHS } = {}) {
  const renames = [
    { from: OLD_SPEC, to: NEW_SPEC },
    { from: OLD_SEQ_JSON, to: NEW_SEQ_JSON },
    { from: OLD_SEQ_MD, to: NEW_SEQ_MD },
  ].map((entry) => ({
    ...entry,
    sha256: existsSync(join(root, entry.from)) ? digestOfFile(join(root, entry.from)) : null,
  }));

  const sequencesArtifacts = readdirSync(root)
    .filter((name) => name.endsWith('-sequences.json'))
    .sort();

  const live = [];
  const frozen = [];
  const ownerRegenerated = [];
  const findings = [];

  for (const rel of walkTextFiles(root)) {
    if (isTooling(rel) || isTicketPath(rel, ticketPaths)) continue;
    const content = readFileSync(join(root, rel), 'utf8');
    if (!content.includes(OLD_TOKEN)) continue;
    const occurrences = content.split(OLD_TOKEN).length - 1;
    if (isFrozen(rel)) {
      frozen.push({ path: rel, occurrences });
    } else if (isOwnerRegenerated(rel)) {
      ownerRegenerated.push({ path: rel, occurrences });
    } else {
      live.push({ path: rel, occurrences });
    }
  }

  if (sequencesArtifacts.length !== 1) {
    findings.push({
      code: 'AMBIGUOUS_SEQUENCES_ARTIFACT',
      detail: `expected exactly one root *-sequences.json, found ${sequencesArtifacts.length}`,
    });
  }
  for (const entry of renames) {
    if (existsSync(join(root, entry.to))) {
      findings.push({ code: 'NEW_NAME_OCCUPIED', detail: `${entry.to} already exists` });
    }
  }

  return {
    ok: findings.length === 0,
    root,
    renames,
    sequencesArtifacts,
    live,
    frozen,
    ownerRegenerated,
    findings,
  };
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function assertPreconditions(report, root, expectedSpecSha256) {
  if (!report.ok) {
    const codes = report.findings.map((f) => f.code).join(',');
    throw new Error(codes || 'CLASSIFY_FAILED');
  }
  const missing = report.renames.filter((entry) => !existsSync(join(root, entry.from)));
  if (missing.length > 0) {
    const already = report.renames.find((entry) => existsSync(join(root, entry.to)));
    throw new Error(already ? `ALREADY_MIGRATED: ${already.to}` : `SOURCE_MISSING: ${missing.map((e) => e.from).join(',')}`);
  }
  const tree = JSON.parse(readFileSync(join(root, TREE_MANIFEST), 'utf8'));
  const expected = expectedSpecSha256 ?? tree?.input?.source_hash ?? null;
  const actual = report.renames.find((entry) => entry.from === OLD_SPEC).sha256;
  if (expected !== null && actual !== expected) {
    throw new Error(`SPEC_BYTES_WOULD_CHANGE: expected ${expected}, found ${actual}`);
  }
  return { tree, specSha256: actual };
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function renameDesignDocuments(root, report) {
  for (const entry of report.renames) {
    execFileSync('git', ['mv', entry.from, entry.to], { cwd: root, encoding: 'utf8' });
  }
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function rewriteLiveReferences(root, report) {
  let changed = 0;
  for (const entry of report.live) {
    assertWritable(root, entry.path);
    const file = join(root, entry.path);
    const before = readFileSync(file, 'utf8');
    const after = before.split(OLD_TOKEN).join(NEW_TOKEN);
    if (after !== before) {
      atomicWrite(file, after);
      changed += 1;
    }
  }
  return changed;
}

/** Rewrite the renamed documents that are not the content-addressed sequences artifact. */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function rewriteRenamedDocumentContents(root) {
  for (const rel of [NEW_SPEC, NEW_SEQ_MD]) {
    const file = join(root, rel);
    const before = readFileSync(file, 'utf8');
    const after = before.split(OLD_TOKEN).join(NEW_TOKEN);
    if (after !== before) atomicWrite(file, after);
  }
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function resealTreeManifest({ root }) {
  const manifestPath = join(root, TREE_MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.input = { ...(manifest.input ?? {}), spec_path: NEW_SPEC };
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return rebuildTreeManifestHashes({ manifestPath, specPath: join(root, NEW_SPEC) });
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function replaceSeedReferenceBlock(seedText, block) {
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(seedText);
  if (match === null) {
    throw new Error('SEED_REFERENCE_BLOCK_MISSING');
  }
  const rendered = JSON.stringify(block, null, 2);
  return seedText.slice(0, match.index) + '```json\n' + rendered + '\n```' + seedText.slice(match.index + match[0].length);
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function resealSeeds({ root, tree, manifestPath }) {
  const seedFiles = walkTextFiles(root)
    .filter((rel) => rel.startsWith('crates/') && rel.endsWith('/RFC-SEED.md') && !isFrozen(rel));
  let changed = 0;
  for (const rel of seedFiles) {
    const file = join(root, rel);
    const text = readFileSync(file, 'utf8');
    const match = /```json\s*\n([\s\S]*?)\n```/.exec(text);
    if (match === null) continue;
    const current = JSON.parse(match[1]);
    const pkgPath = current?.package?.path;
    const pkg = (tree.workspace?.packages ?? []).find((entry) => entry.path === pkgPath);
    if (pkg === undefined) {
      throw new Error(`SEED_PACKAGE_UNKNOWN: ${rel} -> ${pkgPath}`);
    }
    const block = buildReferenceBlock({
      manifestRef: { manifest: tree, manifestPath, manifestDir: root },
      seed: {
        package: pkg,
        orderEntry: current.implementation_order ?? {},
        contractIds: current.contract_refs ?? [],
        sourceSegments: current.source_segments ?? [],
      },
    });
    const rewritten = replaceSeedReferenceBlock(text, block);
    if (rewritten !== text) {
      atomicWrite(file, rewritten);
      changed += 1;
    }
  }
  return changed;
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function resealAllocate({ root }) {
  const path = join(root, ALLOCATE_MANIFEST);
  if (!existsSync(path)) return null;
  const current = JSON.parse(readFileSync(path, 'utf8'));
  const next = resealAllocateManifest(current, { workspaceRoot: root });
  atomicWrite(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** Rebind the sequences artifact identity and the evidence that names it. */
export function rebindArtifactIdentity({ root, fromSpecPath = OLD_SPEC, toSpecPath = NEW_SPEC }) {
  const artifactPath = join(root, NEW_SEQ_JSON);
  if (!existsSync(artifactPath)) return { ok: false, reason: 'ARTIFACT_MISSING' };
  const beforeDigest = digestOfFile(artifactPath);
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  if (artifact?.spec?.path !== fromSpecPath) {
    return { ok: false, reason: 'ARTIFACT_SPEC_PATH_NOT_OLD' };
  }
  artifact.spec = { ...artifact.spec, path: toSpecPath };
  atomicWrite(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  const afterDigest = digestOfFile(artifactPath);

  const manifestPath = join(root, EVIDENCE_MANIFEST);
  if (!existsSync(manifestPath)) {
    return { ok: true, fromDigest: beforeDigest, toDigest: afterDigest, manifestUpdated: false };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const changedReadingFiles = [];
  for (const rel of walkTextFiles(root)) {
    if (!rel.startsWith('educe-sequences/readings-')) continue;
    if (!rel.endsWith('.jsonl')) continue;
    const file = join(root, rel);
    const before = readFileSync(file, 'utf8');
    if (!before.includes(beforeDigest) && !before.includes(fromSpecPath)) continue;
    let rewritten = before.split(fromSpecPath).join(toSpecPath).split(beforeDigest).join(afterDigest);
    if (rel.endsWith('readings-judgment.jsonl')) {
      rewritten = `${rewritten.trimEnd().split('\n').map((line) => {
        const record = JSON.parse(line);
        return JSON.stringify({ ...record, recordId: recordIdOf(record) });
      }).join('\n')}\n`;
    }
    if (rewritten !== before) {
      atomicWrite(file, rewritten);
      changedReadingFiles.push(rel);
    }
  }

  if (manifest?.spec?.path === fromSpecPath) manifest.spec.path = toSpecPath;
  if (manifest?.artifact !== undefined) {
    const oldArtifactPath = manifest.artifact.path;
    if (typeof oldArtifactPath === 'string') {
      manifest.artifact.path = join(dirname(oldArtifactPath), NEW_SEQ_JSON);
    }
    manifest.artifact.sha256 = afterDigest;
  }
  for (const receipt of manifest.receipts ?? []) {
    if (receipt?.inputs?.artifact === beforeDigest) receipt.inputs.artifact = afterDigest;
  }
  for (const receipt of manifest.writeReceipts ?? []) {
    const file = join(root, receipt.path);
    if (existsSync(file)) receipt.sha256 = digestOfFile(file);
  }
  manifest.identityMigration = {
    kind: 'spec-path-only',
    fromSpecPath,
    toSpecPath,
    fromArtifactSha256: beforeDigest,
    toArtifactSha256: afterDigest,
    specSha256: artifact?.spec?.sha256 ?? null,
    proof: 'the artifact differs only in spec.path; spec.sha256 and spec.lines are unchanged',
    readingFiles: changedReadingFiles,
  };
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { ok: true, fromDigest: beforeDigest, toDigest: afterDigest, manifestUpdated: true };
}

/** Update the educe run-state identity without opening a generation. */
export function migrateEduceIdentity({ educeDir, from = OLD_SPEC, to = NEW_SPEC }) {
  const updates = [];
  for (const [fileName, selector] of [
    ['status.json', (doc) => doc?.spec],
    ['demand.json', (doc) => doc?.measuredAgainst],
  ]) {
    const file = join(educeDir, fileName);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const target = selector(doc);
    if (target === undefined || target === null) continue;
    if (target.path === from) {
      target.path = to;
      atomicWrite(file, `${JSON.stringify(doc, null, 2)}\n`);
      updates.push(fileName);
    }
  }
  return updates;
}

/** Re-seal each formula ledger and sidecar's RFC digest after the RFC citations changed. */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function resealFormulaDigests(root) {
  let changed = 0;
  for (const rel of walkTextFiles(root)) {
    if (!rel.startsWith('crates/') || !rel.endsWith('/RFC.md') || isFrozen(rel)) continue;
    const rfcPath = join(root, rel);
    const rfcText = readFileSync(rfcPath, 'utf8');
    const digest = computeRfcDigest(rfcText);
    const rewritten = rfcText.replace(/(rfcDigest:\s*`)[0-9a-f]{64}(`)/, `$1${digest}$2`);
    if (rewritten !== rfcText) {
      atomicWrite(rfcPath, rewritten);
      changed += 1;
    }
    const sidecarPath = join(root, dirname(rel), 'RFC-FORMULAS.json');
    if (!existsSync(sidecarPath)) continue;
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    if (sidecar.rfcDigest !== digest) {
      sidecar.rfcDigest = digest;
      atomicWrite(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
      changed += 1;
    }
  }
  return changed;
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function rebuildPackageDigests(root) {
  const findings = [];
  for (const rel of walkTextFiles(root)) {
    if (rel.endsWith('/Tickets.json') && rel.startsWith('crates/')) {
      const result = rebuildDistributionDigests({ ticketsPath: join(root, rel) });
      if (result?.refreshed) findings.push({ code: 'DISTRIBUTION_DIGESTS_REFRESHED', path: rel });
    }
  }
  for (const rel of walkTextFiles(root)) {
    if (!rel.endsWith('/RFC.md') || !rel.startsWith('crates/')) continue;
    const packageDir = join(root, dirname(rel));
    try {
      const result = await rebuildDesignHashes({ cwd: packageDir });
      for (const finding of result?.findings ?? []) {
        findings.push({ code: finding.code ?? 'DESIGN_HASH_FINDING', path: rel });
      }
    } catch (error) {
      findings.push({ code: 'DESIGN_HASH_UNREADABLE', path: rel, detail: error.message });
    }
  }
  return findings;
}

/** Rename, rewrite, re-seal and rebind the workspace identity. */
export async function apply({ root, expectedSpecSha256 = null, ticketPaths = DEFAULT_TICKET_PATHS } = {}) {
  const oldNames = [OLD_SPEC, OLD_SEQ_JSON, OLD_SEQ_MD];
  const newNames = [NEW_SPEC, NEW_SEQ_JSON, NEW_SEQ_MD];
  if (oldNames.every((name) => !existsSync(join(root, name))) && newNames.every((name) => existsSync(join(root, name)))) {
    throw new Error(`ALREADY_MIGRATED: ${NEW_SPEC}`);
  }
  const report = await classify({ root, ticketPaths });
  const { tree, specSha256 } = assertPreconditions(report, root, expectedSpecSha256);

  renameDesignDocuments(root, report);

  // The sequences artifact is content-addressed evidence: its spec.path is changed
  // by the rebind step so the old digest is known before the bytes move. The other
  // renamed documents are rewritten in place under their new names.
  const renameSources = new Set([OLD_SPEC, OLD_SEQ_JSON, OLD_SEQ_MD]);
  const liveWithoutRenames = report.live.filter((entry) => !renameSources.has(entry.path));
  const changedLive = rewriteLiveReferences(root, { ...report, live: liveWithoutRenames });
  rewriteRenamedDocumentContents(root);

  const resealedTree = await resealTreeManifest({ root });
  const seedChanges = await resealSeeds({ root, tree: resealedTree, manifestPath: join(root, TREE_MANIFEST) });
  const allocate = await resealAllocate({ root });
  const rebound = rebindArtifactIdentity({ root });
  const educeUpdates = migrateEduceIdentity({ educeDir: join(root, 'educe-sequences') });
  const formulaChanges = await resealFormulaDigests(root);
  const packageFindings = await rebuildPackageDigests(root);

  return {
    ok: true,
    specSha256,
    changedLive,
    seedChanges,
    allocateHash: allocate?.integrity?.manifest_hash ?? null,
    rebound,
    educeUpdates,
    formulaChanges,
    packageFindings,
  };
}

/** Read the exact live reference count, excluding frozen and owner-regenerated files. */
export async function verify({ root, ticketPaths = DEFAULT_TICKET_PATHS } = {}) {
  const findings = [];
  const report = await classify({ root, ticketPaths });

  if (report.live.length > 0) {
    findings.push({
      code: 'LIVE_REFERENCE_REMAINS',
      detail: report.live.map((entry) => `${entry.path}:${entry.occurrences}`).join(','),
    });
  }
  if (report.sequencesArtifacts.length !== 1 || report.sequencesArtifacts[0] !== NEW_SEQ_JSON) {
    findings.push({ code: 'SEQUENCES_ARTIFACT_NOT_SINGULAR', detail: report.sequencesArtifacts.join(',') });
  }
  for (const entry of report.renames) {
    if (!existsSync(join(root, entry.to))) {
      findings.push({ code: 'NEW_NAME_MISSING', detail: entry.to });
    }
  }

  const tree = JSON.parse(readFileSync(join(root, TREE_MANIFEST), 'utf8'));
  if (tree.input?.spec_path !== NEW_SPEC) {
    findings.push({ code: 'TREE_SPEC_PATH_STALE', detail: tree.input?.spec_path ?? '(absent)' });
  }
  if (tree.integrity?.manifest_hash !== computeSelfHash(tree)) {
    findings.push({ code: 'TREE_SELF_HASH_MISMATCH' });
  }

  const allocatePath = join(root, ALLOCATE_MANIFEST);
  if (existsSync(allocatePath)) {
    const allocate = JSON.parse(readFileSync(allocatePath, 'utf8'));
    if (allocate.input_tree_manifest?.hash !== tree.integrity?.manifest_hash) {
      findings.push({ code: 'ALLOCATE_TREE_LINK_MISMATCH' });
    }
    if (allocate.input_tree_manifest?.spec?.path !== NEW_SPEC) {
      findings.push({ code: 'ALLOCATE_SPEC_PATH_STALE' });
    }
    if (computeAllocateSelfHash(allocate) !== allocate.integrity?.manifest_hash) {
      findings.push({ code: 'ALLOCATE_SELF_HASH_MISMATCH' });
    }
    const chain = await verifyAllocateChain({ workspaceRoot: root });
    for (const finding of chain.findings ?? []) {
      findings.push({ code: finding.code ?? 'ALLOCATE_CHAIN_FINDING', detail: finding.problem ?? '' });
    }
  }

  for (const rel of walkTextFiles(root).filter((path) => path.startsWith('crates/') && path.endsWith('/RFC-SEED.md') && !isFrozen(path))) {
    const match = /```json\s*\n([\s\S]*?)\n```/.exec(readFileSync(join(root, rel), 'utf8'));
    if (match === null) {
      findings.push({ code: 'SEED_BLOCK_MISSING', detail: rel });
      continue;
    }
    const block = JSON.parse(match[1]);
    if (block?.source_spec?.path !== NEW_SPEC) {
      findings.push({ code: 'SEED_SPEC_PATH_STALE', detail: rel });
    }
    if (block?.stage1_manifest?.hash !== tree.integrity?.manifest_hash) {
      findings.push({ code: 'SEED_STAGE1_LINK_STALE', detail: rel });
    }
  }

  const educeStatus = join(root, EDUCE_STATUS);
  if (existsSync(educeStatus)) {
    const status = JSON.parse(readFileSync(educeStatus, 'utf8'));
    if (status?.spec?.path !== NEW_SPEC) {
      findings.push({ code: 'EDUCE_SPEC_PATH_STALE', detail: status?.spec?.path ?? '(absent)' });
    }
  }

  const smoothStatus = join(root, SMOOTH_STATUS);
  const verdict = join(root, SMOOTH_VERDICT);
  if (existsSync(smoothStatus) && existsSync(verdict)) {
    const { computeInputDigest } = await import('../sequences-slice/lib/smooth-verdict.mjs');
    const expected = computeInputDigest(root);
    const statusDigest = JSON.parse(readFileSync(smoothStatus, 'utf8'))?.inputDigest;
    const verdictDigest = JSON.parse(readFileSync(verdict, 'utf8'))?.inputDigest;
    if (statusDigest !== expected) {
      findings.push({ code: 'STALE_SMOOTH_VERDICT', detail: 'smooth-sequences/status.json' });
    }
    if (verdictDigest !== expected) {
      findings.push({ code: 'STALE_SMOOTH_VERDICT', detail: SMOOTH_VERDICT });
    }
  }

  const frozenTouched = frozenByteChanges(root);
  if (frozenTouched.length > 0) {
    findings.push({ code: 'FROZEN_PATH_CHANGED', detail: frozenTouched.join(',') });
  }

  return { ok: findings.length === 0, findings };
}

/** Owner archives may gain new entries; their earlier entries stay byte-identical. */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function isOwnerArchive(relativePath) {
  return relativePath.startsWith('smooth-sequences/archive/')
    || relativePath.startsWith('educe-sequences/archive/');
}

/**
 * The frozen paths whose *bytes* changed.
 *
 * Owner-regenerated live evidence may move through its owner tool, and an owner
 * archive may gain a new generation directory; neither rewrites an earlier byte.
 * A tracked frozen file modified in place, or a new file outside an owner archive,
 * is a history rewrite and fails.
 */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function frozenByteChanges(root) {
  const tracked = execFileSync('git', ['diff', '--name-status', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 512 * 1024 * 1024,
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const violations = [];
  for (const line of tracked.split('\n').filter(Boolean)) {
    const [status, ...paths] = line.split('\t');
    for (const path of paths) {
      if (!isFrozen(path) || isOwnerRegenerated(path)) continue;
      if (status === 'A' && isOwnerArchive(path)) continue;
      violations.push(path);
    }
  }
  for (const path of untracked.split('\n').map((line) => line.trim()).filter(Boolean)) {
    if (!isFrozen(path)) continue;
    if (isOwnerArchive(path)) continue;
    violations.push(path);
  }
  return violations;
}

/** Parse `--root=` and the subcommand from the process arguments. */
// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
function parseCli(argv) {
  const [command = '', ...rest] = argv;
  const rootArgument = rest.find((arg) => arg.startsWith('--root='));
  const root = rootArgument === undefined ? process.cwd() : resolve(rootArgument.slice('--root='.length));
  return { command, root };
}

// [::TICKET::] PX-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-1 --for-spec --no-implementation-order`.
async function main(argv) {
  const { command, root } = parseCli(argv);
  if (command === 'classify') {
    process.stdout.write(`${JSON.stringify(await classify({ root }), null, 2)}\n`);
    return 0;
  }
  if (command === 'apply') {
    process.stdout.write(`${JSON.stringify(await apply({ root }), null, 2)}\n`);
    return 0;
  }
  if (command === 'verify') {
    const result = await verify({ root });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  process.stderr.write('usage: migrate.mjs <classify|apply|verify> [--root=<workspace>]\n');
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
