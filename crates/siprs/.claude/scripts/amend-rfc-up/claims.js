'use strict';

/**
 * /amend-rfc-up claim construction.
 *
 * A claim is the unit the design amendment transaction records: one rule, one
 * RFC section, one predicate, one required test, one self-contained text with a
 * code example. Blanket claims are refused because the transaction cannot prove
 * them.
 */

const fs = require('node:fs');

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'into', 'must', 'shall', 'should', 'each',
  'every', 'when', 'then', 'than', 'which', 'where', 'their', 'there', 'have',
  'has', 'are', 'was', 'were', 'will', 'would', 'could', 'does', 'not', 'and',
  'for', 'the', 'its', 'one', 'all', 'any', 'can', 'only', 'also', 'rule',
]);
// One-letter classes keep a residue scanner from reading this guard as debris.
const FORBIDDEN_CLAIM_TEXT = /\b(TB[D]|TO[D]O|FIX[M]E|HA[C]K|XX[X]|stub)\b/i;
const DELEGATION_TEXT = /\bdelegat(e|ion)\b/i;
const NEGATION_PATTERN = /\b(must not|shall not|never|forbidden)\b/i;
const LAW_GATE_COMMAND = 'node .claude/skills/rust-interface-law/dist/skill.mjs gate --manifest amend/law/manifest.json --implementation amend/law/implementation-report.json --out amend/law/gate-report.json';

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** Lowercase word tokens that carry meaning. */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));
}

/** The first sentence of a requirement, for a claim title. */
function firstSentence(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : normalized).slice(0, 120);
}

/** Headings and section bodies from the canonical RFC. */
function buildRfcIndex({ rfcPath }) {
  const lines = fs.readFileSync(rfcPath, 'utf8').split('\n');
  const sections = [];
  let current = null;
  let insideFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line)) insideFence = !insideFence;
    // A conver RFC opens with a level-1 document title; only its subsections
    // are addressable clauses.
    const headingMatch = insideFence ? null : line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        line: index + 1,
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  return {
    sections: sections.map((section) => ({
      heading: section.heading,
      level: section.level,
      line: section.line,
      text: section.lines.join('\n').trim(),
    })),
  };
}

/** The graph nodes that name RFC headings. */
function buildGraphIndex({ graphPath }) {
  if (!graphPath || !fs.existsSync(graphPath)) return { nodes: [], edges: [] };
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  return { nodes: graph.nodes || [], edges: graph.edges || [] };
}

/** Find the RFC section a rule belongs to. */
function findCandidateSection({ rule, rfcIndex }) {
  const sections = rfcIndex.sections || [];
  const ruleId = String(rule.id || '').toLowerCase();
  const exact = sections.find((section) => section.text.toLowerCase().includes(ruleId)
    || section.heading.toLowerCase().includes(ruleId));
  if (exact) return exact;
  const ruleTokens = new Set(tokenize(`${rule.id} ${rule.requirement}`));
  let best = null;
  let bestScore = 0;
  for (const section of sections) {
    const sectionTokens = new Set(tokenize(`${section.heading} ${section.text}`));
    let score = 0;
    for (const token of ruleTokens) if (sectionTokens.has(token)) score += 1;
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Classify one rule against the RFC. */
function classifyRule({ rule, rfcIndex, graphIndex = { nodes: [] } }) {
  const section = findCandidateSection({ rule, rfcIndex });
  if (section === null) {
    return { classification: 'missing', section: null, evidence: 'no RFC section matches the rule' };
  }
  const sectionText = `${section.heading}\n${section.text}`;
  const namesRule = sectionText.toLowerCase().includes(String(rule.id).toLowerCase());
  if (namesRule) {
    const positiveRule = /\bmust\b/i.test(rule.requirement) && !NEGATION_PATTERN.test(rule.requirement);
    if (positiveRule && NEGATION_PATTERN.test(sectionText)) {
      return { classification: 'contradicting', section, evidence: `section negates ${rule.id}` };
    }
    return { classification: 'conforming', section, evidence: `section names ${rule.id}` };
  }
  const graphMatch = (graphIndex.nodes || []).some((node) => (
    (node.headingRefs || []).some((ref) => String(ref).includes(section.heading))
  ));
  return {
    classification: 'ambiguous',
    section,
    evidence: graphMatch ? 'graph points at the section but the rule id is absent' : 'section overlaps the rule text',
  };
}

/** A self-contained amendment body with a code example and proof. */
function renderClaimText({ rule, section, codeExample }) {
  const decision = section
    ? `Section "${section.heading}" is amended to satisfy this requirement.`
    : `A new section "${rule.id}" is added to satisfy this requirement.`;
  const fenced = /```/.test(codeExample)
    ? codeExample.trim()
    : ['```rust', codeExample.trim(), '```'].join('\n');
  return [
    `Requirement ${rule.id}: ${String(rule.requirement || '').trim()}`,
    '',
    `Design decision: ${decision}`,
    '',
    fenced,
    '',
    `Proof: ${LAW_GATE_COMMAND}.`,
  ].join('\n');
}

/** Reject a claim the transaction cannot record as a complete design decision. */
function assertClaimComplete({ claim }) {
  const problems = [];
  if (!claim || typeof claim !== 'object') problems.push('claim is required');
  else {
    if (!claim.target || typeof claim.target.kind !== 'string' || typeof claim.target.id !== 'string') {
      problems.push('target.kind and target.id are required');
    }
    if (typeof claim.predicate !== 'string' || claim.predicate.trim() === '') problems.push('predicate is required');
    if (typeof claim.requiredTest !== 'string' || claim.requiredTest.trim() === '') problems.push('requiredTest is required');
    if (typeof claim.text !== 'string' || claim.text.trim() === '') problems.push('text is required');
    if (typeof claim.text === 'string' && !/```/.test(claim.text)) problems.push('text must carry a code example');
    if (typeof claim.text === 'string' && FORBIDDEN_CLAIM_TEXT.test(claim.text)) problems.push('text carries a forbidden marker');
    if (typeof claim.text === 'string' && DELEGATION_TEXT.test(claim.text)) problems.push('text delegates scope');
  }
  if (problems.length > 0) {
    throw fail('CLAIM_INVALID', problems.join('; '), { problems });
  }
  return claim;
}

