#!/usr/bin/env node
/**
 * fix-p16-to-p15.cjs — Rename the misnumbered phase 16 to 15 in Tickets.json.
 *
 * Root cause: add-ticket.js auto-numbered a new phase as `data.phases.length`
 * (counting the detached PX -1 phase), producing id 16 instead of max+1 = 15.
 * This script safely renames phase 16 → 15 and keeps Tickets.json.delta.json
 * consistent.
 *
 * Safety: backup → precondition check → transform → validate → atomic write.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TICKETS = path.join(ROOT, 'Tickets.json');
const DELTA = path.join(ROOT, 'Tickets.json.delta.json');

// ── validate-tickets (the project's own validator) ──
const { validateTickets } = require(path.resolve(
  ROOT,
  '../../tools/conver/.claude/scripts/lib/validate-tickets.js'
));

function backup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, bak);
  return bak;
}

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function fixTickets(tickets) {
  const phase = tickets.phases.find((p) => p.id === 16);
  if (!phase) throw new Error('Precondition failed: phase 16 does not exist');
  if (tickets.phases.some((p) => p.id === 15)) {
    throw new Error('Precondition failed: phase 15 already exists (collision)');
  }

  // Rename the phase id.
  phase.id = 15;

  // Update every ticket inside it.
  let phaseIdFixes = 0;
  for (const tk of phase.tickets || []) {
    if (tk.phaseId === 16) {
      tk.phaseId = 15;
      phaseIdFixes++;
    }
  }

  // No ticket outside phase 16 may reference phaseId 16 (invariant).
  const strays = tickets.phases
    .filter((p) => p.id !== 15)
    .flatMap((p) => (p.tickets || []).filter((t) => t.phaseId === 16));
  if (strays.length > 0) {
    throw new Error(`Invariant broken: ${strays.length} tickets outside phase 15 still have phaseId 16`);
  }

  return { phaseIdFixes, phaseName: phase.name };
}

function fixDelta(delta) {
  let fixes = 0;
  for (const group of ['newTickets', 'editedTickets']) {
    for (const t of delta[group] || []) {
      if (t.phaseId === 16) {
        t.phaseId = 15;
        fixes++;
      }
    }
  }
  return fixes;
}

function main() {
  // 1. Load.
  const tickets = JSON.parse(fs.readFileSync(TICKETS, 'utf8'));

  // 2. Validate BEFORE.
  const before = validateTickets(tickets);
  if (!before.valid) {
    throw new Error(`Precondition failed: Tickets.json invalid before fix: ${JSON.stringify(before.errors)}`);
  }

  // 3. Backup both files.
  const bakTickets = backup(TICKETS);
  const bakDelta = fs.existsSync(DELTA) ? backup(DELTA) : null;

  // 4. Transform.
  const r = fixTickets(tickets);

  // 5. Validate AFTER (must pass).
  const after = validateTickets(tickets);
  if (!after.valid) {
    throw new Error(`Postcondition failed: Tickets.json invalid after fix: ${JSON.stringify(after.errors)}`);
  }

  // 6. Atomic write.
  atomicWrite(TICKETS, tickets);

  // 7. Fix the handoff delta too.
  let deltaFixes = 0;
  if (bakDelta && fs.existsSync(DELTA)) {
    const delta = JSON.parse(fs.readFileSync(DELTA, 'utf8'));
    deltaFixes = fixDelta(delta);
    atomicWrite(DELTA, delta);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: r.phaseName,
        ticketsFixed: r.phaseIdFixes,
        deltaFixed: deltaFixes,
        backupTickets: bakTickets,
        backupDelta: bakDelta,
        validated: after.valid,
      },
      null,
      2
    )
  );
}

main();
