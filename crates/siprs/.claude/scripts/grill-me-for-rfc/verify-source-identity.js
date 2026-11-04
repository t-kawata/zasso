#!/usr/bin/env node
/**
 * verify-source-identity.js <rfc-dir> [--workspace=<root>] [--sequences=<artifact>]
 *
 * Prove the specification every stage record names is the specification on disk, then
 * put that path into the session's material list. The order is the invariant: a run
 * that cannot prove the identity writes nothing at all, so a refused run is not a run
 * that half-started.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  resolveWorkspaceRoot,
  verifySourceIdentity,
} from '../spec-formula/identity.mjs';
import { toHomeRelative } from '../lib/path-utils.js';

const USAGE = 'usage: verify-source-identity.js <rfc-dir> [--workspace=<root>] [--sequences=<artifact>]';

/** @param {string[]} argv */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { rfcDir: '', workspace: null, sequences: null };
  for (const argument of argv) {
    if (argument.startsWith('--workspace=')) options.workspace = argument.slice('--workspace='.length);
    else if (argument.startsWith('--sequences=')) options.sequences = argument.slice('--sequences='.length);
    else if (!argument.startsWith('--') && options.rfcDir.length === 0) options.rfcDir = argument;
  }
  return options;
}

/**
 * Append the specification to the recorded material list after every check agreed.
 *
 * @param {string} rfcDir
 * @param {string} specPath
 * @returns {{recorded: boolean, materialPaths: string[]}}
 */
// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function recordSpecificationMaterial(rfcDir, specPath) {
  const statusPath = resolve(rfcDir, 'Status.json');
  if (!existsSync(statusPath)) return { recorded: false, materialPaths: [] };

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  const materialPaths = Array.isArray(status.materialPaths) ? status.materialPaths : [];
  const resolved = materialPaths.map((materialPath) => (
    materialPath.startsWith('~/') ? join(homedir(), materialPath.slice(2)) : resolve(materialPath)
  ));
  if (resolved.includes(specPath)) return { recorded: true, materialPaths };

  materialPaths.push(toHomeRelative(specPath));
  status.materialPaths = materialPaths;
  status.researchPath = materialPaths[0] ?? '';
  writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  return { recorded: true, materialPaths };
}

/** @param {string[]} argv @returns {number} */
export function run(argv) {
  const options = parseArgs(argv);
  if (options.rfcDir.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const rfcDir = resolve(options.rfcDir);
  const workspaceRoot = options.workspace === null ? resolveWorkspaceRoot(rfcDir) : resolve(options.workspace);
  if (workspaceRoot === null) {
    process.stderr.write(`refused: no workspace manifests above ${rfcDir}\n`);
    return 1;
  }

  const verified = verifySourceIdentity({
    rfcDir,
    workspaceRoot,
    sequencesArtifactPath: options.sequences === null ? null : resolve(options.sequences),
  });

  if (!verified.ok) {
    process.stdout.write(`${JSON.stringify({ ...verified, materialRecorded: false }, null, 2)}\n`);
    for (const finding of verified.findings) {
      process.stderr.write(`refused: ${finding.code}: ${finding.message}\n`);
    }
    return 1;
  }

  const recorded = recordSpecificationMaterial(rfcDir, verified.specPath);
  process.stdout.write(`${JSON.stringify({
    ...verified,
    specPath: toHomeRelative(verified.specPath),
    materialRecorded: recorded.recorded,
  }, null, 2)}\n`);
  return 0;
}

process.exit(run(process.argv.slice(2)));
