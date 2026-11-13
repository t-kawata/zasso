'use strict';

/**
 * rewrite-stub-aliases — rewrite markers whose key was absorbed by condensation.
 *
 * Validators resolve identity.aliases, so an old key still passes. This command
 * keeps the source clean for the next consolidation by replacing that key with
 * the live survivor. The write is transactional; a failure restores every file.
 */

const fs = require('node:fs');
const path = require('node:path');

const { scanDirectory } = require('./review/find-all-stubs.js');
const { extractTicketKey } = require('./validate-no-external-excuses.js');
const { resolveAliasTarget, rewriteMarkerLines } = require('./lib/marker-alias.js');

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match === undefined ? undefined : match.slice(prefix.length);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function main(argv = process.argv) {
  const args = argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const ticketsPath = path.resolve(cwd, argumentValue(args, 'tickets') ?? 'Tickets.json');
  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const stubs = [];
  scanDirectory(cwd, stubs);

  const rewrites = [];
  for (const stub of stubs) {
    const key = extractTicketKey(stub.content);
    if (key === null) continue;
    const target = resolveAliasTarget(ticketsData, key);
    if (target === null || target === key) continue;
    rewrites.push({ file: path.relative(cwd, stub.file), line: stub.line, from: key, to: target });
  }

  const result = rewriteMarkerLines({
    cwd,
    ticketsData,
    rewrites,
    dryRun: args.includes('--dry-run'),
  });
  process.stdout.write(JSON.stringify({
    ok: result.ok,
    rewrites: result.rewrites,
    findings: result.findings,
  }, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { main };
