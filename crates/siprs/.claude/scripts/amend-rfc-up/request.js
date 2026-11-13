'use strict';

/**
 * /amend-rfc-up change request.
 *
 * The AI interprets the free instruction and material; this module turns that
 * interpretation into a fixed-schema request and validates it. Every clause the
 * instruction carries must be answered by a change or an explicit no-op reason.
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertChangeDag, assertCrossPackageImpacts, validateArtifactChange } = require('./changes.js');
const { validateRuleCoverage } = require('./rules.js');
const { extractObligations, validateObligationCoverage } = require('./obligations.js');
const { assertSurfaceCoverage } = require('./workspace.js');

const REQUEST_SCHEMA = 'amend-rfc-up.request/v2';
const LEGACY_REQUEST_SCHEMA = 'amend-rfc-up.request/v1';
const MATERIAL_KINDS = Object.freeze({
  LAW_SKILL: 'law-skill',
  ORDINARY: 'ordinary',
});
const CLAUSE_PATTERN = /^(?:\d+[.)]|[-*])\s+(.+)$/;

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** A *-law skill is a directory whose basename ends -law and carries SKILL.md + okf/. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function classifyMaterial({ path: materialPath, instructionText = '' } = {}) {
  const resolved = path.resolve(materialPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const basename = path.basename(resolved);
    if (basename.endsWith('-law')
      && fs.existsSync(path.join(resolved, 'SKILL.md'))
      && fs.existsSync(path.join(resolved, 'okf'))) {
      return { kind: MATERIAL_KINDS.LAW_SKILL, skillPath: resolved, instructionText };
    }
  }
  return { kind: MATERIAL_KINDS.ORDINARY, path: resolved, instructionText };
}

/** Numbered/bulleted lines are clauses; a prose paragraph is one clause. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function parseInstruction({ instructionText = '' } = {}) {
  const lines = String(instructionText).split('\n').map((line) => line.trim()).filter(Boolean);
  const texts = [];
  for (const line of lines) {
    const match = line.match(CLAUSE_PATTERN);
    if (match) texts.push(match[1]);
  }
  if (texts.length === 0 && String(instructionText).trim() !== '') texts.push(String(instructionText).trim());
  return texts.map((text, index) => ({ id: `I${index + 1}`, text }));
}

/** Build the request the AI authored. Evidence ids bind changes to clauses. */
// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function buildChangeRequest(input = {}) {
  const {
    instructionText,
    material = [],
    law = null,
    changes = [],
    packages = [],
    ruleCoverage = [],
    surfaceCoverage = [],
    crossPackageImpacts = [],
    rules = null,
    surfaces = null,
    obligations = [],
    obligationCoverage = [],
  } = input;
  const instructionClauses = parseInstruction({ instructionText }).map((clause) => ({
    ...clause,
    changeIds: changes
      .filter((change) => (change.evidence || []).includes(clause.id))
      .map((change) => change.id),
    noOpReason: null,
  }));
  return {
    schema: REQUEST_SCHEMA,
    instruction: String(instructionText || ''),
    material,
    law,
    packages,
    instructionClauses,
    ruleCoverage,
    surfaceCoverage,
    crossPackageImpacts,
    rules,
    surfaces,
    obligations,
    obligationCoverage,
    changes,
  };
}

/** Normalize a v1 request to v2 for a single default package. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function normalizeRequest({ request, defaultPackage = null } = {}) {
  if (request && request.schema === REQUEST_SCHEMA) return request;
  const packages = defaultPackage ? [{ id: defaultPackage, dir: null }] : [];
  return {
    ...(request || {}),
    schema: REQUEST_SCHEMA,
    packages,
    ruleCoverage: request?.ruleCoverage || [],
    surfaceCoverage: request?.surfaceCoverage || [],
    crossPackageImpacts: request?.crossPackageImpacts || [],
    rules: request?.rules || null,
    surfaces: request?.surfaces || null,
    obligations: request?.obligations || [],
    obligationCoverage: request?.obligationCoverage || [],
    changes: (request?.changes || []).map((change) => (
      change.package || !defaultPackage ? change : { ...change, package: defaultPackage }
    )),
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function packageIdSet(request, packages) {
  const declared = Array.isArray(request.packages) && request.packages.length > 0
    ? request.packages
    : (packages || []);
  return new Set(declared.map((entry) => (typeof entry === 'string' ? entry : entry.id)));
}

/**
 * The inventory is derived from the material, never trusted from the caller.
 * An empty, partial or stale inventory would let semantic coverage pass
 * without the model ever facing the material's obligations.
 */
function assertObligationInventory({ request, materialPaths }) {
  if (!Array.isArray(materialPaths) || materialPaths.length === 0) return;
  const expected = extractObligations({ materialPaths }).map((obligation) => obligation.id);
  const provided = new Set((request.obligations || []).map((obligation) => obligation.id));
  const missing = expected.filter((id) => !provided.has(id));
  // The caller may add obligations the extractor cannot see; it may never drop
  // one the material states.
  if (missing.length > 0) {
    throw fail('OBLIGATION_INVENTORY_STALE', 'the obligation inventory omits material obligations', {
      expected: expected.length,
      provided: provided.size,
      missing: missing.length,
    });
  }
}

