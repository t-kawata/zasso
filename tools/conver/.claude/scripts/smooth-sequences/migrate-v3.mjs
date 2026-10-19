#!/usr/bin/env node
/**
 * migrate-v3 — add the typed step contract and the v3 operation fields to a v2 artifact.
 *
 * Usage:
 *   node .claude/scripts/smooth-sequences/migrate-v3.mjs <workspace-root> [--dry-run]
 *
 * The migration is deterministic and idempotent: a v3 artifact is reported and left
 * untouched, and a second run over a migrated workspace writes the same bytes. The write
 * is atomic, so a refused run leaves the artifact byte-identical.
 */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import { SmoothSequencesError } from './lib/errors.mjs';
import { applyStepAnnotations, migrateArtifactToV3, renderArtifact, SCHEMA_V3, splitAnnotations } from './lib/migrate-v3.mjs';
import { loadWorkspace, resolveWorkspaceRoot, startDirectoryFor } from './lib/workspace.mjs';

const EXIT_OK = 0;
const EXIT_MISUSE = 2;

/** The digest of the artifact bytes, before the migration. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function digestOf(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** One line describing what the migration will add. */
// [::TICKET::] PX-274 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-274 --for-spec --no-implementation-order`.
function summaryOf(artifact, migrated) {
  return [
    `operations=${migrated.operations.length}`,
    `sequences=${migrated.sequences.length}`,
    `steps=${migrated.steps.length}`,
    `typedContracts=${migrated.steps.filter((step) => Array.isArray(step.contract?.crosses)).length}`,
    `groundedObjects=${migrated.groundedObjects.length}`,
    `schema=${artifact.schema_version}->${SCHEMA_V3}`,
  ].join(' ');
}

/** Run the migration. */
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
    const root = resolveWorkspaceRoot(startDirectoryFor(paths[0]));
    const loaded = loadWorkspace(root);
    const annotationDocument = annotationsPath === null ? {} : JSON.parse(readFileSync(annotationsPath, 'utf8'));
    if (loaded.artifact.schema_version === SCHEMA_V3) {
      const annotated = applyStepAnnotations(loaded.artifact, splitAnnotations(annotationDocument).stepAnnotations);
      const rendered = renderArtifact(annotated);
      if (rendered === readFileSync(loaded.artifactPath, 'utf8')) {
        process.stdout.write('migrate-v3: already v3; nothing to do\n');
        return EXIT_OK;
      }
      if (dryRun) {
        process.stdout.write('migrate-v3: dry-run=true annotations would be applied\n');
        return EXIT_OK;
      }
      writeFileSync(`${loaded.artifactPath}.tmp`, rendered);
      renameSync(`${loaded.artifactPath}.tmp`, loaded.artifactPath);
      process.stdout.write(`migrate-v3: annotations applied to ${loaded.artifactPath}\n`);
      return EXIT_OK;
    }

    const sourceDigest = digestOf(loaded.artifactPath);
    const migrated = migrateArtifactToV3({ ...loaded, sourceDigest, annotations: annotationDocument });
    process.stdout.write(`migrate-v3: dry-run=${dryRun} ${summaryOf(loaded.artifact, migrated)}\n`);
    if (dryRun) return EXIT_OK;

    const temporaryPath = `${loaded.artifactPath}.tmp`;
    writeFileSync(temporaryPath, renderArtifact(migrated));
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
