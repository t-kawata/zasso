#!/usr/bin/env node
/**
 * graphify-delta-analyzer.js --delta=<path> --graph=<path> --out=<path>
 *
 * /drill-rfc-down Step 2 graphify delta analyzer (PX-160).
 *
 * Reads Step 1 delta.json and the existing *-GRAPH.json, and deterministically
 * proposes the GRAPH evolution candidates:
 *   - newNodes:     delta sections whose heading overlaps no existing node
 *   - modifiedNodes: delta sections that overlap an existing node (extension)
 *   - newEdges:     for a new node, references to existing nodes found in the
 *                   section body (slug/title token match)
 *
 * Generates graph-delta.json (the lockstep handoff for Step 3 boundify) and
 * NEVER writes to *-GRAPH.json — the GRAPH is only written by crud.js after the
 * AI engineering-expert approves the dry-run plan.
 *
 * Exit codes: 0 = success, 1 = failure (missing args, malformed delta/graph).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 2).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { emptyAdvisory } from './advisory-report.js';

const TOKEN_PATTERN = /[a-zA-Z0-9_]{4,}/g;
const DEFAULT_KIND = 'architecture';

// 本家 /graphify-rfc verification constants (analyze-source-structure.js /
// validate-slug.js / boundify-helpers.js) — reused so the advisory matches the
// 本家 thresholds exactly.
const LONG_SECTION_THRESHOLD = 100;
const SLUG_FORMAT_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_SLUG_LENGTH = 25;
const LOW_OVERLAP_THRESHOLD = 1;

/** Tokenize a string into significant (length >= 4) lowercase tokens. */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function tokenize(text) {
  return new Set((String(text).toLowerCase().match(TOKEN_PATTERN) || []));
}

