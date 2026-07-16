#!/usr/bin/env node

/**
 * consolidate-phase-tickets.js — Step 5-3: Phase consolidation by ticket count
 *
 * Used in the split-to-tickets pipeline Step 5-3.
 * After all phases have been converted to tickets, merges phases with fewer
 * than 3 tickets into subsequent phases and reassigns phase IDs and ticket IDs in bulk.
 *
 * Usage:
 *   node consolidate-phase-tickets.js \
 *     <path to Tickets.json> \
 *     <path to status.json> \
 *     [--dry-run]
 *
 * Arguments:
 *   Tickets.json  — ticket data from the split pipeline (required)
 *   status.json   — path to SPLIT-Status.json (required)
 *   --dry-run     — suppress file writing, display changes on stdout only
 *
 * Exit codes:
 *   0 = success (consolidation complete, or skipped by guard)
 *   1 = validation error (not all nodeIds converted to tickets)
 *   2 = argument error
 *   3 = file not found
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadGraphEdgesFromTickets } = require('./generate-related-ticket-ids.js');

// ============================================================
// Constants
// ============================================================

/** Minimum tickets per phase (phases below this threshold are consolidated) */
const MIN_TICKETS_PER_PHASE = 3;

/** Phase ID prefix */
const PHASE_ID_PREFIX = 'P';

/** Normal exit code */
const EXIT_SUCCESS = 0;

/** Abnormal exit code (validation error, etc.) */
const EXIT_FAILURE = 1;

/** Argument error exit code */
const EXIT_ARG_ERROR = 2;

/** File not found exit code */
const EXIT_FILE_NOT_FOUND = 3;

// ============================================================
// Types: Phase
// ============================================================

/**
 * @typedef {Object} Phase
 * @property {number} id       — phase ID (e.g., 0)
 * @property {string} name     — phase name (e.g., "P0")
 * @property {string} summary  — phase summary description
 * @property {string[]} nodeIds — graph node IDs belonging to this phase
 * @property {Object[]} tickets — tickets belonging to this phase
 */

/**
 * @typedef {Object} Ticket
 * @property {string} id       — ticket ID (e.g., "P0-1")
 * @property {number} phaseId  — owning phase ID
 * @property {string[]} nodeIds — graph node IDs covered by this ticket
 * @property {string} title    — ticket title
 */

// ============================================================
// 5-3-1: Guard check
// ============================================================

/**
 * Check if the number of phases is below MIN_TICKETS_PER_PHASE.
 * Used to skip consolidation when no targets exist.
 *
 * @param {Phase[]} phases — all phases array
 * @returns {{ shouldSkip: boolean, phaseCount: number }}
 */
function guardPhaseCount(phases) {
  const phaseCount = (phases || []).length;
  return {
    shouldSkip: phaseCount < MIN_TICKETS_PER_PHASE,
    phaseCount,
  };
}

// ============================================================
// 5-3-2: nodeIds coverage verification
// ============================================================

/**
 * Verify that all nodeIds across all phases have been converted to tickets.
 * Similar logic to verifyNodeCoverage() in add-tickets-for-phase.js.
 *
 * @param {Phase[]} phases — all phases array
 * @returns {{ valid: boolean, missingNodeIds: { phaseId: number, nodeIds: string[] }[] }}
 */
function validateAllNodeIdsCovered(phases) {
  const issues = [];

  for (const phase of phases) {
    const phaseNodeIds = new Set(phase.nodeIds || []);
    const coveredNodeIds = new Set();

    for (const ticket of (phase.tickets || [])) {
      if (Array.isArray(ticket.nodeIds)) {
        for (const nodeId of ticket.nodeIds) {
          coveredNodeIds.add(nodeId);
        }
        // Check if ticket nodeIds are outside phase.nodeIds (extra)
        for (const nodeId of ticket.nodeIds) {
          if (phaseNodeIds.has(nodeId)) {
            coveredNodeIds.add(nodeId);
          }
        }
      }
    }

    // Correct coverage calculation: each element in each ticket's nodeIds must be in phase.nodeIds
    const correctCovered = new Set();
    for (const ticket of (phase.tickets || [])) {
      if (Array.isArray(ticket.nodeIds)) {
        for (const nodeId of ticket.nodeIds) {
          if (phaseNodeIds.has(nodeId)) {
            correctCovered.add(nodeId);
          }
        }
      }
    }

    // Missing nodeIds (in phase but not covered by any ticket)
    const missing = [];
    for (const nodeId of phaseNodeIds) {
      if (!correctCovered.has(nodeId)) {
        missing.push(nodeId);
      }
    }

    if (missing.length > 0) {
      issues.push({ phaseId: phase.id, nodeIds: missing });
    }
  }

  return {
    valid: issues.length === 0,
    missingNodeIds: issues,
  };
}

