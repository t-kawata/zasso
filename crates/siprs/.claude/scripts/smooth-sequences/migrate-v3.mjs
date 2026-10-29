#!/usr/bin/env node
/**
 * migrate-v3 — add the typed step contract and the v3 operation fields to a v2 artifact.
 *
 * Usage:
 *   node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/migrate-v3.mjs" [workspace-root] [--dry-run]
 *
 * The argument, or the current directory when omitted, is the workspace root itself; the
 * migration never walks up to a parent. The migration is deterministic and idempotent:
 * a v3 artifact is reported and left
 * untouched, and a second run over a migrated workspace writes the same bytes. The write
 * is atomic, so a refused run leaves the artifact byte-identical.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import { SmoothSequencesError } from './lib/errors.mjs';
import { migrateArtifactToV3, renderArtifact, SCHEMA_V3 } from './lib/migrate-v3.mjs';
import { assertWorkspaceRoot, loadWorkspace, startDirectoryFor } from './lib/workspace.mjs';

const EXIT_OK = 0;
const EXIT_MISUSE = 2;

/** The digest of the artifact bytes, before the migration. */
// [::TICKET::] PX-274 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-274 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-275 --for-spec --no-implementation-order`.
function digestOf(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** One line describing what the migration will add. */
// [::TICKET::] PX-274, PX-286 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-274|PX-286) --for-spec --no-implementation-order`.
function summaryOf(artifact, migrated) {
  const authoredSteps = (migrated.steps ?? []).filter((step) => step.contract?.authored !== undefined).length;
  return [
    `operations=${migrated.operations.length}`,
    `sequences=${migrated.sequences.length}`,
    `steps=${migrated.steps.length}`,
    `typedContracts=${migrated.steps.filter((step) => Array.isArray(step.contract?.crosses)).length}`,
    `authoredSteps=${authoredSteps}`,
    `boundaryGrounds=${(migrated.boundary_grounds ?? []).length}`,
    `groundedObjects=${(migrated.groundedObjects ?? []).length}`,
    `schema=${artifact.schema_version}->${SCHEMA_V3}`,
  ].join(' ');
}

/** Run the migration. */
// [::TICKET::] PX-276 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-276 --for-spec --no-implementation-order`.
export function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const annotationsArgument = argv.find((argument) => argument.startsWith('--annotations='));
  const annotationsPath = annotationsArgument === undefined ? null : annotationsArgument.slice('--annotations='.length);
  const paths = argv.filter((argument) => argument !== '--dry-run' && !argument.startsWith('--annotations='));
  if (paths.length > 1) {
    process.stderr.write('migrate-v3: usage: migrate-v3.mjs [workspace-root] [--dry-run] [--annotations=<file>]\n');
    return EXIT_MISUSE;
  }

  try {
    const root = assertWorkspaceRoot(startDirectoryFor(paths[0]));
    const loaded = loadWorkspace(root);
    const annotationDocument = annotationsPath === null ? {} : JSON.parse(readFileSync(annotationsPath, 'utf8'));
    const sourceDigest = digestOf(loaded.artifactPath);
    const migrated = migrateArtifactToV3({ ...loaded, sourceDigest, annotations: annotationDocument });
    const rendered = renderArtifact(migrated);
    if (rendered === readFileSync(loaded.artifactPath, 'utf8')) {
      process.stdout.write(loaded.artifact.schema_version === SCHEMA_V3
        ? 'migrate-v3: already v3; nothing to do\n'
        : 'migrate-v3: no change\n');
      return EXIT_OK;
    }
    process.stdout.write(`migrate-v3: dry-run=${dryRun} ${summaryOf(loaded.artifact, migrated)}\n`);
    if (dryRun) return EXIT_OK;

    const temporaryPath = `${loaded.artifactPath}.tmp`;
    writeFileSync(temporaryPath, rendered);
    renameSync(temporaryPath, loaded.artifactPath);
    process.stdout.write(`migrate-v3: wrote ${loaded.artifactPath} source=${sourceDigest} schema=${SCHEMA_V3}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof SmoothSequencesError) {
      process.stderr.write(`migrate-v3: ${error.code}: ${error.message}${error.repair ? ` — ${error.repair}` : ''}\n`);
    } else {
      process.stderr.write(`migrate-v3: ${error.message}\n`);
    }
    return EXIT_MISUSE;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
