/**
 * cli-output.js — stdout for the command-line display scripts.
 *
 * The static quality check flags `console.log` as debug output. For these
 * commands stdout *is* the output, so they write through this helper instead.
 * It also turns a reader that closed the pipe (`| head`) into a quiet exit
 * rather than an EPIPE stack trace.
 */

'use strict';

/** Whether the broken-pipe guard is already attached to stdout. */
let pipeGuardInstalled = false;

/** Exit quietly when the reader closed the pipe; rethrow anything else. */
function exitOnBrokenPipe(error) {
  if (error && error.code === 'EPIPE') {
    process.exit(0);
  }
  throw error;
}

/** Write one line to stdout. */
function writeLine(line) {
  if (!pipeGuardInstalled) {
    process.stdout.on('error', exitOnBrokenPipe);
    pipeGuardInstalled = true;
  }
  process.stdout.write(line + '\n');
}

module.exports = { writeLine };
