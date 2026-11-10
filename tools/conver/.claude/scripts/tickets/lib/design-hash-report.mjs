/**
 * PX-405 — the ESM bridge for the CJS amendment gate manifest.
 *
 * The tree entry gate, the allocate self-hash and the formula digest live in ESM
 * modules. The gate manifest is CommonJS, so this bridge runs as a child process
 * and prints one JSON envelope. It never writes.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { checkTreeEntryGate } from '../../workspacify-tree/lib/entry-parity.mjs';

const require = createRequire(import.meta.url);
const {
  verifyAllocateChain,
  verifyFormulaDigest,
} = require('../rebuild-design-hashes.js');

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

/** Convert tree entry gate errors into the shared finding shape. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function treeFindings(manifestPath, specPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [{ code: 'TREE_MANIFEST_UNREADABLE', asset: manifestPath, problem: error.message, fixes: [], rerun: 'repair the tree manifest and rerun verify-amendment.js' }];
  }
  const result = checkTreeEntryGate(manifest, specPath);
  return result.errors.map((message) => ({
    code: 'TREE_ENTRY_PARITY_FAILED',
    asset: manifestPath,
    problem: message,
    fixes: [],
    rerun: 'run /workspacify-tree, then re-run verify-amendment.js',
  }));
}

/** Run the requested check and print one JSON envelope. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
async function main() {
  const args = process.argv.slice(2);
  const mode = argumentValue(args, 'mode');
  let findings = [];

  if (mode === 'tree') {
    findings = treeFindings(argumentValue(args, 'manifest'), argumentValue(args, 'spec'));
  } else if (mode === 'allocate') {
    const result = await verifyAllocateChain({ workspaceRoot: argumentValue(args, 'workspace-root') });
    findings = result.findings;
  } else if (mode === 'formula') {
    const result = await verifyFormulaDigest({
      packageDir: argumentValue(args, 'package'),
      rfcPath: argumentValue(args, 'rfc'),
    });
    findings = result.findings;
  } else {
    findings = [{ code: 'HASH_REPORT_MODE_MISSING', asset: 'design-hash-report', problem: 'unknown or missing --mode', fixes: [], rerun: 'pass --mode=tree|allocate|formula' }];
  }

  process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings })}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    findings: [{ code: 'HASH_REPORT_FAILED', asset: 'design-hash-report', problem: error.message, fixes: [], rerun: 'inspect the bridge input' }],
  })}\n`);
});
