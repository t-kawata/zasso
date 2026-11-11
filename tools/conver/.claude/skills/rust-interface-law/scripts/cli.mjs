#!/usr/bin/env node
import {
  attestCommand,
  checkCommand,
  contextCommand,
  exceptionCommand,
  gateCommand,
  packageCommand,
  rebuildCommand,
  renderCommand,
  resolveCommand,
  scanCommand,
  shouldRunCommand,
} from './commands.mjs';

const [command, ...args] = process.argv.slice(2);
const commands = {
  resolve: resolveCommand,
  context: contextCommand,
  gate: gateCommand,
  scan: scanCommand,
  attest: attestCommand,
  exception: exceptionCommand,
  'should-run': shouldRunCommand,
  render: renderCommand,
  check: checkCommand,
  package: packageCommand,
  rebuild: rebuildCommand,
};

const handler = commands[command];
if (!handler) {
  process.stderr.write('usage: skill <resolve|context|gate|scan|attest|exception|should-run|render|check|package|rebuild> [options]\n');
  process.exit(2);
}

try {
  handler(args);
} catch (error) {
  process.stderr.write('law: ' + (error.message ?? String(error)) + '\n');
  process.exit(1);
}