/** Derive a snake_case slug from a node title (schema: ^[a-z][a-z0-9_]*$). */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Highest N<number> present in the node id set (0 when none). */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function maxNodeNumber(nodes) {
  let max = 0;
  for (const node of nodes) {
    const match = String(node.id).match(/N(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}

/** Strip the leading markdown heading markers from a heading line. */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function headingTitle(heading) {
  return heading.replace(/^#{1,6}\s+/, '').trim();
}

/** The markdown heading level (number of leading '#') of a heading line. */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function headingLevel(heading) {
  const match = String(heading || '').match(/^(#{1,6})/);
  return match ? match[1].length : 0;
}

/** The full section text (heading + body) as a single string. */
// [::TICKET::] PX-160, PX-161, PX-162 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162) --for-spec --no-implementation-order`.
function sectionText(section) {
  return (section.lines || []).join('\n');
}

/**
 * Validate the generated candidates structure and return English error messages.
 * Returns an empty array when valid.
 */
// [::TICKET::] PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function validateCandidates(candidates) {
  const errors = [];
  const requireFields = (items, pathPrefix, required) => {
    for (const item of items || []) {
      for (const field of required) {
        if (!item[field] || (Array.isArray(item[field]) && item[field].length === 0)) {
          errors.push(`${pathPrefix} item is missing required field "${field}"`);
        }
      }
    }
  };
  requireFields(candidates.newNodes, 'newNodes', ['id', 'title', 'kind']);
  requireFields(candidates.modifiedNodes, 'modifiedNodes', ['id', 'changes']);
  requireFields(candidates.newEdges, 'newEdges', ['from', 'to', 'type']);
  return errors;
}

/** A danger finding: a new node slug collides with an existing node slug. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagSlugCollisions(newNodes, graph) {
  const existingSlugs = new Set((graph.nodes || []).map((n) => n.slug));
  return (newNodes || [])
    .filter((n) => existingSlugs.has(n.slug))
    .map((n) => ({ message: `new node ${n.id} slug "${n.slug}" collides with an existing node; rename it before approve` }));
}

/** An omission finding: two delta sections share the same heading text + level. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagDuplicateHeadings(sections) {
  const seen = new Map();
  for (const section of sections || []) {
    const key = `${headingLevel(section.heading || '')}#${headingTitle(section.heading || '')}`;
    if (seen.has(key)) {
      seen.get(key).push(section);
    } else {
      seen.set(key, [section]);
    }
  }
  const findings = [];
  for (const [, group] of seen) {
    if (group.length > 1) {
      findings.push({ message: `duplicate heading "${headingTitle(group[0].heading || '')}" appears ${group.length} times in the delta; each must map to a distinct graph node` });
    }
  }
  return findings;
}

/** An omission finding: a modify candidate rests on a very weak token overlap. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagLowOverlap(modifiedNodes) {
  return (modifiedNodes || [])
    .filter((mod) => typeof mod.overlap === 'number' && mod.overlap <= LOW_OVERLAP_THRESHOLD)
    .map((mod) => ({ message: `modify candidate ${mod.id} matches with only ${mod.overlap} shared token(s); verify this is a true merge, not a forced new node` }));
}

/** A contradiction finding: surface the Step 1 contradiction candidates. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function surfaceContradictionCandidates(delta) {
  return (delta.contradictionCandidates || []).map((candidate) => ({
    message: `contradiction candidate: ${candidate.kind} ${candidate.target} "${candidate.context || ''}" matched by ${(candidate.matchedBy || []).join(', ')}`,
  }));
}

/** A deficiency finding: a delta section exceeds the 本家 100-line threshold. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagOversizedSections(sections) {
  return (sections || [])
    .filter((section) => (section.lines || []).length > LONG_SECTION_THRESHOLD)
    .map((section) => ({ message: `section "${headingTitle(section.heading || '')}" has ${(section.lines || []).length} lines (max ${LONG_SECTION_THRESHOLD}); split it into smaller sections` }));
}

/** A deficiency finding: a new node slug is invalid or exceeds the max length. */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function flagInvalidSlugs(newNodes) {
  return (newNodes || [])
    .filter((n) => !SLUG_FORMAT_PATTERN.test(n.slug) || n.slug.length > MAX_SLUG_LENGTH)
    .map((n) => ({ message: `new node ${n.id} slug "${n.slug}" is invalid (must match ${SLUG_FORMAT_PATTERN} and be <= ${MAX_SLUG_LENGTH} chars)` }));
}

/**
 * Mechanically inspect the candidates on the four axes (danger / omission /
 * contradiction / deficiency) as an advisory for the AI. Advisory-only: the
 * findings never block promote.
 */
// [::TICKET::] PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function inspectCandidates(delta, candidates, graph) {
  const advisory = emptyAdvisory();
  advisory.danger = flagSlugCollisions(candidates.newNodes, graph);
  advisory.omission = [
    ...flagDuplicateHeadings(delta.sections),
    ...flagLowOverlap(candidates.modifiedNodes),
  ];
  advisory.contradiction = surfaceContradictionCandidates(delta);
  advisory.deficiency = [
    ...flagOversizedSections(delta.sections),
    ...flagInvalidSlugs(candidates.newNodes),
  ];
  return advisory;
}

/**
 * Propose the GRAPH evolution candidates deterministically from delta.json.
 * Returns { newNodes, modifiedNodes, newEdges }.
 */
// [::TICKET::] PX-160, PX-161, PX-162, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function proposeCandidates(delta, graph) {
  const nodes = graph.nodes || [];
  const newNodes = [];
  const modifiedNodes = [];
  const newEdges = [];
  const edgeMatches = {};
  let nextNum = maxNodeNumber(nodes) + 1;

  for (const section of delta.sections || []) {
    const headingTokens = tokenize(section.heading || '');
    let bestMatch = null;
    let bestOverlap = 0;
    for (const node of nodes) {
      const nodeTokens = tokenize(`${node.title} ${node.summary || ''} ${node.slug || ''}`);
      const overlap = [...headingTokens].filter((t) => nodeTokens.has(t)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = node;
      }
    }

    if (!bestMatch) {
      // New node candidate: the section heading has no existing-node overlap.
      const id = `N${String(nextNum).padStart(4, '0')}`;
      const title = headingTitle(section.heading || '');
      newNodes.push({
        id,
        title,
        kind: DEFAULT_KIND,
        summary: (section.lines || []).slice(1).join(' ').trim().slice(0, 200),
        slug: slugify(title),
        headingRefs: [{
          refId: `REF${String(nextNum).padStart(3, '0')}`,
          heading: headingLevel(section.heading || ''),
          texts: [title],
        }],
      });
      nextNum += 1;
      // Edge candidates: references from this new section body to existing nodes.
      const bodyText = sectionText(section);
      for (const node of nodes) {
        const nodeTokens = tokenize(`${node.title} ${node.slug}`);
        const refs = [...nodeTokens].filter((t) => bodyText.toLowerCase().includes(t));
        if (refs.length > 0) {
          newEdges.push({
            from: id,
            to: node.id,
            type: 'references',
            attributes: { strength: 'soft', bidirectional: false },
            contracts: [{ id: 'C001', precondition: 'from node exists in the graph', postcondition: 'edge connects to the referenced node', invariant: 'from and to are valid node ids' }],
          });
          edgeMatches[`${id}->${node.id}`] = refs.slice(0, 5);
        }
      }
    } else {
      // Modify candidate: the section extends an existing node. The token
      // overlap is recorded so the advisory can flag weak merges (low overlap).
      modifiedNodes.push({
        id: bestMatch.id,
        overlap: bestOverlap,
        changes: {
          title: headingTitle(section.heading || ''),
          summary: (section.lines || []).slice(1).join(' ').trim().slice(0, 200),
        },
      });
    }
  }

  return { newNodes, modifiedNodes, newEdges, report: { edgeMatches } };
}

// [::TICKET::] PX-160, PX-161, PX-162, PX-163, PX-164, PX-165, PX-166, PX-167, PX-168, PX-169 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-160|PX-161|PX-162|PX-163|PX-164|PX-165|PX-166|PX-167|PX-168|PX-169) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let deltaPath = '';
  let graphPath = '';
  let outPath = '';
  for (const arg of args) {
    if (arg.startsWith('--delta=')) deltaPath = arg.slice('--delta='.length);
    else if (arg.startsWith('--graph=')) graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--out=')) outPath = arg.slice('--out='.length);
  }
  if (!deltaPath || !graphPath || !outPath) {
    console.error('Usage: graphify-delta-analyzer.js --delta=<path> --graph=<path> --out=<path>');
    process.exit(1);
  }

  let delta;
  try {
    delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] graphify-delta-analyzer: invalid delta.json: ${e.message}`);
    process.exit(1);
  }
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] graphify-delta-analyzer: invalid graph: ${e.message}`);
    process.exit(1);
  }

  // The candidates are fully deterministic (no timestamp) so repeated analysis
  // of identical inputs yields byte-identical output.
  const candidates = {
    sourceFile: delta.sourceFile || graph.sourceFile || '',
    ...proposeCandidates(delta, graph),
  };
  // Mechanically inspect the candidates on the four axes (danger / omission /
  // contradiction / deficiency) as an advisory for the AI. Advisory-only.
  candidates.advisory = inspectCandidates(delta, candidates, graph);
  // Guarantee the output is always valid JSON with the expected shape; on
  // failure emit a natural-language English Error/Cause/Action and exit 1.
  const validationErrors = validateCandidates(candidates);
  if (validationErrors.length > 0) {
    console.error('[ERROR] graphify-delta-analyzer: generated candidates failed schema validation');
    console.error('Cause: ' + validationErrors.join('; '));
    console.error('Action: fix the candidate generation so every candidate carries its required fields, then re-run.');
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, ...candidates }) + '\n');
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  tokenize,
  slugify,
  maxNodeNumber,
  headingTitle,
  headingLevel,
  proposeCandidates,
  validateCandidates,
  flagSlugCollisions,
  flagDuplicateHeadings,
  flagLowOverlap,
  surfaceContradictionCandidates,
  flagOversizedSections,
  flagInvalidSlugs,
  inspectCandidates,
  main,
};
