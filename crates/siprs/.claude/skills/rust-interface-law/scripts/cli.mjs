#!/usr/bin/env node
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import {
  appliesCommand,
  attestCommand,
  checkCommand,
  contextCommand,
  exceptionCommand,
  explainCommand,
  freshnessCommand,
  gateCommand,
  implementationCheckCommand,
  incomingCommand,
  lawIdentityCommand,
  lawImplementationCommand,
  lintCommand,
  listCommand,
  neighborsCommand,
  outgoingCommand,
  packageCommand,
  rebuildCommand,
  renderCommand,
  requiredCommand,
  resolveCommand,
  scaffoldCommand,
  scanCommand,
  searchCommand,
  shouldRunCommand,
  showCommand,
  sourcesCommand,
  templateCommand,
  trustCommand,
} from './commands.mjs';

const [command, ...args] = process.argv.slice(2);
const commands = {
  applies: appliesCommand,
  resolve: resolveCommand,
  context: contextCommand,
  explain: explainCommand,
  list: listCommand,
  show: showCommand,
  expand: showCommand,
  outgoing: outgoingCommand,
  incoming: incomingCommand,
  neighbors: neighborsCommand,
  required: requiredCommand,
  search: searchCommand,
  lint: lintCommand,
  validate: lintCommand,
  trust: trustCommand,
  freshness: freshnessCommand,
  sources: sourcesCommand,
  scaffold: scaffoldCommand,
  gate: gateCommand,
  scan: scanCommand,
  attest: attestCommand,
  exception: exceptionCommand,
  'should-run': shouldRunCommand,
  render: renderCommand,
  check: checkCommand,
  package: packageCommand,
  rebuild: rebuildCommand,
  template: templateCommand,
  'implementation-check': implementationCheckCommand,
  'law-identity': lawIdentityCommand,
  'law-implementation': lawImplementationCommand,
};

const handler = commands[command];
if (!handler) {
  process.stderr.write('usage: skill <applies|resolve|context|explain|list|show|expand|outgoing|incoming|neighbors|required|search|lint|validate|trust|freshness|sources|scaffold|template|implementation-check|law-identity|law-implementation|gate|scan|attest|exception|should-run|render|check|package|rebuild> [options]\n');
  process.exit(2);
}

Promise.resolve(handler(args))
  .then(() => {
    if (typeof process.exitCode !== 'number') process.exitCode = 0;
  })
  .catch((error) => {
    // [::TICKET::] PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-430 --for-spec --no-implementation-order`.
    // A stable code in stderr lets the caller tell UNKNOWN_FORMAT from a rule miss.
    const code = error.code ? error.code + ': ' : '';
    process.stderr.write('law: ' + code + (error.message ?? String(error)) + '\n');
    process.exitCode = error.code === 'UNKNOWN_RULE' || error.code === 'UNKNOWN_CONCEPT' ? 2 : 1;
  });
