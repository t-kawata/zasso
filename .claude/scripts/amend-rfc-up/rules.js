'use strict';

/**
 * /amend-rfc-up rule inventory and coverage.
 *
 * The material's registry tables are the authoritative rule set. Every ID in
 * that set must end with a covered change or an explicit not_applicable reason;
 * an inline-only ID is surfaced as an unregistered rule instead of silently
 * disappearing.
 */

const fs = require('node:fs');

const RULE_ID_PATTERN = '[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\\d{2,4}';
const RULE_TABLE_PATTERN = new RegExp(`^\\|\\s*\`?(${RULE_ID_PATTERN})\`?\\s*\\|`);
const RULE_TOKEN_PATTERN = new RegExp(`\\b${RULE_ID_PATTERN}\\b`, 'g');
const TABLE_CELL_SEPARATOR = /\|/;
const COVERED_STATUS = 'covered';
const NOT_APPLICABLE_STATUS = 'not_applicable';
const UNSET_STATUS = 'unset';

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readMaterialText(materialPaths) {
  return materialPaths
    .filter((materialPath) => fs.existsSync(materialPath) && fs.statSync(materialPath).isFile())
    .map((materialPath) => fs.readFileSync(materialPath, 'utf8'))
    .join('\n');
}

/** The statement is the longest cell after the ID; table layouts vary. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function statementFromRow(line) {
  const cells = line.split(TABLE_CELL_SEPARATOR)
    .slice(1, -1)
    .map((cell) => cell.trim());
  const body = cells.slice(1).filter(Boolean);
  if (body.length === 0) return '';
  return body.reduce((longest, cell) => (cell.length > longest.length ? cell : longest), '');
}

/** Extract registry rows first, then inline-only IDs, deterministic and deduped. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function extractRules({ materialPaths = [] } = {}) {
  const rules = new Map();
  for (const materialPath of materialPaths) {
    const filePath = typeof materialPath === 'string' ? materialPath : materialPath?.path;
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const tableMatch = line.match(RULE_TABLE_PATTERN);
      if (tableMatch) {
        const id = tableMatch[1];
        if (!rules.has(id)) {
          rules.set(id, {
            id,
            statement: statementFromRow(line),
            sourceLine: index + 1,
            registered: true,
          });
        }
        continue;
      }
      for (const token of line.match(RULE_TOKEN_PATTERN) || []) {
        if (!rules.has(token)) {
          rules.set(token, { id: token, statement: '', sourceLine: index + 1, registered: false });
        }
      }
    }
  }
  return [...rules.values()].sort((left, right) => left.id.localeCompare(right.id));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function initRuleCoverage({ rules = [] } = {}) {
  return rules.map((rule) => ({
    ruleId: rule.id,
    status: UNSET_STATUS,
    changeIds: [],
    reason: null,
  }));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function indexCoverage(coverage) {
  const indexed = new Map();
  for (const entry of coverage) {
    if (!entry || typeof entry.ruleId !== 'string') {
      throw fail('RULE_COVERAGE_INVALID', 'every coverage entry needs a ruleId');
    }
    if (indexed.has(entry.ruleId)) {
      throw fail('RULE_COVERAGE_INVALID', `duplicate rule coverage: ${entry.ruleId}`, { ruleId: entry.ruleId });
    }
    indexed.set(entry.ruleId, entry);
  }
  return indexed;
}

/** Every rule is covered or explicitly not applicable. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function validateRuleCoverage({ rules = [], coverage = [], changes = [] } = {}) {
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const changeIds = new Set(changes.map((change) => change.id));
  const indexed = indexCoverage(coverage);

  for (const ruleId of indexed.keys()) {
    if (!ruleIds.has(ruleId)) {
      throw fail('RULE_COVERAGE_INVALID', `unknown rule in coverage: ${ruleId}`, { ruleId });
    }
  }
  if (indexed.size !== ruleIds.size) {
    throw fail('RULE_COVERAGE_INVALID', 'coverage does not name every rule');
  }

  for (const rule of rules) {
    const entry = indexed.get(rule.id);
    if (entry.status === COVERED_STATUS) {
      const ids = Array.isArray(entry.changeIds) ? entry.changeIds : [];
      if (ids.length === 0 || ids.some((id) => !changeIds.has(id))) {
        throw fail('RULE_COVERAGE_INVALID', `covered rule ${rule.id} names an unknown change`, { ruleId: rule.id });
      }
    } else if (entry.status === NOT_APPLICABLE_STATUS) {
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        throw fail('RULE_COVERAGE_INVALID', `not_applicable rule ${rule.id} needs a reason`, { ruleId: rule.id });
      }
    } else {
      throw fail('REQUEST_RULE_UNCOVERED', `rule ${rule.id} has no coverage decision`, { ruleId: rule.id });
    }
  }
  return { ok: true };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readMaterials(value) {
  if (!value) return [];
  try {
    const parsed = readJsonInput(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (error) {
    // A plain comma-separated list is the fallback form.
  }
  return String(value).split(',').filter(Boolean);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (command === 'inventory') {
      const rules = extractRules({ materialPaths: readMaterials(argumentValue(argv, 'materials')) });
      const outPath = argumentValue(argv, 'out');
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(rules, null, 2) + '\n');
      process.stdout.write(`${JSON.stringify({ ok: true, count: rules.length, out: outPath || null })}\n`);
      return 0;
    }
    if (command === 'init') {
      const rules = readJsonInput(argumentValue(argv, 'inventory')) || [];
      const coverage = initRuleCoverage({ rules });
      const outPath = argumentValue(argv, 'out');
      if (outPath) fs.writeFileSync(outPath, JSON.stringify(coverage, null, 2) + '\n');
      process.stdout.write(`${JSON.stringify({ ok: true, count: coverage.length, out: outPath || null })}\n`);
      return 0;
    }
    if (command === 'validate') {
      const rules = readJsonInput(argumentValue(argv, 'inventory')) || [];
      const coverage = readJsonInput(argumentValue(argv, 'coverage')) || [];
      const changes = readJsonInput(argumentValue(argv, 'changes')) || [];
      process.stdout.write(`${JSON.stringify(validateRuleCoverage({ rules, coverage, changes }))}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'RULE_INVENTORY_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  COVERED_STATUS,
  NOT_APPLICABLE_STATUS,
  RULE_TABLE_PATTERN,
  RULE_TOKEN_PATTERN,
  UNSET_STATUS,
  extractRules,
  initRuleCoverage,
  validateRuleCoverage,
};
