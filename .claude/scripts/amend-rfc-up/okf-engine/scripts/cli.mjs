#!/usr/bin/env node
// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
/**
 * CLI dispatch. Unknown commands exit 2; failures exit 1 with a named code.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  appliesCommand,
  askCommand,
  checkCommand,
  conflictsCommand,
  contextCommand,
  explainCommand,
  freshnessCommand,
  gapsCommand,
  ingestCommand,
  packageCommand,
  pageCommand,
  rebuildCommand,
  relatedCommand,
  renderCommand,
  resolveCommand,
  searchCommand,
  shouldRunCommand,
  verifyAnswerCommand,
  buildManifestCommand,
} from './commands.mjs';

const COMMANDS = {
  applies: appliesCommand,
  resolve: resolveCommand,
  context: contextCommand,
  explain: explainCommand,
  search: searchCommand,
  ask: askCommand,
  page: pageCommand,
  related: relatedCommand,
  gaps: gapsCommand,
  freshness: freshnessCommand,
  conflicts: conflictsCommand,
  'verify-answer': verifyAnswerCommand,
  render: renderCommand,
  check: checkCommand,
  package: packageCommand,
  rebuild: rebuildCommand,
  ingest: ingestCommand,
  'should-run': shouldRunCommand,
  manifest: buildManifestCommand,
};

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`unknown command: ${command ?? '(none)'}\n`);
    return 2;
  }
  try {
    const result = await handler(args);
    return typeof result === 'number' ? result : 0;
  } catch (error) {
    process.stderr.write(`okf: ${error.message ?? String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then((code) => { process.exitCode = code; });
}