/** Validate the request and every change it carries. */
// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function validateChangeRequest({ request, packages = null, materialPaths = null } = {}) {
  if (!request || request.schema !== REQUEST_SCHEMA) {
    throw fail('CHANGE_INVALID', `request schema must be ${REQUEST_SCHEMA}`);
  }
  const clauses = Array.isArray(request.instructionClauses) ? request.instructionClauses : [];
  for (const clause of clauses) {
    const hasChange = Array.isArray(clause.changeIds) && clause.changeIds.length > 0;
    const hasNoOp = typeof clause.noOpReason === 'string' && clause.noOpReason.trim() !== '';
    if (!hasChange && !hasNoOp) {
      throw fail('REQUEST_CLAUSE_UNCOVERED', `instruction clause ${clause.id || '(unnamed)'} has no change or noOpReason`);
    }
  }
  const seen = new Set();
  const packageIds = packageIdSet(request, packages);
  for (const change of request.changes || []) {
    if (!change || typeof change.id !== 'string' || change.id.length === 0) {
      throw fail('CHANGE_INVALID', 'every change needs an id');
    }
    if (seen.has(change.id)) throw fail('CHANGE_INVALID', `duplicate change id: ${change.id}`);
    seen.add(change.id);
    if (packageIds.size > 0) {
      if (typeof change.package !== 'string' || !packageIds.has(change.package)) {
        throw fail('CHANGE_INVALID', `change ${change.id} names an unknown package: ${change.package || '(missing)'}`);
      }
    }
    validateArtifactChange({ change });
  }
  assertChangeDag({ changes: request.changes || [] });

  if (Array.isArray(request.rules) && request.rules.length > 0) {
    validateRuleCoverage({
      rules: request.rules,
      coverage: request.ruleCoverage || [],
      changes: request.changes || [],
    });
  }
  if (Array.isArray(request.surfaces) && request.surfaces.length > 0) {
    assertSurfaceCoverage({
      surfaces: request.surfaces,
      coverage: request.surfaceCoverage || [],
      packages: (packages || []).length > 0 ? packages : (request.packages || []),
    });
  }
  const resolvedMaterialPaths = materialPaths
    || (request.material || []).map((entry) => entry.path).filter(Boolean);
  assertObligationInventory({ request, materialPaths: resolvedMaterialPaths });
  if (Array.isArray(request.obligations) && request.obligations.length > 0) {
    validateObligationCoverage({
      obligations: request.obligations,
      coverage: request.obligationCoverage || [],
      changes: request.changes || [],
      materialPaths: resolvedMaterialPaths,
    });
  }
  if (Array.isArray(request.crossPackageImpacts) && request.crossPackageImpacts.length > 0) {
    assertCrossPackageImpacts({
      impacts: request.crossPackageImpacts,
      packageIds: [...packageIds],
      changeIds: [...seen],
    });
  }
  return { ok: true };
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  try {
    const instructionText = argumentValue(argv, 'instruction')
      ? fs.readFileSync(argumentValue(argv, 'instruction').replace(/^@/, ''), 'utf8')
      : '';
    const changes = readJsonInput(argumentValue(argv, 'changes')) || [];
    const material = readJsonInput(argumentValue(argv, 'material')) || [];
    const law = readJsonInput(argumentValue(argv, 'law'));
    const obligationsInput = argumentValue(argv, 'obligations');
    const coverageInput = argumentValue(argv, 'obligation-coverage');
    if (obligationsInput === null || coverageInput === null) {
      throw fail('OBLIGATION_INPUT_REQUIRED', '--obligations and --obligation-coverage are required');
    }
    const materialsInput = readJsonInput(argumentValue(argv, 'materials')) || [];
    const materialPaths = Array.isArray(materialsInput)
      ? materialsInput.map((entry) => (typeof entry === 'string' ? entry : entry?.path)).filter(Boolean)
      : [];
    const request = buildChangeRequest({
      instructionText,
      material,
      law,
      changes,
      packages: readJsonInput(argumentValue(argv, 'packages')) || [],
      rules: readJsonInput(argumentValue(argv, 'rules')),
      ruleCoverage: readJsonInput(argumentValue(argv, 'rule-coverage')) || [],
      surfaces: readJsonInput(argumentValue(argv, 'surfaces')),
      surfaceCoverage: readJsonInput(argumentValue(argv, 'surface-coverage')) || [],
      crossPackageImpacts: readJsonInput(argumentValue(argv, 'impacts')) || [],
      obligations: readJsonInput(obligationsInput) || [],
      obligationCoverage: readJsonInput(coverageInput) || [],
    });
    validateChangeRequest({ request, packages: request.packages, materialPaths });
    process.stdout.write(`${JSON.stringify(request)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'CHANGE_INVALID', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  LEGACY_REQUEST_SCHEMA,
  MATERIAL_KINDS,
  REQUEST_SCHEMA,
  assertObligationInventory,
  buildChangeRequest,
  classifyMaterial,
  normalizeRequest,
  parseInstruction,
  validateChangeRequest,
};