// ============================================================
// 5-3-3: Single-pass right-to-left consolidation
// ============================================================

/**
 * Merge phases with fewer than MIN_TICKETS_PER_PHASE tickets backward.
 * Scanning from right to left completes cascade consolidation in a single pass.
 *
 * Rationale for right-to-left single pass:
 * - Forward merging changes subsequent phase indices, requiring multiple passes
 * - In a right-to-left scan, phases to the right are already final, so the merge
 *   target is always "large enough" or "the final phase"
 * - The final phase is excluded from consolidation (no target behind it)
 *
 * @param {Phase[]} phases — all phases array (operates on a copy)
 * @returns {Phase[]} consolidated phases array
 */
function consolidateFromRight(phases) {
  if (!Array.isArray(phases) || phases.length === 0) {
    return [];
  }

  // Create a copy of phases before mutating (immutable)
  const working = phases.map(function(p) {
    return JSON.parse(JSON.stringify(p));
  });

  // Scan from right to left (skip the final phase)
  for (let i = working.length - 2; i >= 0; i--) {
    const current = working[i];
    if (!current) {
      // Skip phases already merged into others
      continue;
    }

    // Find the next non-null phase (skip deleted/null ones)
    let next = null;
    for (let j = i + 1; j < working.length; j++) {
      if (working[j] !== null) {
        next = working[j];
        break;
      }
    }

    if (!next) {
      // Skip if there is no subsequent phase
      continue;
    }

    const ticketCount = (current.tickets || []).length;
    if (ticketCount < MIN_TICKETS_PER_PHASE) {
      // Prepend all current tickets to next
      const currentTickets = current.tickets || [];
      const nextTickets = next.tickets || [];
      next.tickets = currentTickets.concat(nextTickets);

      // Merge nodeIds preserving order
      const currentNodeIds = current.nodeIds || [];
      const nextNodeIds = next.nodeIds || [];
      next.nodeIds = currentNodeIds.concat(nextNodeIds);

      // Merge name and summary
      next.name = current.name + ' → ' + next.name;
      next.summary = current.summary
        ? current.summary + '\n---\n' + (next.summary || '')
        : next.summary;

      // Mark current as deleted (null to filter out later)
      working[i] = null;
    }
  }

  // Remove null (deletion markers)
  const result = working.filter(function(p) { return p !== null; });

  return result;
}

// ============================================================
// 5-3-4: Bulk reassign phase IDs
// ============================================================

/**
 * Reassign sequential IDs starting from 0 to all phases.
 *
 * @param {Phase[]} phases — all phases array (operates on a copy)
 * @returns {Phase[]} phases array after ID reassignment
 */
function renumberPhaseIds(phases) {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map(function(phase, index) {
    return {
      ...phase,
      id: index,
    };
  });
}

// ============================================================
// 5-3-5: Bulk reassign ticket IDs
// ============================================================

/**
 * Reassign ticket id and phaseId based on new phase IDs.
 * id: sequential within phaseId (1-based integer, per tickets-schema.json).
 *
 * @param {Phase[]} phases — all phases array (operates on a copy)
 * @returns {Phase[]} phases array after ticket ID reassignment
 */
function renumberTicketIds(phases) {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map(function(phase) {
    const newPhaseId = phase.id;
    const newTickets = (phase.tickets || []).map(function(ticket, index) {
      return {
        ...ticket,
        id: index + 1,
        phaseId: newPhaseId,
      };
    });

    return {
      ...phase,
      tickets: newTickets,
    };
  });
}

// ============================================================
// Phase B: Regenerate relatedTicketIds (depends on PX-45)
// ============================================================

/**
 * Mechanically regenerate relatedTicketIds for all tickets from GRAPH.json edges.
 *
 * Requires and calls generateRelatedTicketIds() from PX-45.
 * Passes graphEdges as the edges array from GRAPH.json.
 *
 * @param {Phase[]} phases — all phases array
 * @param {Object[]} graphEdges — edges array from GRAPH.json
 * @returns {Phase[]} phases array after relatedTicketIds update
 */
