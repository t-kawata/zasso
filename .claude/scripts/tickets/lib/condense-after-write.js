'use strict';

/**
 * condense-after-write — the shared write-then-condense transaction.
 *
 * A ticket-writing path promotes a document first, then runs the shared
 * condensation CLI. If either the apply or the read-only gate refuses, the
 * pre-write document is restored. The helper is deliberately policy-free: the
 * caller owns the backup and the failure code, so the drill and the legacy
 * omission merge use the same transaction without sharing their evidence rules.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONDENSE_SCRIPT = path.join(__dirname, '..', 'condense-tickets.js');
const DEFAULT_FAILURE_CODE = 'CONDENSE_AFTER_WRITE_FAILED';
const GATE_FAILURE_CODE = 'CONDENSE_GATE_FAILED';

/** Run the shared condense CLI in the package directory. */
function runCondense(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

/** Copy the pre-write document back; report whether a backup existed. */
function restoreBackup(ticketsPath, backupPath) {
  if (typeof backupPath !== 'string' || backupPath.length === 0 || !fs.existsSync(backupPath)) {
    return false;
  }
  fs.copyFileSync(backupPath, ticketsPath);
  return true;
}

/**
 * Condense a promoted Tickets.json and gate the result.
 *
 * @param {{
 *   ticketsPath: string,
 *   backupPath?: string,
 *   run?: (args: string[], cwd: string) => { status: number, stderr?: string },
 *   failureCode?: string,
 * }} input
 * @returns {{ ok: boolean, code?: string, stderr?: string, restored?: boolean }}
 */
function condenseAfterWrite(input = {}) {
  const { ticketsPath, backupPath, run = runCondense, failureCode = DEFAULT_FAILURE_CODE } = input;
  const resolvedTicketsPath = path.resolve(ticketsPath);
  const resolvedBackupPath = typeof backupPath === 'string' ? path.resolve(backupPath) : backupPath;
  const cwd = path.dirname(resolvedTicketsPath);

  const apply = run([CONDENSE_SCRIPT, '--apply', '--tickets=' + resolvedTicketsPath, '--merge-status=todo'], cwd);
  if (apply.status !== 0) {
    return {
      ok: false,
      code: failureCode,
      stderr: apply.stderr ?? '',
      restored: restoreBackup(resolvedTicketsPath, resolvedBackupPath),
    };
  }

  const gate = run([CONDENSE_SCRIPT, '--gate', '--tickets=' + resolvedTicketsPath], cwd);
  if (gate.status !== 0) {
    return {
      ok: false,
      code: GATE_FAILURE_CODE,
      stderr: gate.stderr ?? '',
      restored: restoreBackup(resolvedTicketsPath, resolvedBackupPath),
    };
  }

  return { ok: true };
}

module.exports = {
  condenseAfterWrite,
  runCondense,
  restoreBackup,
  CONDENSE_SCRIPT,
};
