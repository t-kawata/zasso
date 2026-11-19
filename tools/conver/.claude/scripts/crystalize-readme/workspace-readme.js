#!/usr/bin/env node

/**
 * workspace-readme.js — converge the workspace README without losing human text.
 *
 * Only managed blocks are written. Everything outside a block is human-owned and
 * must stay byte-identical. A malformed block is a structural error: the writer
 * refuses rather than guessing where the managed region ends.
 */

const fs = require('fs');
const path = require('path');
const { validateReadmeLanguage } = require('./validate-readme-language.js');

const WORKSPACE_BLOCK_ID = 'WORKSPACE';
const PACKAGE_BLOCK_PREFIX = 'PACKAGE:';
const BLOCK_ID_PATTERN = /^(?:WORKSPACE|PACKAGE:[A-Za-z0-9._-]+)$/;

/** The lock that serializes read-modify-write of the workspace README. */
const LOCK_FILENAME = '.crystalize-workspace.lock';
const LOCK_RETRIES = 5;
const LOCK_RETRY_DELAY_MS = 100;

/** The workspace block placeholder replaced by the deterministic aggregate. */
const AGGREGATE_PLACEHOLDER = '<!-- crystalize-aggregate -->';
const AGGREGATE_HEADER = '| Unit | Path | Role | Contract | README |';
const AGGREGATE_SEPARATOR = '|---|---|---|---|---|';
const NOT_CRYSTALLIZED_STATE = 'not crystallized';

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function beginMarker(id) {
  return `<!-- [::CRYSTALIZE:${id}:BEGIN] -->`;
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function endMarker(id) {
  return `<!-- [::CRYSTALIZE:${id}:END] -->`;
}

/**
 * Parse managed blocks, preserving their position and body.
 *
 * @param {string} text
 * @returns {Array<{id: string, body: string, start: number, end: number, closed: boolean}>}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function parseWorkspaceBlocks(text) {
  const source = String(text);
  const lines = source.split('\n');
  const blocks = [];
  let open = null;
  let offset = 0;

  for (const line of lines) {
    const begin = line.match(/^<!-- \[::CRYSTALIZE:([^:]+(?::[A-Za-z0-9._-]+)?):BEGIN\] -->$/);
    const end = line.match(/^<!-- \[::CRYSTALIZE:([^:]+(?::[A-Za-z0-9._-]+)?):END\] -->$/);
    if (begin) {
      if (open !== null) {
        open.closed = false;
        blocks.push(open);
      }
      open = { id: begin[1], body: '', start: offset, end: offset, closed: false };
    } else if (end) {
      if (open !== null && open.id === end[1]) {
        open.end = offset;
        open.closed = true;
        blocks.push(open);
        open = null;
      }
    } else if (open !== null) {
      open.body += (open.body === '' ? '' : '\n') + line;
    }
    offset += line.length + 1;
  }
  if (open !== null) {
    open.closed = false;
    blocks.push(open);
  }
  return blocks;
}

/**
 * Validate block grammar.
 *
 * @param {string} text
 * @returns {{ok: boolean, errors: string[], blocks: Array<object>}}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function validateWorkspaceBlocks(text) {
  const blocks = parseWorkspaceBlocks(text);
  const errors = [];
  const seen = new Set();
  for (const block of blocks) {
    if (!BLOCK_ID_PATTERN.test(block.id)) {
      errors.push(`unknown managed block id: ${block.id}`);
    }
    if (!block.closed) {
      errors.push(`unclosed managed block: ${block.id}`);
    }
    if (seen.has(block.id)) {
      errors.push(`duplicate managed block: ${block.id}`);
    }
    seen.add(block.id);
  }
  const workspaceCount = blocks.filter((block) => block.id === WORKSPACE_BLOCK_ID).length;
  if (workspaceCount > 1) errors.push('more than one workspace block');
  if (blocks.length > 0 && workspaceCount === 0) errors.push('missing workspace block');
  return { ok: errors.length === 0, errors, blocks };
}

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function renderBlock(id, body) {
  return `${beginMarker(id)}\n${body}\n${endMarker(id)}`;
}

/**
 * Replace one block body in place, or return null when the block is absent.
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function replaceBlockBody(text, id, body) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(<!-- \\[::CRYSTALIZE:${escaped}:BEGIN\\] -->\\n)[\\s\\S]*?(\\n<!-- \\[::CRYSTALIZE:${escaped}:END\\] -->)`,
  );
  if (!pattern.test(text)) return null;
  return text.replace(pattern, `$1${body}$2`);
}

/**
 * Throw when a managed block contains a non-English letter.
 *
 * @param {string} block
 * @param {string} label
 * @throws {Error} With the first offending line
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function assertBlockLanguage(block, label) {
  const verdict = validateReadmeLanguage(block);
  if (verdict.ok) return;
  const first = verdict.findings[0];
  throw new Error(`${label} language violation at line ${first.line}: ${first.script}`);
}

/**
 * Build the deterministic package aggregate: unit id order, no timestamps, and
 * a `not crystallized` row for every known unit without a package block.
 *
 * @param {{packageBlocks?: Array<{unitId: string, path?: string, role?: string,
 *   contractState?: string, readmePath?: string}>, knownUnits?: string[]}} input
 * @returns {string}
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function buildWorkspaceAggregate({ packageBlocks = [], knownUnits = [] } = {}) {
  const byUnit = new Map(packageBlocks.map((block) => [block.unitId, block]));
  for (const unit of knownUnits) {
    if (!byUnit.has(unit)) byUnit.set(unit, { unitId: unit, missing: true });
  }
  const rows = [...byUnit.values()].sort((left, right) => {
    if (left.unitId === right.unitId) return 0;
    return left.unitId < right.unitId ? -1 : 1;
  });
  const tableRows = rows.map((block) => {
    if (block.missing) {
      return `| ${block.unitId} | - | - | ${NOT_CRYSTALLIZED_STATE} | - |`;
    }
    return `| ${block.unitId} | ${block.path || '.'} | ${block.role || '-'} | ${block.contractState || 'complete'} | ${block.readmePath || '-'} |`;
  });
  return [AGGREGATE_HEADER, AGGREGATE_SEPARATOR, ...tableRows].join('\n');
}

/**
 * Replace the aggregate placeholder with the deterministic table.
 *
 * @param {string} workspaceBlock
 * @param {{packageBlocks?: Array<object>, knownUnits?: string[]}|null} aggregate
 * @returns {string}
 * @throws {Error} When aggregate data is supplied without the placeholder
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function resolveWorkspaceBlock(workspaceBlock, aggregate) {
  const block = String(workspaceBlock);
  if (!aggregate) return block;
  if (!block.includes(AGGREGATE_PLACEHOLDER)) {
    throw new Error(`workspaceBlock must include ${AGGREGATE_PLACEHOLDER} when aggregate data is supplied.`);
  }
  return block.split(AGGREGATE_PLACEHOLDER).join(buildWorkspaceAggregate(aggregate));
}

/**
 * Create, append, or replace only the managed blocks.
 *
 * @param {string} text — existing README (may be empty)
 * @param {{unitId: string, packageBlock: string, workspaceBlock: string,
 *   englishOnly?: boolean, aggregate?: object}} [content]
 * @returns {string} updated README
 * @throws {Error} When existing blocks are malformed or a block is not English
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function updateWorkspaceReadme(text, content = {}) {
  const {
    unitId,
    packageBlock,
    workspaceBlock,
    englishOnly = false,
    aggregate = null,
  } = content;
  if (englishOnly) {
    assertBlockLanguage(packageBlock, 'packageBlock');
    assertBlockLanguage(workspaceBlock, 'workspaceBlock');
  }
  const resolvedWorkspaceBlock = resolveWorkspaceBlock(workspaceBlock, aggregate);
  const source = String(text || '');
  const validation = validateWorkspaceBlocks(source);
  if (!validation.ok) {
    throw new Error(`malformed managed blocks: ${validation.errors.join('; ')}`);
  }

  const packageId = `${PACKAGE_BLOCK_PREFIX}${unitId}`;
  let next = source;
  const updates = [
    [WORKSPACE_BLOCK_ID, resolvedWorkspaceBlock],
    [packageId, packageBlock],
  ];

  for (const [id, body] of updates) {
    const replaced = replaceBlockBody(next, id, body);
    if (replaced !== null) {
      next = replaced;
    }
  }

  const existingIds = new Set(parseWorkspaceBlocks(next).map((block) => block.id));
  const missing = updates.filter(([id]) => !existingIds.has(id));
  if (missing.length > 0) {
    const separator = next === '' ? '' : (next.endsWith('\n') ? '\n' : '\n\n');
    next += separator + missing.map(([id, body]) => renderBlock(id, body)).join('\n\n') + '\n';
  }

  return next;
}

/**
 * Count managed blocks with the given id.
 *
 * @param {string} text
 * @param {string} id
 * @returns {number}
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function countBlocks(text, id) {
  const marker = beginMarker(id);
  return String(text).split('\n').filter((line) => line.trim() === marker).length;
}

/**
 * Sleep synchronously between lock retries.
 *
 * @param {number} milliseconds
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Acquire the workspace lock with O_EXCL, retrying a bounded number of times.
 *
 * @param {string} lockPath
 * @param {{retries?: number, delayMs?: number}} [options]
 * @returns {() => void} release function
 * @throws {Error} When the lock is held after the retry budget
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function acquireWorkspaceLock(lockPath, { retries = LOCK_RETRIES, delayMs = LOCK_RETRY_DELAY_MS } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      fs.closeSync(descriptor);
      return () => {
        try {
          fs.unlinkSync(lockPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === retries) throw new Error(`workspace lock is held: ${lockPath}`);
      sleepSync(delayMs);
    }
  }
  throw new Error(`workspace lock is held: ${lockPath}`);
}

/**
 * Read, update, and write the workspace README inside the lock.
 *
 * @param {string} filePath
 * @param {object} content — updateWorkspaceReadme content
 * @param {{retries?: number, delayMs?: number}} [lockOptions]
 * @returns {string} updated README
 */
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function updateWorkspaceFile(filePath, content, lockOptions = {}) {
  const lockPath = path.join(path.dirname(filePath), LOCK_FILENAME);
  const release = acquireWorkspaceLock(lockPath, lockOptions);
  try {
    const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const next = updateWorkspaceReadme(text, content);
    const temporaryPath = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(temporaryPath, next, 'utf8');
    fs.renameSync(temporaryPath, filePath);
    return next;
  } finally {
    release();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--aggregate')) {
    try {
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      process.stdout.write(`${buildWorkspaceAggregate(input)}\n`);
    } catch (error) {
      console.error('[ERROR] Aggregate build failed.');
      console.error(`Cause: ${error.message}`);
      console.error('Action: Provide {packageBlocks, knownUnits} on stdin.');
      process.exit(1);
    }
    process.exit(0);
  }
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  const update = args.includes('--update');
  const englishOnly = args.includes('--english-only');
  const file = fileArg ? fileArg.slice('--file='.length) : args.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('Usage: workspace-readme.js --file=<README.md> [--update] [--english-only]');
    process.exit(2);
  }
  const resolved = path.resolve(file);
  const text = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';

  if (update) {
    try {
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      updateWorkspaceFile(resolved, { ...input, englishOnly });
      process.stdout.write(`${JSON.stringify({ ok: true, path: resolved })}\n`);
    } catch (error) {
      console.error('[ERROR] Workspace README update failed.');
      console.error(`Cause: ${error.message}`);
      console.error('Action: Fix the reported block, language, or lock problem and re-run.');
      process.exit(1);
    }
  } else {
    const validation = validateWorkspaceBlocks(text);
    process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    process.exit(validation.ok ? 0 : 1);
  }
}

module.exports = {
  WORKSPACE_BLOCK_ID,
  PACKAGE_BLOCK_PREFIX,
  LOCK_FILENAME,
  AGGREGATE_PLACEHOLDER,
  beginMarker,
  endMarker,
  parseWorkspaceBlocks,
  validateWorkspaceBlocks,
  updateWorkspaceReadme,
  updateWorkspaceFile,
  acquireWorkspaceLock,
  buildWorkspaceAggregate,
  countBlocks,
};