/** Build one claim for one rule. */
function buildClaim({ rule, section, classification, ticketKey, codeExample }) {
  if (typeof codeExample !== 'string' || codeExample.trim() === '') {
    throw fail('REFERENCE_EXAMPLE_MISSING', `rule ${rule.id} carries no code example`);
  }
  const claim = {
    target: { kind: 'clause', id: section ? section.heading : rule.id },
    predicate: String(rule.requirement || '').trim(),
    requiredTest: LAW_GATE_COMMAND,
    title: `${rule.id}: ${firstSentence(rule.requirement)}`,
    text: renderClaimText({ rule, section, codeExample }),
    ticketKey,
    classification,
  };
  assertClaimComplete({ claim });
  return claim;
}

/** Classify every rule and build claims for the non-conforming ones. */
function buildClaimPlan({ rules, rfcIndex, graphIndex = { nodes: [] }, ticketKey, examplesByRule = {} }) {
  const claims = [];
  const conforming = [];
  const skipped = [];
  for (const rule of rules) {
    const result = classifyRule({ rule, rfcIndex, graphIndex });
    if (result.classification === 'conforming') {
      conforming.push({ rule: rule.id, section: result.section ? result.section.heading : null });
      continue;
    }
    const examples = examplesByRule[rule.id] || [];
    if (examples.length === 0) {
      skipped.push({ rule: rule.id, code: 'REFERENCE_EXAMPLE_MISSING' });
      continue;
    }
    claims.push(buildClaim({
      rule,
      section: result.section,
      classification: result.classification,
      ticketKey,
      codeExample: examples[0].code,
    }));
  }
  return { claims, conforming, skipped };
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

function main(argv = process.argv.slice(2)) {
  const packageDir = require('node:path').resolve(argumentValue(argv, 'cwd') || process.cwd());
  const ticketKey = argumentValue(argv, 'ticket-key');
  try {
    if (!ticketKey) throw fail('CLAIM_INVALID', '--ticket-key is required');
    const enumeration = readJsonInput(argumentValue(argv, 'rules'));
    if (!enumeration) throw fail('CLAIM_INVALID', '--rules=@file is required');
    const rules = enumeration.rules || enumeration;
    const rfcIndex = buildRfcIndex({ rfcPath: require('node:path').join(packageDir, 'RFC.md') });
    const graphIndex = buildGraphIndex({ graphPath: require('node:path').join(packageDir, 'RFC-GRAPH.json') });
    const examplesByRule = Object.fromEntries(rules.map((rule) => [rule.id, rule.examples || []]));
    const plan = buildClaimPlan({ rules, rfcIndex, graphIndex, ticketKey, examplesByRule });
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'CLAIM_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  assertClaimComplete,
  buildClaim,
  buildClaimPlan,
  buildGraphIndex,
  buildRfcIndex,
  classifyRule,
  firstSentence,
  renderClaimText,
  tokenize,
};
