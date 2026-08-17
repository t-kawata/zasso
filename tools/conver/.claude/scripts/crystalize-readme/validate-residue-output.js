#!/usr/bin/env node

/**
 * validate-residue-output.js — Validate RESIDUE output structure (Step 4)
 *
 * CLI: validate-residue-output.js --residue=<path>
 *
 * Passes (exit 0, ok:true) iff the 4 required header fields and a non-empty
 * 未解決インベントリ section with complete entries are present.
 */

const fs = require('fs');

/** CLI argument prefix specifying the RESIDUE file path */
const RESIDUE_ARG_PREFIX = '--residue=';

/** Required RESIDUE header field markers */
const REQUIRED_RESIDUE_HEADERS = ['対象 RFC', '生成グラフ', '生成日時', '判定理由'];

/** Heading of the unresolved-inventory section */
const RESIDUE_INVENTORY_HEADING = '未解決インベントリ';

/** Fields every inventory entry must carry */
const INVENTORY_FIELDS = ['要求事項', '現状', '証拠', 'ステータス'];

/**
 * Parse command line arguments.
 *
 * @param {string[]} [args] — Test argument array (defaults to process.argv when omitted)
 * @returns {{ residuePath: string }}
 * @throws {Error} If the argument syntax is invalid
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function parseArguments(args) {
  const argv = args || process.argv.slice(2);
  if (argv.length !== 1 || !argv[0].startsWith(RESIDUE_ARG_PREFIX)) {
    throw new Error(`Usage: validate-residue-output.js ${RESIDUE_ARG_PREFIX}<path>`);
  }
  const residuePath = argv[0].slice(RESIDUE_ARG_PREFIX.length);
  if (!residuePath) {
    throw new Error('--residue value is empty.');
  }
  return { residuePath };
}

/**
 * Validate RESIDUE content structure.
 *
 * @param {string} text — RESIDUE markdown content
 * @returns {{ ok: boolean, errors: string[] }}
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function validateResidueOutput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, errors: ['RESIDUE content is empty.'] };
  }

  const errors = [];
  const lines = text.split('\n');

  for (const header of REQUIRED_RESIDUE_HEADERS) {
    if (!lines.some((line) => line.includes(header))) {
      errors.push(`Missing required header: ${header}`);
    }
  }

  const inventoryIndex = lines.findIndex(
    (line) => line.trim().startsWith('## ') && line.includes(RESIDUE_INVENTORY_HEADING)
  );

  if (inventoryIndex === -1) {
    errors.push(`Missing inventory section: ${RESIDUE_INVENTORY_HEADING}`);
  } else {
    const entryStarts = [];
    for (let i = inventoryIndex + 1; i < lines.length; i++) {
      if (/^###\s+\S/.test(lines[i])) {
        entryStarts.push(i);
      } else if (/^##\s+/.test(lines[i])) {
        break;
      }
    }

    if (entryStarts.length === 0) {
      errors.push('Inventory has no entries.');
    }

    for (let k = 0; k < entryStarts.length; k++) {
      const start = entryStarts[k];
      const end = k + 1 < entryStarts.length ? entryStarts[k + 1] : lines.length;
      const block = lines.slice(start, end).join('\n');
      for (const field of INVENTORY_FIELDS) {
        if (!block.includes(`${field}:`)) {
          errors.push(`Inventory entry on line ${start + 1} lacks '${field}'.`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * main — CLI entry point.
 */
// [::TICKET::] PX-152 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-152 --for-spec --no-implementation-order`.
function main() {
  try {
    const { residuePath } = parseArguments();
    const text = fs.readFileSync(residuePath, 'utf8');
    const result = validateResidueOutput(text);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

// Call main only when executed as CLI
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  validateResidueOutput,
  main,
  RESIDUE_ARG_PREFIX,
  REQUIRED_RESIDUE_HEADERS,
  RESIDUE_INVENTORY_HEADING,
  INVENTORY_FIELDS,
};
