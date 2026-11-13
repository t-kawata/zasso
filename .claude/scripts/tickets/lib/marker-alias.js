'use strict';

/**
 * marker-alias — resolve a historical ticket key through identity.aliases and
 * rewrite the surviving stub markers transactionally.
 *
 * A condensation merge may absorb a ticket whose key a marker still names. The
 * alias table is the resolution source; the rewrite is a convenience that keeps
 * the next consolidation free of orphan keys.
 */

const fs = require('node:fs');
const path = require('node:path');

const ALIAS_GENERATION_RE = /^(.+?)@g(\d+)$/;
const STUB_MARKER_TOKEN = '[::STUB::]';

/** The live ticket for a key, or null. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function liveTicket(ticketsData, key) {
  if (!ticketsData || !Array.isArray(ticketsData.phases) || !key) return null;
  const match = String(key).match(/^P(-?\d+|X)-(\d+)$/);
  if (!match) return null;
  const phaseId = match[1] === 'X' ? -1 : parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);
  for (const phase of ticketsData.phases) {
    if (phase.id !== phaseId) continue;
    const ticket = (phase.tickets || []).find((entry) => entry.id === ticketId);
    if (ticket) return ticket;
  }
  return null;
}

/** The alias target for a raw or generation-qualified key, or null. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function resolveAliasTarget(ticketsData, key, generation = null) {
  if (!ticketsData || !key) return null;
  if (liveTicket(ticketsData, key) !== null) return key;

  const aliases = ticketsData.identity?.aliases ?? {};
  const currentGeneration = ticketsData.identity?.generation ?? 0;
  const requestedGeneration = generation === null ? currentGeneration : generation;
  const baseKey = String(key).replace(ALIAS_GENERATION_RE, '$1');

  let best = null;
  for (const [aliasKey, target] of Object.entries(aliases)) {
    const match = String(aliasKey).match(ALIAS_GENERATION_RE);
    if (match === null) continue;
    if (match[1] !== baseKey) continue;
    const aliasGeneration = parseInt(match[2], 10);
    if (aliasGeneration > requestedGeneration) continue;
    if (best === null || aliasGeneration > best.generation) best = { generation: aliasGeneration, target };
  }
  if (best === null || typeof best.target !== 'string') return null;
  return liveTicket(ticketsData, best.target) === null ? null : best.target;
}

/** A typed finding for a marker rewrite. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function markerFinding(code, problem, extra = {}) {
  return { code, problem, ...extra };
}

/**
 * Rewrite marker keys to their surviving ticket.
 *
 * Every target is validated in memory before the first byte is written. A
 * failure restores every original file and returns typed findings.
 */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteMarkerLines({ cwd, ticketsData, rewrites = [], dryRun = false } = {}) {
  const root = path.resolve(cwd ?? process.cwd());
  const findings = [];
  const planned = [];
  const originals = new Map();

  for (const rewrite of rewrites) {
    const filePath = path.resolve(root, rewrite.file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const line = lines[rewrite.line - 1];
    if (line === undefined) {
      findings.push(markerFinding('MARKER_LINE_MISSING', `line ${rewrite.line} does not exist in ${rewrite.file}`, rewrite));
      continue;
    }
    if (!line.includes(STUB_MARKER_TOKEN)) {
      findings.push(markerFinding('MARKER_LINE_MISMATCH', `line ${rewrite.line} of ${rewrite.file} carries no ${STUB_MARKER_TOKEN} marker`, rewrite));
      continue;
    }
    if (typeof rewrite.from !== 'string' || !line.includes(rewrite.from)) {
      findings.push(markerFinding('MARKER_KEY_MISMATCH', `line ${rewrite.line} of ${rewrite.file} does not contain ${rewrite.from}`, rewrite));
      continue;
    }
    const to = rewrite.to ?? resolveAliasTarget(ticketsData, rewrite.from);
    if (typeof to !== 'string' || to.length === 0) {
      findings.push(markerFinding('MARKER_ALIAS_UNRESOLVED', `no live survivor resolves ${rewrite.from}`, rewrite));
      continue;
    }
    lines[rewrite.line - 1] = line.replace(rewrite.from, to);
    originals.set(filePath, content);
    planned.push({ ...rewrite, to, filePath, content: lines.join('\n') });
  }

  if (findings.length > 0) {
    return { ok: false, findings, rewrites: planned.map((entry) => ({ ...entry, filePath: undefined, content: undefined })) };
  }

  if (dryRun) {
    return {
      ok: true,
      findings: [],
      rewrites: planned.map((entry) => ({ file: entry.file, line: entry.line, from: entry.from, to: entry.to })),
    };
  }

  try {
    for (const entry of planned) {
      const temporary = `${entry.filePath}.px415-tmp`;
      fs.writeFileSync(temporary, entry.content, 'utf8');
      fs.renameSync(temporary, entry.filePath);
    }
  } catch (error) {
    const findings = [
      markerFinding('MARKER_REWRITE_FAILED', error instanceof Error ? error.message : String(error)),
    ];
    for (const [filePath, content] of originals) {
      try {
        fs.writeFileSync(filePath, content, 'utf8');
      } catch (rollbackError) {
        findings.push(markerFinding(
          'MARKER_ROLLBACK_FAILED',
          `could not restore ${filePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        ));
      }
    }
    return { ok: false, findings, rewrites: [] };
  }

  return {
    ok: true,
    findings: [],
    rewrites: planned.map((entry) => ({ file: entry.file, line: entry.line, from: entry.from, to: entry.to })),
  };
}

module.exports = {
  liveTicket,
  resolveAliasTarget,
  rewriteMarkerLines,
};
