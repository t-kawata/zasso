'use strict';

/**
 * atomic-write.js — write a complete file or leave the target untouched.
 *
 * A repair tool that half-writes Tickets.json or a test file is worse than a
 * tool that refuses. Every writer stages the bytes beside the target and renames
 * them into place, so a validation failure that happens before this call cannot
 * leave a partial file behind.
 */

const fs = require('node:fs');
const path = require('node:path');

let temporaryCounter = 0;

/**
 * Write bytes to a temporary file beside the target, then rename it into place.
 *
 * @param {string} targetPath — the file to replace
 * @param {string|Buffer} bytes — the complete new content
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function writeTemporaryThenRename(targetPath, bytes) {
  const resolvedTarget = path.resolve(targetPath);
  const directory = path.dirname(resolvedTarget);
  const temporaryPath = path.join(
    directory,
    '.' + path.basename(resolvedTarget) + '.tmp-' + process.pid + '-' + temporaryCounter,
  );
  temporaryCounter += 1;

  try {
    fs.writeFileSync(temporaryPath, bytes, { flag: 'wx' });
    fs.renameSync(temporaryPath, resolvedTarget);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Cleanup must not hide the write failure that brought us here.
    }
    throw error;
  }
}

module.exports = { writeTemporaryThenRename };
