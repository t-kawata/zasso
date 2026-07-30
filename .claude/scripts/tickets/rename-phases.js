#!/usr/bin/env node

/**
 * rename-phases.js — Safely rename phases in Tickets.json
 *
 * PX-110: Reads Tickets.json, updates phases[].name for specified phase IDs,
 * and writes back atomically.
 *
 * This is the ONLY allowed path for modifying phase names.
 * Direct editing of Tickets.json phase names is prohibited.
 *
 * Usage:
 *   node rename-phases.js --tickets=<PATH> --phase=<id> --name="<new-name>"
 *   node rename-phases.js --tickets=<PATH> --phase=6 --name="Storage" --phase=7 --name="Network"
 *
 * Exit codes:
 *   0 = Success
 *   1 = Validation error
 *   3 = File I/O error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// Pure function
// ============================================================

/**
 * Rename one or more phases in Tickets.json.
 * Pure function — deep-clones input, no side effects.
 *
 * @param {object} ticketsData — Parsed Tickets.json
 * @param {Array<{phaseId: number, newName: string}>} renames — Rename operations
 * @returns {object} — Deep-cloned Tickets.json with updated phase names
 * @throws {Error} On invalid phaseId, empty name, or PX rename attempt
 */
// [::TICKET::] PX-110: rename-phases.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
// [::TICKET::] PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
function renamePhases(ticketsData, renames) {
  if (!ticketsData || typeof ticketsData !== 'object') {
    throw new Error('ticketsData must be a non-null object');
  }
  if (!Array.isArray(renames) || renames.length === 0) {
    throw new Error('renames must be a non-empty array');
  }

  // Validate all renames before cloning
  for (var ri = 0; ri < renames.length; ri++) {
    var r = renames[ri];
    if (typeof r.phaseId !== 'number' || !Number.isInteger(r.phaseId)) {
      throw new Error('Invalid phaseId: ' + r.phaseId);
    }
    if (r.phaseId === -1) {
      throw new Error('Cannot rename PX phase (id=-1)');
    }
    if (typeof r.newName !== 'string' || r.newName.trim().length === 0) {
      throw new Error('newName must be a non-empty string for phase ' + r.phaseId);
    }

    var phaseExists = (ticketsData.phases || []).some(function(p) {
      return p.id === r.phaseId;
    });
    if (!phaseExists) {
      throw new Error('Phase ' + r.phaseId + ' not found in Tickets.json');
    }
  }

  // Deep clone
  var result = JSON.parse(JSON.stringify(ticketsData));

  // Apply renames
  for (var i = 0; i < renames.length; i++) {
    var rename = renames[i];
    for (var j = 0; j < result.phases.length; j++) {
      if (result.phases[j].id === rename.phaseId) {
        result.phases[j].name = rename.newName.trim();
        break;
      }
    }
  }

  return result;
}

// ============================================================
// I/O functions
// ============================================================

/**
 * Atomic write using temp file + rename.
 * @param {string} targetPath — Target file path
 * @param {string} data — Content to write
 */
// [::TICKET::] PX-110: rename-phases.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
// [::TICKET::] PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
function atomicWrite(targetPath, data) {
  var tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// CLI
// ============================================================

// [::TICKET::] PX-110: rename-phases.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
// [::TICKET::] PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  var opts = { ticketsPath: '', renames: [] };

  for (var ai = 0; ai < argv.length; ai++) {
    var arg = argv[ai];
    if (arg.startsWith('--tickets=')) {
      opts.ticketsPath = path.resolve(arg.slice('--tickets='.length));
    } else if (arg.startsWith('--phase=')) {
      var phaseId = parseInt(arg.slice('--phase='.length), 10);
      // Next arg must be --name=
      ai++;
      if (ai >= argv.length || !argv[ai].startsWith('--name=')) {
        console.error('[ERROR] --phase=N must be followed by --name="..."');
        process.exit(2);
      }
      var nameVal = argv[ai].slice('--name='.length);
      // Handle quoted name (remove surrounding quotes if present)
      if (nameVal.startsWith('"') && nameVal.endsWith('"')) {
        nameVal = nameVal.slice(1, -1);
      } else if (nameVal.startsWith("'") && nameVal.endsWith("'")) {
        nameVal = nameVal.slice(1, -1);
      }
      opts.renames.push({ phaseId: phaseId, newName: nameVal });
    } else {
      console.error('[ERROR] Unknown argument: ' + arg);
      process.exit(2);
    }
  }

  if (!opts.ticketsPath) {
    console.error('[ERROR] --tickets=<PATH> is required');
    process.exit(2);
  }
  if (opts.renames.length === 0) {
    console.error('[ERROR] At least one --phase=N --name="..." pair is required');
    process.exit(2);
  }

  return opts;
}

// [::TICKET::] PX-110: rename-phases.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
// [::TICKET::] PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
function main() {
  var opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + opts.ticketsPath);
    process.exit(3);
  }

  var ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(opts.ticketsPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Cannot parse Tickets.json: ' + e.message);
    process.exit(3);
  }

  var result;
  try {
    result = renamePhases(ticketsData, opts.renames);
  } catch (e) {
    console.error('[ERROR] ' + e.message);
    process.exit(1);
  }

  try {
    atomicWrite(opts.ticketsPath, JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    console.error('[ERROR] Cannot write Tickets.json: ' + e.message);
    process.exit(3);
  }

  console.log('Renamed ' + opts.renames.length + ' phase(s) in ' + opts.ticketsPath);
  for (var i = 0; i < opts.renames.length; i++) {
    var oldName = '';
    for (var j = 0; j < (ticketsData.phases || []).length; j++) {
      if (ticketsData.phases[j].id === opts.renames[i].phaseId) {
        oldName = ticketsData.phases[j].name;
        break;
      }
    }
    console.log('  Phase ' + opts.renames[i].phaseId + ': "' + oldName + '" → "' + opts.renames[i].newName + '"');
  }
}

if (require.main === module) {
  main();
}

module.exports = { renamePhases, parseArgs, atomicWrite };
