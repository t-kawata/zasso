// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { failRevision } from './errors.mjs';

export function installWithRollback({ staging, target, backupRoot, postCheck = () => true }) {
// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
  const backup = join(backupRoot, 'backup');
  const targetExisted = existsSync(target);
  mkdirSync(dirname(target), { recursive: true });
  if (targetExisted) {
    rmSync(backup, { recursive: true, force: true });
    mkdirSync(backupRoot, { recursive: true });
    cpSync(target, backup, { recursive: true });
  }
  try {
    rmSync(target, { recursive: true, force: true });
    cpSync(staging, target, { recursive: true });
    if (!postCheck({ target })) {
      throw Object.assign(new Error('post-check failed'), { code: 'REVISION_INSTALL_BLOCKED' });
    }
    return { installed: true, backup: targetExisted ? backup : null };
  } catch (error) {
    if (targetExisted) {
      rmSync(target, { recursive: true, force: true });
      cpSync(backup, target, { recursive: true });
    } else {
      rmSync(target, { recursive: true, force: true });
    }
    if (error.code === 'REVISION_INSTALL_BLOCKED') throw error;
    failRevision('REVISION_INSTALL_BLOCKED', error.message, { target });
  }
}
