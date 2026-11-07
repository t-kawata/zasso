// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
/**
 * Draft the Formula ledger from the specification the package owns.
 *
 * The grill has to transcribe every owned formula with its theory, its realization class,
 * its implementation site, its design and its tests. The structural fields are mechanical
 * (the extractor already knows the id, the body and the exact specification lines), and
 * the remaining fields are joins the pipeline already carries: the graph node built from
 * the RFC section, the Dirs-Tree file mapped to that node, and the RFC's own verification
 * reference. The authoring path fills those joins; it refuses the row when a join is not
 * determined rather than inventing a symbol, a theory or a test.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { extractFormulas, uniqueFormulas } from './extract.mjs';
import { parseSeedIdentity } from './identity.mjs';
import { computeRfcDigest } from './ledger.mjs';
import { ownedFormulasForPackage } from './ownership.mjs';
import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';
import distributionIndex from '../rfc-graph/lib/distribution-index.js';

const { collectNodeFilePaths } = distributionIndex;

/** The four realization classes the ledger accepts. */
const FORMULA_CLASSES = Object.freeze(['computational', 'structural', 'constraint', 'notation']);

const HEADING = /^(#{1,6})\s+(.*)$/;
const DEFINITION = /^\s*[-*]?\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:=|:)\s*(.+)$/;
const DEFINITION_SENTENCE = /^\s*([A-Za-z][A-Za-z0-9_]*)\s+(?:is|means|denotes)\s+(.+)$/i;
const NORMATIVE = /\b(?:MUST|SHALL|must|shall)\b|only if|requires|may not/;
const VERIFICATION = /Verification:\s*`([^`]+)`/;

/** One finding with a stable code and the field it names. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function createAuthoringFinding(code, message, extra = {}) {
  return { code, message, severity: 'blocking', ...extra };
}

/** The heading text without markdown, numbering or a section mark. */
export function normalizeHeading(value) {
  return String(value ?? '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[\s\d.§]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** A planned symbol name derived from a graph node title. */
export function deriveSymbolName(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'realization';
}

/** Every heading in a Markdown document, with the line range it governs. */
export function buildHeadingIndex(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = HEADING.exec(lines[index]);
    if (match === null) continue;
    headings.push({ level: match[1].length, title: match[2].trim(), lineStart: index + 1, lineEnd: lines.length });
  }
  for (let index = 0; index < headings.length; index += 1) {
    const next = headings.slice(index + 1).find((heading) => heading.level <= headings[index].level);
    headings[index].lineEnd = next === undefined ? lines.length : next.lineStart - 1;
  }
  return headings;
}

/** The nearest heading at or above a line. */
export function findHeadingAt(headings, lineNumber) {
  return [...headings].reverse().find((heading) => heading.lineStart <= lineNumber) ?? null;
}

/** The text a heading governs. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function readSectionText(markdown, heading) {
  if (heading === null) return '';
  return String(markdown ?? '').split('\n').slice(heading.lineStart - 1, heading.lineEnd).join('\n');
}

/** The formulas this package owns, filtered by the seed's source segments. */
export function collectOwnedFormulas({ seedText, specText, treeManifest }) {
  return ownedFormulasForPackage({ seedText, specText, treeManifest });
}

/** The one graph node whose section realizes a formula, or a finding. */
export function matchFormulaSection({ formula, specHeadings, graphNodes }) {
  const specHeading = findHeadingAt(specHeadings, formula.lineStart);
  if (specHeading === null) {
    return { findings: [createAuthoringFinding('SECTION_UNRESOLVED', 'the formula is not under a specification heading', { formulaId: formula.id })] };
  }
  const wanted = normalizeHeading(specHeading.title);
  if (wanted.length === 0) {
    return { findings: [createAuthoringFinding('SECTION_UNRESOLVED', 'the specification heading is empty', { formulaId: formula.id })] };
  }
  const carriers = (graphNodes ?? []).filter((node) => {
    const references = (node.headingRefs ?? []).flatMap((reference) => reference.texts ?? []).map(normalizeHeading);
    return references.includes(wanted) || normalizeHeading(node.title).includes(wanted);
  });
  if (carriers.length === 0) {
    return { findings: [createAuthoringFinding('SECTION_UNRESOLVED', `no graph node matches specification heading ${specHeading.title}`, { formulaId: formula.id })] };
  }
  if (carriers.length > 1) {
    return { findings: [createAuthoringFinding('SECTION_AMBIGUOUS', `specification heading ${specHeading.title} matches ${carriers.map((node) => node.id).join(', ')}`, { formulaId: formula.id })] };
  }
  return { node: carriers[0], section: specHeading.title, findings: [] };
}

/** Symbol definitions and normative lines from the specification section. */
export function deriveTheory({ specText, specHeadings, formula }) {
  const heading = findHeadingAt(specHeadings, formula.lineStart);
  const text = readSectionText(specText, heading);
  const symbols = [];
  const normative = [];
  for (const line of text.split('\n')) {
    if (/^\s*Verification:/i.test(line)) continue;
    const definition = DEFINITION.exec(line);
    const sentence = DEFINITION_SENTENCE.exec(line);
    if (definition !== null) symbols.push({ symbol: definition[1], definition: definition[2].trim() });
    else if (sentence !== null) symbols.push({ symbol: sentence[1], definition: sentence[2].trim() });
    if (NORMATIVE.test(line)) normative.push(line.trim());
  }
  const clean = (value) => String(value).replace(/;/g, ',');
  const unique = [...new Map(symbols.map((entry) => [entry.symbol, { symbol: entry.symbol, definition: clean(entry.definition) }])).values()];
  const cleanNormative = normative.map(clean);
  if (unique.length === 0 || cleanNormative.length === 0) {
    return {
      findings: [createAuthoringFinding('THEORY_UNRESOLVED', 'the specification section does not state both a symbol definition and a normative line', { formulaId: formula.id })],
    };
  }
  return { theory: { symbols: unique, normative: cleanNormative }, findings: [] };
}

/** The implementation site the Dirs-Tree maps to the graph node. */
export function deriveImplementation({ node, dirsTree, formula }) {
  const nodeToFilePaths = collectNodeFilePaths(dirsTree?.trees ?? {});
  const filePaths = [...new Set(nodeToFilePaths.get(node.id) ?? [])].sort();
  if (filePaths.length === 0) {
    return {
      findings: [createAuthoringFinding('IMPLEMENTATION_UNRESOLVED', `the Dirs-Tree maps no file to ${node.id}`, { formulaId: formula.id })],
    };
  }
  const symbols = filePaths.map((filePath) => `${filePath}#${deriveSymbolName(node.title)}`);
  return {
    implementation: {
      class: classifyFormula(formula.body),
      location: symbols[0],
      symbols,
      design: `${node.title} is realized in ${filePaths.join(', ')}`,
      verification: '',
      rfcSection: (node.headingRefs ?? [])[0]?.texts?.[0] ?? node.title,
    },
    findings: [],
  };
}

