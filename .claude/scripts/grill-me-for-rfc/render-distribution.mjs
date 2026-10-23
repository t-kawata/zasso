// PX-307 @verifies C002
// The only writer of the Distribution ledger, the distribution-map block and the managed
// unit anchors. It bootstraps from the existing ledger, then renders all three from the
// map, and it writes nothing when any gate fails.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLedgerRows } from '../sequences-slice/lib/distribution-ledger.mjs';
import {
  DISTRIBUTION_MAP_SCHEMA_VERSION,
  collectViewUnits,
  ledgerRowOf,
  mapDigest,
  parseDistributionMap,
  renderDistributionMap,
  residualRowOf,
  resolveSections,
  validateMapAgainstView,
  viewDigest,
} from '../sequences-slice/lib/distribution-map.mjs';
import { isUnitId, normalizeHeading } from '../rfc-graph/lib/unit-ids.mjs';

const LEDGER_TITLE = 'Distribution ledger';
const STATUS_FILE_NAME = 'Status.json';

/** The generation a package's first recorded distribution is counted as. */
const FIRST_GENERATION = 1;
const PRECEDENCE_SENTENCE = 'RFC.md is canonical for this package; the projection is an input, not an authority.';
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const ANCHOR_LINE = /^\s*<!--\s*unit:\s*([A-Za-z0-9._:-]+)\s*-->\s*$/;
const DOTTED_NUMBER = /^\d+(?:\.\d+)*$/;

