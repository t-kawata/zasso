/**
 * Resolve the specification identity the three stage records already hold.
 *
 * The seed is the authority for what this package was given. The INFO document and the
 * sequences artifact each recorded the same hash independently; reading all three is
 * what turns "the seed says" into "every record agrees".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';

/** The stage-one seed whose section 1 carries the identity block. */
export const SEED_FILENAME = 'RFC-SEED.md';

/** The generated facts document whose section 1 records the specification hash. */
export const INFO_FILENAME = 'INFO-RFC-SEED.md';

/** The suffix of the workspace sequences artifact. */
export const SEQUENCES_SUFFIX = '-sequences.json';

const JSON_FENCE = /```json\r?\n([\s\S]*?)```/g;

/** A refusal that names the record which could not be read. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
export class SpecIdentityError extends Error {
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
  constructor(code, message) {
    super(message);
    this.name = 'SpecIdentityError';
    this.code = code;
  }
}

/** @param {string} seedText @returns {{packageId: string|null, sourceSpec: {path: string, sha256: string}, sourceSegments: string[]|null, stage1Manifest: object|null}} */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
export function parseSeedIdentity(seedText) {
  JSON_FENCE.lastIndex = 0;
  let match;
  while ((match = JSON_FENCE.exec(seedText)) !== null) {
    let block;
    try {
      block = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (block && typeof block === 'object' && block.source_spec && typeof block.source_spec === 'object') {
      const path = block.source_spec.path;
      const sha256 = block.source_spec.sha256;
      if (typeof path !== 'string' || path.length === 0 || typeof sha256 !== 'string' || sha256.length === 0) {
        throw new SpecIdentityError('SEED_IDENTITY_INCOMPLETE', `the seed records an incomplete source_spec: ${SEED_FILENAME}`);
      }
      return {
        packageId: block.package?.id ?? null,
        sourceSpec: { path, sha256 },
        sourceSegments: Array.isArray(block.source_segments) ? [...block.source_segments] : null,
        stage1Manifest: block.stage1_manifest ?? null,
      };
    }
  }

  throw new SpecIdentityError('SEED_IDENTITY_MISSING', `the seed records no identity block: ${SEED_FILENAME}`);
}

/** @param {string} infoText @returns {{path: string, sha256: string}|null} */
export function parseInfoSpecification(infoText) {
  const match = /^-\s+specification:\s+`([^`]+)`\s+\(sha256\s+`([0-9a-f]{64})`\)/m.exec(infoText);
  return match === null ? null : { path: match[1], sha256: match[2] };
}

/** @param {object} artifact @returns {{path: string, sha256: string, lines: number|null}} */
export function parseSequencesSpec(artifact) {
  const spec = artifact?.spec;
  if (!spec || typeof spec.path !== 'string' || typeof spec.sha256 !== 'string' || spec.sha256.length === 0) {
    throw new SpecIdentityError('SEQUENCES_SPEC_INCOMPLETE', 'the sequences artifact records no spec.path and spec.sha256');
  }
  return {
    path: spec.path,
    sha256: spec.sha256,
    lines: Number.isInteger(spec.lines) ? spec.lines : null,
  };
}

/** The nearest ancestor holding both workspace manifests, or null. */
export function resolveWorkspaceRoot(startDirectory) {
  let directory = resolve(startDirectory);
  if (existsSync(directory) && statSync(directory).isFile()) directory = dirname(directory);

  for (;;) {
    const hasTree = existsSync(join(directory, 'WORKSPACIFY-TREE-MANIFEST.json'));
    const hasAllocate = existsSync(join(directory, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
    if (hasTree && hasAllocate) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/** The workspace root's one sequences artifact, or null. */
export function findSequencesArtifact(workspaceRoot) {
  const candidates = readdirSync(workspaceRoot)
    .filter((name) => name.endsWith(SEQUENCES_SUFFIX))
    .sort();
  return candidates.length === 1 ? join(workspaceRoot, candidates[0]) : null;
}

/** One finding with the record that produced it. */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function finding(code, message, extra = {}) {
  return { code, message, ...extra };
}

/**
 * Compare every recorded hash with the bytes on disk.
 *
 * @param {{rfcDir: string, workspaceRoot: string, sequencesArtifactPath?: string|null}} input
 * @returns {{
 *   ok: boolean,
 *   specPath: string|null,
 *   specSha256: string|null,
 *   lines: number|null,
 *   recorded: {seed: string|null, info: string|null, sequences: string|null},
 *   findings: Array<{code: string, message: string}>,
 * }}
 */
export function verifySourceIdentity({ rfcDir, workspaceRoot, sequencesArtifactPath = null }) {
  const blocking = [];
  const advisories = [];
  const recorded = { seed: null, info: null, sequences: null };

  const blockingFinding = (code, message, extra = {}) => ({
    ...finding(code, message, extra),
    severity: 'blocking',
  });
  const secondaryFinding = (record, detail, message, extra = {}) => ({
    ...finding('STALE_SECONDARY_RECORD', message, { record, detail, severity: 'advisory', ...extra }),
    severity: 'advisory',
  });

  const result = (specPath, specSha256, lines) => ({
    ok: blocking.length === 0,
    specPath,
    specSha256,
    lines,
    recorded,
    blocking,
    advisories,
    findings: [...blocking, ...advisories],
  });

  let identity;
  try {
    identity = parseSeedIdentity(readFileSync(join(rfcDir, SEED_FILENAME), 'utf8'));
  } catch (error) {
    const code = error instanceof SpecIdentityError ? error.code : 'SEED_UNREADABLE';
    blocking.push(blockingFinding(code, error.message));
    return result(null, null, null);
  }

  recorded.seed = identity.sourceSpec.sha256;
  const specPath = resolve(workspaceRoot, identity.sourceSpec.path);
  let specBytes;
  try {
    specBytes = readFileSync(specPath);
  } catch {
    blocking.push(blockingFinding('SPECIFICATION_UNREADABLE', `the specification cannot be read: ${identity.sourceSpec.path}`));
    return result(specPath, null, null);
  }

  const specSha256 = sha256Hex(specBytes);
  const lines = specBytes.toString('utf8').split('\n').length;

  if (specSha256 !== identity.sourceSpec.sha256) {
    blocking.push(blockingFinding(
      'SPEC_HASH_MISMATCH',
      `the seed records ${identity.sourceSpec.sha256} and the specification is ${specSha256}`,
      { record: 'seed' },
    ));
  }

  const infoPath = join(rfcDir, INFO_FILENAME);
  if (!existsSync(infoPath)) {
    advisories.push(secondaryFinding(INFO_FILENAME, 'INFO_MISSING', `${INFO_FILENAME} is not present beside the seed`));
  } else {
    const info = parseInfoSpecification(readFileSync(infoPath, 'utf8'));
    if (info === null) {
      advisories.push(secondaryFinding(INFO_FILENAME, 'INFO_SPECIFICATION_MISSING', `${INFO_FILENAME} records no specification hash line`));
    } else {
      recorded.info = info.sha256;
      if (info.sha256 !== specSha256) {
        advisories.push(secondaryFinding(
          INFO_FILENAME,
          'INFO_HASH_MISMATCH',
          `${INFO_FILENAME} records ${info.sha256} and the specification is ${specSha256}`,
          { actual: info.sha256, expected: specSha256 },
        ));
      }
      if (basename(info.path) !== basename(identity.sourceSpec.path)) {
        advisories.push(secondaryFinding(
          INFO_FILENAME,
          'INFO_PATH_MISMATCH',
          `${INFO_FILENAME} records ${info.path} and the seed records ${identity.sourceSpec.path}`,
          { actual: info.path, expected: identity.sourceSpec.path },
        ));
      }
    }
  }

  const artifactPath = sequencesArtifactPath ?? findSequencesArtifact(workspaceRoot);
  if (artifactPath !== null) {
    try {
      const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
      const sequences = parseSequencesSpec(artifact);
      recorded.sequences = sequences.sha256;
      if (sequences.sha256 !== specSha256) {
        advisories.push(secondaryFinding(
          artifactPath,
          'SEQUENCES_HASH_MISMATCH',
          `the sequences artifact records ${sequences.sha256} and the specification is ${specSha256}`,
          { actual: sequences.sha256, expected: specSha256 },
        ));
      }
      if (basename(sequences.path) !== basename(identity.sourceSpec.path)) {
        advisories.push(secondaryFinding(
          artifactPath,
          'SEQUENCES_PATH_MISMATCH',
          `the sequences artifact records ${sequences.path} and the seed records ${identity.sourceSpec.path}`,
          { actual: sequences.path, expected: identity.sourceSpec.path },
        ));
      }
      if (sequences.lines !== null && sequences.lines !== lines) {
        advisories.push(secondaryFinding(
          artifactPath,
          'SEQUENCES_LINES_MISMATCH',
          `the sequences artifact records ${sequences.lines} lines and the specification has ${lines}`,
          { actual: sequences.lines, expected: lines },
        ));
      }
    } catch (error) {
      const code = error instanceof SpecIdentityError ? error.code : 'SEQUENCES_UNREADABLE';
      advisories.push(secondaryFinding(artifactPath, code, error.message));
    }
  }

  return result(specPath, specSha256, lines);
}