/** The verification reference the graph node or the RFC section names. */
export function deriveTests({ node, rfcSectionText, formula }) {
  const declared = node.tests ?? node.testObligations ?? [];
  const fromNode = (Array.isArray(declared) ? declared : [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter((entry) => typeof entry === 'string' && entry.length > 0);
  if (fromNode.length > 0) return { tests: fromNode, findings: [] };

  const match = VERIFICATION.exec(String(rfcSectionText ?? ''));
  if (match !== null) return { tests: [match[1]], findings: [] };

  return {
    findings: [createAuthoringFinding('TESTS_UNRESOLVED', 'neither the graph node nor the RFC section names a verification test', { formulaId: formula.id })],
  };
}

/** The realization class a formula body suggests. */
export function classifyFormula(body) {
  const text = String(body ?? '');
  if (/\\(?:sum|prod|max|min|int|frac|cdot|times)\b|[+\-*/=]/.test(text)) return 'computational';
  if (/\\(?:le|ge|lt|gt|neq|iff|land|lor)\b/.test(text)) return 'constraint';
  if (/:|\\in\b|\\subseteq?\b/.test(text)) return 'structural';
  return 'notation';
}

/** The RFC heading a graph node's section names. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function resolveRfcLocation(node, rfcHeadings, formula) {
  const wanted = normalizeHeading((node.headingRefs ?? [])[0]?.texts?.[0] ?? node.title);
  const heading = rfcHeadings.find((entry) => normalizeHeading(entry.title) === wanted);
  if (heading === undefined) {
    return { findings: [createAuthoringFinding('RFC_SECTION_UNRESOLVED', `the RFC carries no section for ${node.id}`, { formulaId: formula.id })] };
  }
  return { rfcLocation: { section: heading.title, lineStart: heading.lineStart, lineEnd: heading.lineEnd }, findings: [] };
}

/** One table row, escaped for the Markdown parser. */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-377) --for-spec --no-implementation-order`.
function escapeLedgerCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Render the appendix the ledger parser reads. */
export function renderLedgerAppendix({ specDigest, rfcDigest, rows }) {
  const header = '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |';
  const rule = '|---|---|---|---|---|---|---|---|';
  const lines = [
    '## Formula ledger',
    '',
    `- specDigest: \`${specDigest}\``,
    `- rfcDigest: \`${rfcDigest}\``,
    '',
    header,
    rule,
  ];
  for (const row of rows) {
    const theory = `symbols: ${row.theory.symbols.map((entry) => `${entry.symbol} = ${entry.definition}`).join('; ')}; normative: ${row.theory.normative.join('; ')}`;
    lines.push(`| ${[
      `\`${row.id}\` ( ${escapeLedgerCell(row.body)} )`,
      `${row.specLocation.path}:L${row.specLocation.lineStart}-L${row.specLocation.lineEnd}`,
      `§${row.rfcLocation.section}:L${row.rfcLocation.lineStart}-L${row.rfcLocation.lineEnd}`,
      theory,
      row.implementation.class,
      row.implementation.symbols.join(', '),
      row.implementation.design,
      row.tests.join('; '),
    ].map(escapeLedgerCell).join(' | ')} |`);
  }
  return lines.join('\n');
}

/** The sidecar that mirrors the appendix. */
export function buildSidecar({ specPath, rfcPath, specDigest, rfcDigest, rows }) {
  return {
    version: 1,
    specDigest,
    rfcDigest,
    specPath,
    rfcPath,
    formulas: rows.map((row) => ({
      id: row.id,
      digest: row.digest,
      body: row.body,
      display: row.display,
      normalized: row.normalized,
      specLocation: row.specLocation,
      rfcLocation: row.rfcLocation,
      theory: row.theory,
      implementation: row.implementation,
      tests: row.tests,
    })),
  };
}

/**
 * Author the ledger for one package.
 *
 * @returns {{ok: boolean, rows: Array<object>, findings: Array<object>, ledgerText?: string,
 *   sidecar?: object, written?: boolean, collectOwnedFormulas?: number}}
 */
// [::TICKET::] PX-377 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-377 --for-spec --no-implementation-order`.
export function authorLedger({ rfcDir, graphPath, dirsTreePath, workspaceRoot, write = false }) {
  const resolvedRfcDir = resolve(rfcDir);
  const resolvedWorkspace = resolve(workspaceRoot ?? dirname(resolvedRfcDir));
  const seedPath = join(resolvedRfcDir, 'RFC-SEED.md');
  const rfcPath = join(resolvedRfcDir, 'RFC.md');
  const treeManifestPath = join(resolvedWorkspace, 'WORKSPACIFY-TREE-MANIFEST.json');
  const findings = [];
  for (const [label, filePath] of [
    ['RFC-SEED.md', seedPath],
    ['RFC.md', rfcPath],
    ['WORKSPACIFY-TREE-MANIFEST.json', treeManifestPath],
    ['RFC-GRAPH.json', graphPath],
    ['RFC-Dirs-Tree.json', dirsTreePath],
  ]) {
    if (!existsSync(filePath)) findings.push(createAuthoringFinding('INPUT_UNREADABLE', `${label} is not readable: ${filePath}`));
  }
  if (findings.length > 0) return { ok: false, rows: [], findings };

  const seedText = readFileSync(seedPath, 'utf8');
  const rfcText = readFileSync(rfcPath, 'utf8');
  const treeManifest = JSON.parse(readFileSync(treeManifestPath, 'utf8'));
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const dirsTree = JSON.parse(readFileSync(dirsTreePath, 'utf8'));
  const specPath = parseSeedIdentity(seedText).sourceSpec.path;
  const specBytes = readFileSync(resolve(resolvedWorkspace, specPath));
  const specText = specBytes.toString('utf8');
  const specDigest = sha256Hex(specBytes);
  const rfcDigest = computeRfcDigest(rfcText);

  const owned = collectOwnedFormulas({ seedText, specText, treeManifest });
  for (const segmentId of owned.unresolvedSegments) {
    findings.push(createAuthoringFinding('SEGMENT_UNRESOLVED', `the seed claims source segment ${segmentId} and the tree manifest does not define it`));
  }
  const specHeadings = buildHeadingIndex(specText);
  const rfcHeadings = buildHeadingIndex(rfcText);
  const rows = [];
  for (const formula of owned.owned) {
    const matched = matchFormulaSection({ formula, specHeadings, graphNodes: graph.nodes ?? [] });
    const theory = deriveTheory({ specText, specHeadings, formula });
    const implementation = matched.node === undefined ? { findings: [] } : deriveImplementation({ node: matched.node, dirsTree, formula });
    const location = matched.node === undefined ? { findings: [] } : resolveRfcLocation(matched.node, rfcHeadings, formula);
    const rfcSectionText = location.rfcLocation === undefined
      ? ''
      : readSectionText(rfcText, findHeadingAt(rfcHeadings, location.rfcLocation.lineStart));
    const tests = matched.node === undefined ? { findings: [] } : deriveTests({ node: matched.node, rfcSectionText, formula });
    const rowFindings = [...matched.findings, ...theory.findings, ...implementation.findings, ...location.findings, ...tests.findings];
    if (rowFindings.length > 0) {
      findings.push(...rowFindings);
      continue;
    }
    rows.push({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      display: formula.display,
      normalized: formula.normalized,
      specLocation: { path: specPath, lineStart: formula.lineStart, lineEnd: formula.lineEnd },
      rfcLocation: location.rfcLocation,
      theory: theory.theory,
      implementation: implementation.implementation,
      tests: tests.tests,
    });
  }

  if (findings.length > 0) return { ok: false, rows: [], findings };
  if (/\n#{1,6}\s+Formula ledger\s*$/m.test(rfcText)) {
    return { ok: false, rows: [], findings: [createAuthoringFinding('DUPLICATE_LEDGER_HEADING', 'the RFC already carries a Formula ledger')] };
  }

  const ledgerText = renderLedgerAppendix({ specDigest, rfcDigest, rows });
  const sidecar = buildSidecar({ specPath, rfcPath: 'RFC.md', specDigest, rfcDigest, rows });
  if (!write) return { ok: true, rows, findings: [], ledgerText, sidecar, written: false, collectOwnedFormulas: owned.owned.length };

  writeFileSync(rfcPath, `${rfcText.trimEnd()}\n\n${ledgerText}\n`, 'utf8');
  writeFileSync(join(resolvedRfcDir, 'RFC-FORMULAS.json'), `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  return { ok: true, rows, findings: [], ledgerText, sidecar, written: true, collectOwnedFormulas: owned.owned.length };
}