/** A refusal in the shape the caller reports. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function refuse(code, extra = {}) {
  return { ok: false, code, rfc: null, map: null, wrote: false, ...extra };
}

/** The ledger appendix range, or null when the RFC carries none. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function findLedgerRange(lines) {
  const start = lines.findIndex((line) => {
    const match = HEADING.exec(line);
    return match !== null && match[2].trim().endsWith(LEDGER_TITLE);
  });
  if (start === -1) return null;
  const level = HEADING.exec(lines[start])[1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = HEADING.exec(lines[index]);
    if (match !== null && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return { start, end };
}

/** Strip backticks and surrounding whitespace from a ledger cell. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function cleanCell(value) {
  return String(value ?? '').replace(/`/g, '').trim();
}

/** A cell read as prose: whitespace collapsed, but the author's inline code kept. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function groundCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** The package ids an Owner cell names; a co-owned operation lists them with `+` or `,`. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function ownerPackages(cell) {
  return cleanCell(cell)
    .split(/[+,]/)
    .map((token) => cleanCell(token))
    .filter((token) => token.length > 0);
}

/** The section tokens a ledger location names. */
// [::TICKET::] PX-307, PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-309) --for-spec --no-implementation-order`.
function locationTokens(location) {
  const cleaned = cleanCell(location);
  // An authored cell may join two references with prose ("§3.6 and §1.4"). Each reference
  // is still a section the unit lives in, so they are read out instead of the cell prose.
  const references = [...cleaned.matchAll(/§\s*\d+(?:\.\d+)*/g)].map((match) => match[0].replace(/\s+/g, ''));
  if (references.length > 1) return references;
  return cleaned
    .split(/[,;]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Resolve a location to section texts, or report the token that did not resolve. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function resolveLocation(rfcText, location) {
  const sections = [];
  const missing = [];
  const ambiguous = [];
  for (const token of locationTokens(location)) {
    const result = resolveSections(rfcText, [token]);
    if (result.ok) {
      sections.push(...result.resolved.map((entry) => entry.text));
    } else if (result.ambiguous.length > 0) {
      ambiguous.push(...result.ambiguous);
    } else {
      missing.push(DOTTED_NUMBER.test(token.replace(/^§\s*/, '')) ? `§${token.replace(/^§\s*/, '')}` : token);
    }
  }
  if (ambiguous.length > 0) return { ok: false, code: 'AMBIGUOUS_RFC_SECTION', ambiguous };
  if (missing.length > 0) return { ok: false, code: 'MISSING_RFC_SECTION', missing };
  return { ok: true, sections };
}

/** Index ledger rows by the unit their first cell names. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function indexByUnit(rows) {
  const byUnit = new Map();
  for (const row of rows) {
    const unit = cleanCell(row.unit);
    const list = byUnit.get(unit) ?? [];
    list.push(row);
    byUnit.set(unit, list);
  }
  return byUnit;
}

/** Build a map from the existing Distribution ledger rows. */
// [::TICKET::] PX-307, PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-309) --for-spec --no-implementation-order`.
function bootstrapFromLedger(rfcText, view) {
  const viewUnits = collectViewUnits(view);
  const rows = readLedgerRows(rfcText) ?? [];
  const residualRows = rows.filter((row) => cleanCell(row.kind) === 'declared-residual');
  const distributedRows = rows.filter((row) => cleanCell(row.kind) !== 'declared-residual');
  const rowsByUnit = indexByUnit(distributedRows);
  const residualByUnit = indexByUnit(residualRows);

  const units = [];
  const missing = [];
  const duplicate = [];

  for (const [unitId, record] of viewUnits) {
    const matching = rowsByUnit.get(unitId) ?? [];
    if (matching.length === 0) {
      // A residual row accounts for the unit instead of distributing it.
      if (!residualByUnit.has(unitId)) missing.push(unitId);
      continue;
    }
    if (matching.length > 1) {
      duplicate.push(unitId);
      continue;
    }
    if (residualByUnit.has(unitId)) return refuse('RESIDUAL_IS_A_MAP_UNIT', { units: [unitId] });
    const row = matching[0];
    const kind = cleanCell(row.kind);
    const owners = ownerPackages(row.owner);
    const ground = groundCell(row.ground);
    if (kind !== record.kind) return refuse('KIND_MISMATCH', { units: [unitId] });
    if (!owners.includes(view.packageId)) return refuse('OWNER_MISMATCH', { units: [unitId] });
    if (ground.length === 0) return refuse('EMPTY_GROUND', { units: [unitId] });

    const location = resolveLocation(rfcText, row.location);
    if (!location.ok) return refuse(location.code, { missing: location.missing, ambiguous: location.ambiguous });

    const unit = {
      unitId,
      kind: record.kind,
      owners,
      sections: location.sections,
      ground,
    };
    if (record.kind === 'operation') {
      unit.role = record.record?.roleCandidate === 'implementer' ? 'implementer' : 'consumer';
      unit.implementationSections = unit.role === 'implementer' ? [...location.sections] : [];
    }
    units.push(unit);
  }

  if (duplicate.length > 0) return refuse('DUPLICATE_LEDGER_ROW', { units: duplicate });
  if (missing.length > 0) return refuse('DISTRIBUTION_MAPPING_MISSING', { missing });

  const residuals = [];
  for (const row of residualRows) {
    const unit = cleanCell(row.unit);
    const ground = groundCell(row.ground);
    if (unit.length === 0) return refuse('EMPTY_RESIDUAL_UNIT', { units: ['residual'] });
    if (ground.length === 0) return refuse('EMPTY_GROUND', { units: [unit] });
    residuals.push({
      unit,
      kind: 'declared-residual',
      owners: ownerPackages(row.owner),
      location: cleanCell(row.location),
      ground,
    });
  }

  const known = new Set(units.map((unit) => unit.unitId));
  const invented = distributedRows
    .map((row) => cleanCell(row.unit))
    .filter((unitId) => isUnitId(unitId) && !known.has(unitId));
  if (invented.length > 0) return refuse('INVENTED_UNIT', { invented });

  units.sort((left, right) => left.unitId.localeCompare(right.unitId));
  residuals.sort((left, right) => left.unit.localeCompare(right.unit));
  const map = {
    schemaVersion: DISTRIBUTION_MAP_SCHEMA_VERSION,
    packageId: view.packageId,
    sourceViewDigest: viewDigest(view),
    units,
    residuals,
  };
  return { ok: true, map: { ...map, digest: mapDigest(map) } };
}

/** The ledger appendix, rendered from the map. */
// [::TICKET::] PX-307, PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-309) --for-spec --no-implementation-order`.
function renderLedgerAppendix(map) {
  const escape = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const rows = [
    ...map.units.map((unit) => ledgerRowOf(unit, map.packageId)),
    ...map.residuals.map((residual) => residualRowOf(residual, map.packageId)),
  ].sort((left, right) => left.unit.localeCompare(right.unit));
  return [
    `## ${LEDGER_TITLE}`,
    '',
    PRECEDENCE_SENTENCE,
    '',
    `Distributed units: ${map.units.length}. Declared residuals: ${map.residuals.length}.`,
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${escape(row.unit)} | ${escape(row.kind)} | ${escape(row.owner)} | ${escape(row.location)} | ${escape(row.ground)} |`),
    '',
    renderDistributionMap(map),
    '',
  ];
}

/** Remove the managed anchors; anchors for units outside the view are untouched. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function removeManagedAnchors(lines, managedUnitIds) {
  return lines.filter((line) => {
    const match = ANCHOR_LINE.exec(line);
    return match === null || !managedUnitIds.has(match[1]);
  });
}

/** Insert one anchor at the end of each section a unit names. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function insertManagedAnchors(lines, map) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match !== null) headings.push({ index, level: match[1].length, text: match[2].trim() });
  });

  const byPosition = new Map();
  for (const unit of map.units) {
    for (const section of unit.sections) {
      const index = headings.findIndex((heading) => normalizeHeading(heading.text) === normalizeHeading(section));
      if (index === -1) continue;
      const heading = headings[index];
      const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
      const at = next === undefined ? lines.length : next.index;
      if (!byPosition.has(at)) byPosition.set(at, new Set());
      byPosition.get(at).add(unit.unitId);
    }
  }

  const result = [...lines];
  for (const at of [...byPosition.keys()].sort((left, right) => right - left)) {
    const anchors = [...byPosition.get(at)].sort().map((unitId) => `<!-- unit: ${unitId} -->`);
    const needsBlankLine = at > 0 && result[at - 1].trim() !== '';
    result.splice(at, 0, ...(needsBlankLine ? [''] : []), ...anchors);
  }
  return result;
}

/** Validate the existing map against the view and the RFC headings. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function validateExistingMap(rfcText, map, view) {
  const againstView = validateMapAgainstView(map, view);
  if (!againstView.ok) return againstView;
  for (const unit of map.units) {
    const resolution = resolveSections(rfcText, unit.sections);
    if (!resolution.ok) return resolution;
  }
  return { ok: true };
}

/**
 * Render the ledger, the map block and the managed anchors from the view.
 *
 * Pure: the caller decides where to write. `wrote` is false when the view has no units,
 * which is the additivity case for a package that predates the view.
 *
 * @param {string} rfcText
 * @param {object} view
 * @returns {{ ok: boolean, code?: string, rfc: string, map: object|null, wrote: boolean }}
 */
// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
export function renderDistribution(rfcText, view) {
  const viewUnits = collectViewUnits(view);
  if (viewUnits.size === 0) return { ok: true, rfc: rfcText, map: null, wrote: false };

  const parsed = parseDistributionMap(rfcText);
  let map;
  if (parsed.ok) {
    const valid = validateExistingMap(rfcText, parsed.map, view);
    if (!valid.ok) return refuse(valid.code, { missing: valid.missing, invented: valid.invented, ambiguous: valid.ambiguous });
    map = parsed.map;
  } else if (parsed.code === 'DISTRIBUTION_MAPPING_MISSING') {
    const bootstrapped = bootstrapFromLedger(rfcText, view);
    if (!bootstrapped.ok) return refuse(bootstrapped.code, {
      missing: bootstrapped.missing,
      invented: bootstrapped.invented,
      units: bootstrapped.units,
      ambiguous: bootstrapped.ambiguous,
    });
    map = bootstrapped.map;
  } else {
    return refuse(parsed.code, {});
  }

  // Digest derives from the body, so every change recomputes it.
  const withoutDigest = { ...map };
  delete withoutDigest.digest;
  map = { ...withoutDigest, digest: mapDigest(withoutDigest) };

  const managed = new Set(map.units.map((unit) => unit.unitId));
  const lines = removeManagedAnchors(String(rfcText).split('\n'), managed);
  const range = findLedgerRange(lines);
  const appendix = renderLedgerAppendix(map);
  if (range === null) {
    lines.push('', ...appendix);
  } else {
    lines.splice(range.start, range.end - range.start, ...appendix);
  }

  const withAnchors = insertManagedAnchors(lines, map);
  const rendered = withAnchors.join('\n');
  return { ok: true, code: null, rfc: rendered, map, wrote: rendered !== rfcText };
}

/** Read a CLI flag in either `--name=value` or `--name value` form. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1] ?? null;
}

/** Write the RFC by staging it beside its target and renaming it into place. */
export function writeAtomically(targetPath, contents) {
  const staged = `${targetPath}.partial.${process.pid}`;
  fs.writeFileSync(staged, contents);
  fs.renameSync(staged, targetPath);
}

/** The fence the renderer writes its map block behind. */
const DISTRIBUTION_MAP_FENCE = /^```json\s+distribution-map\s*$/m;

/**
 * Whether the RFC on disk already carries a rendered distribution map.
 *
 * Read before the renderer writes: a package that predates the counter has a map and
 * no number, and the display treats that map as generation one. The writer must start
 * from the same number the reader reports, or the first execution after the upgrade
 * records one and the display never moves.
 *
 * @param {string} rfcPath
 * @returns {boolean}
 */
function carriesDistributionMap(rfcPath) {
  try {
    return DISTRIBUTION_MAP_FENCE.test(fs.readFileSync(rfcPath, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Open one distribution generation for a grill execution of the renderer.
 *
 * The count answers "how many times did this renderer distribute", so every write-mode
 * run counts, even when the map is unchanged — the execution happened, and requiring a
 * flag made the count depend on a procedure step nobody can verify afterwards. A
 * `--check` pass records nothing because it is a reading. The status is left untouched when it
 * is absent or unreadable, because the map itself has already been written and a display
 * counter must not turn that into a failure.
 *
 * Call this before writing the rendered RFC: the pre-render file is what says whether
 * the package already carried a map, and therefore which generation this execution opens.
 *
 * @param {string} rfcPath — the RFC the renderer is about to write
 * @param {{digest?: string}|null} map — the map the renderer produced
 * @returns {boolean} whether a new generation was recorded
 */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function recordDistributionGeneration(rfcPath, map) {
  if (map === null || map === undefined) return false;
  const statusPath = path.join(path.dirname(rfcPath), STATUS_FILE_NAME);
  if (!fs.existsSync(statusPath)) return false;
  let status;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    return false;
  }
  const recorded = Number.isInteger(status.distributionGeneration) && status.distributionGeneration >= 0
    ? status.distributionGeneration
    : carriesDistributionMap(rfcPath)
      ? FIRST_GENERATION
      : FIRST_GENERATION - 1;
  status.distributionGeneration = recorded + FIRST_GENERATION;
  if (typeof map.digest === 'string') status.distributionDigest = map.digest;
  writeAtomically(statusPath, `${JSON.stringify(status, null, 2)}\n`);
  return true;
}

/**
 * The command entry point.
 *
 * Exit codes follow the pipeline: 0 pass, 1 gate failure, 2 usage or missing RFC. The
 * script writes nothing when the view is absent (additivity) and nothing on any failure.
 *
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
  const rfcPath = path.resolve(argumentFor(argv, 'rfc') ?? 'RFC.md');
  const viewPath = path.resolve(argumentFor(argv, 'view') ?? 'SEQUENCES.json');
  const check = argv.includes('--check');

  if (!fs.existsSync(rfcPath)) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: 'MISSING_RFC', rfc: rfcPath })}\n`);
    return 2;
  }
  if (!fs.existsSync(viewPath)) {
    process.stdout.write(`${JSON.stringify({ ok: true, code: null, wrote: false, reason: 'no view' })}\n`);
    return 0;
  }

  const rfcText = fs.readFileSync(rfcPath, 'utf8');
  const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
  const result = renderDistribution(rfcText, view);
  if (!result.ok) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: result.code, missing: result.missing, invented: result.invented, units: result.units })}\n`);
    return 1;
  }
  if (check) {
    process.stdout.write(`${JSON.stringify({ ok: true, code: null, wrote: false, units: result.map?.units?.length ?? 0 })}\n`);
    return 0;
  }
  // Recorded before the write: the pre-render file is what says whether the package
  // already carried a map, and therefore which generation this execution opens.
  recordDistributionGeneration(rfcPath, result.map);
  if (result.wrote) writeAtomically(rfcPath, result.rfc);
  process.stdout.write(`${JSON.stringify({ ok: true, code: null, wrote: result.wrote, units: result.map?.units?.length ?? 0 })}\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