function regenerateRelatedTicketIds(phases, graphEdges) {
  if (!Array.isArray(graphEdges) || graphEdges.length === 0) {
    return phases;
  }

  const { generateRelatedTicketIds } = require('./generate-related-ticket-ids.js');
  const allTickets = [];
  for (const phase of phases) {
    for (const ticket of (phase.tickets || [])) {
      allTickets.push(ticket);
    }
  }

  const relatedMap = generateRelatedTicketIds(allTickets, graphEdges);

  for (const phase of phases) {
    for (const ticket of (phase.tickets || [])) {
      const compositeKey = phase.id + ':' + ticket.id;
      const ids = relatedMap.get(compositeKey);
      if (ids) {
        ticket.relatedTicketIds = ids;
      }
    }
  }

  return phases;
}

// ============================================================
// Phase C: Update status.json (depends on PX-46)
// ============================================================

/**
 * Call prune-phases / renumber-phases on status.json via spawnSync.
 *
 * Uses PX-46 subcommands to remove entries for deleted phases and
 * update status.steps keys to match reassigned IDs.
 *
 * @param {string} statusPath — absolute path to SPLIT-Status.json
 * @param {Phase[]} oldPhases — phases array before consolidation (to identify removed phases)
 * @param {Phase[]} newPhases — phases array after consolidation (to get new ID mapping)
 */
function updateStatusJson(statusPath, oldPhases, newPhases) {
  const tsScript = path.resolve(__dirname, '../rfc-graph/update-split-step-status.js');

  // Identify removed phase IDs (in oldPhases but not in newPhases)
  const oldIds = new Set((oldPhases || []).map(function(p) { return p.id; }));
  const newIds = new Set((newPhases || []).map(function(p) { return p.id; }));
  const removedIds = [];
  for (const id of oldIds) {
    if (!newIds.has(id)) removedIds.push(PHASE_ID_PREFIX + id);
  }

  if (removedIds.length > 0) {
    const pruneInput = JSON.stringify(removedIds);
    const pruneResult = spawnSync('node', [
      tsScript,
      '--status=' + statusPath,
      'prune-phases',
    ], { input: pruneInput, encoding: 'utf8' });
    if (pruneResult.status !== 0) {
      console.error('[WARN] prune-phases 呼び出しが失敗しました: ' +
        (pruneResult.stderr || pruneResult.stdout || ''));
    } else {
      console.log('  prune-phases: ' + removedIds.length + ' 件削除');
    }
  }

  // Build ID mapping (conversion when new and old IDs differ)
  // Note: only phases after null removal from consolidateFromRight are passed,
  // so IDs are not necessarily sequential. Maps to sequential IDs after renumberPhaseIds.
  const idMapping = {};
  for (let i = 0; i < newPhases.length; i++) {
    idMapping[String(newPhases[i].id)] = String(i);
  }
  const renumberInput = JSON.stringify(idMapping);
  const renumberResult = spawnSync('node', [
    tsScript,
    '--status=' + statusPath,
    'renumber-phases',
  ], { input: renumberInput, encoding: 'utf8' });
  if (renumberResult.status !== 0) {
    console.error('[WARN] renumber-phases 呼び出しが失敗しました: ' +
      (renumberResult.stderr || renumberResult.stdout || ''));
  } else {
    console.log('  renumber-phases: ' + Object.keys(idMapping).length + ' 件変換');
  }
}

// ============================================================
// 5-3-8: Final validation
// ============================================================

/**
 * Validate all phases after consolidation.
 * - All phases have ticketCount >= MIN_TICKETS_PER_PHASE (except the last)
 * - All ticket IDs are valid
 * - All ticket phaseIds match their owning phase id
 * - No empty tickets (non-empty nodeIds)
 *
 * @param {Phase[]} phases — phases array to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function finalValidation(phases) {
  const errors = [];

  if (!Array.isArray(phases) || phases.length === 0) {
    return { valid: true, errors: [] };
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const ticketCount = (phase.tickets || []).length;

    // Check ticket count (skip final phase)
    const isLastPhase = (i === phases.length - 1);
    if (!isLastPhase && ticketCount < MIN_TICKETS_PER_PHASE) {
      errors.push('フェーズ ' + PHASE_ID_PREFIX + phase.id +
        ' のチケット数が ' + ticketCount + '（最小 ' + MIN_TICKETS_PER_PHASE + ' 未満）');
    }

    for (const ticket of (phase.tickets || [])) {
      // Check ID format (integer, >= 1)
      if (typeof ticket.id !== 'number' || !Number.isInteger(ticket.id) || ticket.id < 1) {
        errors.push('チケット ' + (ticket.id !== undefined && ticket.id !== null ? ticket.id : '(空)') +
          ' のIDが不正（期待: 1 以上の integer）');
      }

      // Check phaseId consistency
      if (ticket.phaseId !== phase.id) {
        errors.push('チケット ' + ticket.id + ' の phaseId が ' +
          ticket.phaseId + '（期待: ' + phase.id + '）');
      }

      // Check for empty nodeIds
      if (!Array.isArray(ticket.nodeIds) || ticket.nodeIds.length === 0) {
        errors.push('チケット ' + ticket.id + ' の nodeIds が空です');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

// ============================================================
// File I/O
// ============================================================

/**
 * Read Tickets.json. Exits with process.exit on read failure.
 *
 * @param {string} ticketsPath — absolute path to Tickets.json
 * @returns {object} parsed ticket data
 */
function readTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json が見つかりません: ' + ticketsPath);
    process.exit(EXIT_FILE_NOT_FOUND);
  }
  try {
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (parseError) {
    console.error('[ERROR] Tickets.json のパースに失敗しました: ' + parseError.message);
    process.exit(EXIT_FAILURE);
  }
}

/**
 * Check if SPLIT-Status.json exists.
 *
 * @param {string} statusPath — absolute path to Status.json
 * @returns {boolean} true if exists
 */
function checkStatusFile(statusPath) {
  return fs.existsSync(statusPath);
}

/**
 * Atomically write a JSON file using temp file + rename.
 *
 * @param {string} targetPath — path to the target file
 * @param {object} data — data object to write
 */
function atomicWriteJson(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  const jsonContent = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmpPath, jsonContent, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// CLI argument parsing
// ============================================================

/**
 * Parse CLI arguments.
 *
 * @param {string[]} argv — equivalent to process.argv.slice(2)
 * @returns {{ ticketsPath: string, statusPath: string, dryRun: boolean, error: string|null }}
 */
function parseCliArgs(argv) {
  const positional = [];
  let dryRun = false;

  for (const arg of (argv || [])) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--')) {
      return {
        ticketsPath: '',
        statusPath: '',
        dryRun: false,
        error: '不明なフラグ: ' + arg + '。使用法: node consolidate-phase-tickets.js <Tickets.json> <status.json> [--dry-run]',
      };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    return {
      ticketsPath: '',
      statusPath: '',
      dryRun: false,
      error: '引数が不足しています。使用法: node consolidate-phase-tickets.js <Tickets.json> <status.json> [--dry-run]',
    };
  }

  return {
    ticketsPath: path.resolve(positional[0]),
    statusPath: path.resolve(positional[1]),
    dryRun: dryRun,
    error: null,
  };
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Main processing — sequentially execute phase consolidation, ID reassignment, and validation.
 *
 * @param {string} ticketsPath — absolute path to Tickets.json
 * @param {string} statusPath — absolute path to SPLIT-Status.json
 * @param {boolean} dryRun — suppress file writes in dry-run mode
 */
function runConsolidation(ticketsPath, statusPath, dryRun) {
  // Read Tickets.json
  const ticketsData = readTickets(ticketsPath);
  let phases = ticketsData.phases || [];

  console.log('=== consolidate-phase-tickets.js 開始 ===');
  console.log('入力 Tickets.json: ' + ticketsPath);
  console.log('フェーズ数: ' + phases.length);

  // 5-3-1: Guard check
  console.log('\n[5-3-1] ガード判定中...');
  const guardResult = guardPhaseCount(phases);
  if (guardResult.shouldSkip) {
    console.log('フェーズ数が ' + guardResult.phaseCount + '（最小 ' + MIN_TICKETS_PER_PHASE + ' 未満）のため統合処理をスキップしました');
    console.log('✅ スキップ（ガード条件充足）');
    return;
  }
  console.log('フェーズ数: ' + guardResult.phaseCount + '（閾値 ' + MIN_TICKETS_PER_PHASE + ' 以上）→ 続行');

  // 5-3-2: nodeIds coverage verification
  console.log('\n[5-3-2] nodeIds 過不足検証中...');
  const coverageResult = validateAllNodeIdsCovered(phases);
  if (!coverageResult.valid) {
    console.error('[ERROR] 未カバーの nodeIds が存在します:');
    for (const issue of coverageResult.missingNodeIds) {
      console.error('  フェーズ ' + PHASE_ID_PREFIX + issue.phaseId +
        ': ' + issue.nodeIds.join(', '));
    }
    console.error('全フェーズのチケット化を完了してから再実行してください。');
    console.log('⚠️ 不合格');
    process.exit(EXIT_FAILURE);
  }
  console.log('全 nodeIds が正しくチケット化されています。✅');

  // Save pre-consolidation phases (for status.json update)
  const oldPhasesJSON = JSON.parse(JSON.stringify(phases));

  // 5-3-3: Single-pass right-to-left consolidation
  console.log('\n[5-3-3] 後方1パス統合を実行中...');
  console.log('  閾値: ' + MIN_TICKETS_PER_PHASE + ' チケット未満のフェーズを統合');
  const consolidatedPhases = consolidateFromRight(phases);
  const removedCount = phases.length - consolidatedPhases.length;
  if (removedCount > 0) {
    console.log('  ' + removedCount + ' フェーズを統合しました');
  } else {
    console.log('  統合対象のフェーズはありませんでした');
  }
  phases = consolidatedPhases;

  // 5-3-4: Bulk reassign phase IDs
  console.log('\n[5-3-4] フェーズID一括振り直し中...');
  const beforePhaseIds = phases.map(function(p) { return p.id; });
  phases = renumberPhaseIds(phases);
  const afterPhaseIds = phases.map(function(p) { return p.id; });
  console.log('  ID: [' + beforePhaseIds.join(', ') + '] → [' + afterPhaseIds.join(', ') + ']');
  console.log('  フェーズ数: ' + phases.length);

  // 5-3-5: Bulk reassign ticket IDs
  console.log('\n[5-3-5] チケットID一括振り直し中...');
  phases = renumberTicketIds(phases);
  const totalTickets = phases.reduce(function(acc, p) { return acc + (p.tickets || []).length; }, 0);
  console.log('  総チケット数: ' + totalTickets);

  // Phase B: Regenerate relatedTicketIds (mechanically from GRAPH.json edges)
  console.log('\n[Phase B] relatedTicketIds 再生成中...');
  const graphEdges = loadGraphEdgesFromTickets(ticketsPath);
  if (graphEdges && graphEdges.length > 0) {
    phases = regenerateRelatedTicketIds(phases, graphEdges);
    console.log('  ' + graphEdges.length + ' エッジから relatedTicketIds を生成しました ✅');
  } else {
    console.log('  GRAPH.json が見つからないか空のためスキップ');
  }

  // Phase C: Update status.json
  if (checkStatusFile(statusPath)) {
    console.log('\n[Phase C] status.json 更新中...');
    updateStatusJson(statusPath, oldPhasesJSON, phases);
    console.log('  status.json の prune/renumber 完了 ✅');
  } else {
    console.log('\n[Phase C] status.json が見つからないためスキップ: ' + statusPath);
  }

  // 5-3-8: Final validation
  console.log('\n[5-3-8] 最終検証中...');
  const finalResult = finalValidation(phases);
  if (!finalResult.valid) {
    console.error('[ERROR] 最終検証に失敗しました:');
    for (const err of finalResult.errors) {
      console.error('  - ' + err);
    }
    console.log('⚠️ 不合格');
    process.exit(EXIT_FAILURE);
  }
  console.log('全検証項目を通過しました。✅');

  // ============================================================
  // Write to Tickets.json
  // ============================================================
  ticketsData.phases = phases;

  if (dryRun) {
    console.log('\n[--dry-run モード] 変更内容のサマリー:');
    console.log('  フェーズ数: ' + phases.length + ' / 総チケット数: ' + totalTickets);
    console.log('  Tickets.json への書き込みは行いませんでした。');
  } else {
    atomicWriteJson(ticketsPath, ticketsData);
    console.log('\n' + ticketsPath + ' に ' + phases.length + ' フェーズ / ' +
      totalTickets + ' チケットを書き込みました。');
  }

  console.log('\n✅ 合格 — 統合処理が正常に完了しました。');
}

/**
 * Entry point.
 */
function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.error) {
    console.error('[ERROR] ' + parsed.error);
    process.exit(EXIT_ARG_ERROR);
  }

  runConsolidation(parsed.ticketsPath, parsed.statusPath, parsed.dryRun);
}

if (require.main === module) {
  main();
}

module.exports = {
  // Pure functions (testable)
  guardPhaseCount,
  validateAllNodeIdsCovered,
  consolidateFromRight,
  renumberPhaseIds,
  renumberTicketIds,
  finalValidation,

  // Phase B/C (stubs)
  regenerateRelatedTicketIds,
  updateStatusJson,

  // I/O
  readTickets,
  checkStatusFile,
  atomicWriteJson,
  parseCliArgs,
  runConsolidation,

  // Constants
  MIN_TICKETS_PER_PHASE,
  PHASE_ID_PREFIX,
  EXIT_SUCCESS,
  EXIT_FAILURE,
  EXIT_ARG_ERROR,
  EXIT_FILE_NOT_FOUND,
};
