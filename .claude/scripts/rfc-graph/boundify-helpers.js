#!/usr/bin/env node

/**
 * boundify-helpers.js — Internal pure functions for boundify-graph
 *
 * This module implements P17-1 (4 pure functions batch).
 * All functions are designed as pure functions with no external I/O.
 *
 * PX-28 added: getDeclarationStub (declaration stub generation per kind/language)
 * PX-30 added: resolveHeaderPaths, generateHeaderComment (header comment generation)
 *            Added declarationStub/crossReferences fields to SCHEMA
 *
 * @module boundify-helpers
 */

// ============================================================
// Complete JSON Schema for Dirs-Tree.json
// Full port from RFC-BOUNDIFY.md Appendix A
// ============================================================

/** JSON Schema definition for Dirs-Tree.json */
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DirsTree',
  type: 'object',
  required: ['schemaVersion', 'generatedAt', 'sourceGraph', 'analysis', 'trees', 'dependencyDirections', 'warnings'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+$' },
    generatedAt: { type: 'string', format: 'date-time' },
    sourceGraph: { type: 'string' },
    sourceFile: { type: 'string' },
    analysis: {
      type: 'object',
      required: ['nodeCount', 'kindCounts', 'edgeTypeCounts'],
      properties: {
        nodeCount: { type: 'integer', minimum: 1 },
        kindCounts: { type: 'object' },
        edgeTypeCounts: { type: 'object' },
        circularDependencies: { type: 'array' }
      }
    },
    trees: {
      type: 'object',
      properties: {
        rust: { $ref: '#/definitions/DirNode' },
        go: { $ref: '#/definitions/DirNode' },
        typescript: { $ref: '#/definitions/DirNode' }
      },
      required: ['rust', 'go', 'typescript']
    },
    dependencyDirections: {
      type: 'object',
      properties: {
        rust: { type: 'array', items: { $ref: '#/definitions/DependencyDirection' } },
        go: { type: 'array', items: { $ref: '#/definitions/DependencyDirection' } },
        typescript: { type: 'array', items: { $ref: '#/definitions/DependencyDirection' } }
      }
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cycle: { type: 'array', items: { type: 'string' } },
          language: { type: 'string' }
        }
      }
    }
  },
  definitions: {
    DirNode: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['directory', 'file'] },
        kind: { type: 'string' },
        rationale: { type: 'string' },
        language: { type: 'array', items: { type: 'string', enum: ['rust', 'go', 'typescript'] } },
        languageRules: {
          description: 'Valid only for directory nodes. Do not use on file nodes.',
          type: 'object',
          properties: {
            rust: { type: 'string' },
            go: { type: 'string' },
            typescript: { type: 'string' }
          }
        },
        mappedNodeIds: { type: 'array', items: { type: 'object', properties: { nodeId: { type: 'string' }, title: { type: 'string' } }, required: ['nodeId'] } },
        role: { type: 'string' },
        declarationStub: { type: 'string' },
        crossReferences: {
          type: 'array',
          description: 'Valid only for root DirNode. Cross-reference info for prose nodes (rationale/glossary/requirement).',
          items: { $ref: '#/definitions/CrossReference' }
        },
        children: {
          type: 'array',
          items: { $ref: '#/definitions/DirNode' }
        }
      }
    },
    DependencyDirection: {
      type: 'object',
      required: ['from', 'to', 'rule'],
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        rule: { type: 'string' },
        edgeEvidence: { type: 'array', items: { type: 'string' } }
      }
    },
    CrossReference: {
      type: 'object',
      required: ['nodeId', 'kind', 'title'],
      properties: {
        nodeId: { type: 'string' },
        kind: { type: 'string', enum: ['rationale', 'glossary', 'requirement'] },
        title: { type: 'string' },
        headingRef: { type: 'string' },
        connections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['toNodeId', 'toFile', 'edgeType', 'direction'],
            properties: {
              toNodeId: { type: 'string' },
              toFile: { type: 'string' },
              edgeType: { type: 'string' },
              direction: { type: 'string', enum: ['→', '←'] }
            }
          }
        }
      }
    }
  }
};

// ============================================================
// SAFE_BOUNDARIES_EN_TEXT constant
// English safe boundaries description based on RFC-BOUNDIFY.md §3.2
// ============================================================

/** English text describing safe boundaries built with directories and namespaces */
const SAFE_BOUNDARIES_EN_TEXT = [
  'Safe boundaries built with directories and namespaces (Rust/Go/TypeScript)',
  '',
  'This project enforces architectural boundaries through physical directory structure',
  'and namespace conventions. Each language uses its native module system:',
  '- Rust: crate + module tree with pub(crate) visibility',
  '- Go: internal/ package with unexported identifiers',
  '- TypeScript: directory structure with barrel index.ts files',
  '',
  'Cross-boundary dependencies are explicitly declared and validated.',
  'Circular dependencies between directories are detected and reported as warnings.'
].join('\n');

// ============================================================
// Graph → language collection
// Successor of graphToLangJson: reads the language field directly
// from each node (added in PX-24). No inference is performed.
// ============================================================

/**
 * Collects the language field from all graph nodes, returning a map and a unique language list.
 *
 * Reads the language field (single value) directly, added to the schema in PX-24.
 * Does not perform language inference. Nodes without language are ignored.
 * Falls back to graph.mainLanguage when no node has a language set.
 *
 * @param {{ mainLanguage?: string, nodes: object[] }} graph - Input graph
 * @returns {{ languageMap: object, languages: string[] }}
 *   languageMap: nodeId → language (string) mapping
 *   languages: unique array of language values (at least 1 entry)
 */
function collectLanguagesFromGraph(graph) {
  const nodes = (graph.nodes || []);
  const languageMap = {};
  const languageSet = new Set();

  for (const node of nodes) {
    const lang = node.language;
    if (lang && typeof lang === 'string') {
      languageMap[node.id] = lang;
      languageSet.add(lang);
    }
  }

  // Fallback: use mainLanguage only when no node has language set
  if (languageSet.size === 0 && graph.mainLanguage && typeof graph.mainLanguage === "string") {
    languageSet.add(graph.mainLanguage);
  }

  return {
    languageMap,
    languages: Array.from(languageSet),
  };
}

// ============================================================
// Node-edge → directory-edge projection
// Full port from RFC-BOUNDIFY.md §3.6
// ============================================================

/**
 * Set of directional edge types (edges of other types are not projected).
 */
const DIRECTIONAL_EDGE_TYPES = new Set([
  'depends_on',
  'implements',
  'references',
  'extends',
  'constrains'
]);

/**
 * Projects node-level edges to directory-level edges using a node→directory mapping table.
 *
 * @param {{ from: string, to: string, type: string }[]} graphEdges - Graph edge array
 * @param {object} nodeToDirMap - NodeId → directory path mapping
 * @returns {{ from: string, to: string, type: string, evidence: string }[]}
 */
function projectEdgesToDirectories(graphEdges, nodeToDirMap) {
  const dirEdges = [];

  for (const edge of graphEdges) {
    const fromDir = nodeToDirMap[edge.from];
    const toDir = nodeToDirMap[edge.to];

    // Skip nodes without resolved mapping
    if (!fromDir || !toDir) continue;
    // Skip edges within the same directory
    if (fromDir === toDir) continue;
    // Only directional edge types are projected
    if (!DIRECTIONAL_EDGE_TYPES.has(edge.type)) continue;

    dirEdges.push({
      from: fromDir,
      to: toDir,
      type: edge.type,
      evidence: edge.from + '->' + edge.to + ' (' + edge.type + ')'
    });
  }

  return dirEdges;
}

// ============================================================
// Circular dependency detection (Tarjan SCC)
// Full port from RFC-BOUNDIFY.md §3.6
// ============================================================

/**
 * Applies Tarjan's Strongly Connected Components (SCC) algorithm on projected inter-directory digraph.
 * Only SCCs with size > 1 are reported as cycles.
 *
 * @param {{ from: string, to: string }[]} dirEdges - Inter-directory edge array
 * @returns {{ cycle: string[] }[]} Array of detected cycles
 */
function tarjanSCC(dirEdges) {
  // Build adjacency list
  const graph = {};
  for (const e of dirEdges) {
    if (!graph[e.from]) graph[e.from] = [];
    graph[e.from].push(e.to);
    if (!graph[e.to]) graph[e.to] = [];
  }

  const index = {};
  const lowlink = {};
  const onStack = {};
  const stack = [];
  let currentIndex = 0;
  const cycles = [];

  function strongconnect(nodeId) {
    index[nodeId] = currentIndex;
    lowlink[nodeId] = currentIndex;
    currentIndex++;
    stack.push(nodeId);
    onStack[nodeId] = true;

    for (const neighbor of (graph[nodeId] || [])) {
      if (index[neighbor] === undefined) {
        strongconnect(neighbor);
        lowlink[nodeId] = Math.min(lowlink[nodeId], lowlink[neighbor]);
      } else if (onStack[neighbor]) {
        lowlink[nodeId] = Math.min(lowlink[nodeId], index[neighbor]);
      }
    }

    if (lowlink[nodeId] === index[nodeId]) {
      const scc = [];
      let poppedNode;
      do {
        poppedNode = stack.pop();
        onStack[poppedNode] = false;
        scc.push(poppedNode);
      } while (poppedNode !== nodeId);
      // Only SCCs with size > 1 are reported as cycles
      if (scc.length > 1) {
        cycles.push({ cycle: scc });
      }
    }
  }

  for (const nodeId of Object.keys(graph)) {
    if (index[nodeId] === undefined) strongconnect(nodeId);
  }

  return cycles;
}

// ============================================================
// Constants for file name construction
// Used to build file names from slug + extension.
// titleToFileName was removed in PX-25; the node's slug field
// is now used directly as the file name base.
// ============================================================

/**
 * Language-specific extension mapping.
 */
const LANGUAGE_EXTENSIONS = {
  rust: '.rs',
  go: '.go',
  typescript: '.ts'
};

/** The leaf file an architecture node uses when it carries a unit. */
const DESIGNATED_ENTRY_FILE = {
  rust: 'mod.rs',
  go: 'doc.go',
  typescript: 'index.ts',
};

/**
 * Language-specific separators (Rust/Go use underscore, TypeScript uses hyphen).
 * Slug follows lower_snake_case; separators are only used for directory names, etc.
 */
const LANGUAGE_SEPARATORS = {
  rust: '_',
  go: '_',
  typescript: '-'
};

/**
 * Max file name length (slug portion excluding extension).
 * Referenced from validate-slug.js and used as slug validation upper bound.
 */
const MAX_FILE_NAME_LENGTH = 25;

// ============================================================
// Duplicate file name resolution (fallback)
// Uniquification via slug is the principle, but this is kept for
// compatibility with older graphs.
// ============================================================

/**
 * Appends suffixes (_1, _2) to duplicate file names within the same directory.
 *
 * @param {{ name: string }[]} files - File node array
 * @param {string} language - Target language
 * @returns {{ name: string }[]} File node array after deduplication
 */
function deduplicateFileNames(files, language) {
  const ext = LANGUAGE_EXTENSIONS[language] || LANGUAGE_EXTENSIONS.rust;
  const extPattern = /\.(rs|go|ts|js|tsx|jsx|vue|css|scss)$/;
  const names = {};
  const result = [];

  for (const file of files) {
    const baseName = file.name ? file.name.replace(extPattern, '') : file.name;
    if (baseName === undefined || baseName === null) {
      result.push({ name: file.name || '' });
      continue;
    }
    if (names[baseName] !== undefined) {
      names[baseName]++;
      result.push({ name: baseName + '_' + names[baseName] + ext });
    } else {
      names[baseName] = 0;
      result.push({ name: baseName + ext });
    }
  }

  return result;
}

// ============================================================
// Declaration stub table (8 kinds × 3 languages)
// PX-28: Provides kind × language boilerplate for all program files.
// ============================================================

/**
 * Declaration stub (boilerplate) table per file kind and language.
 *
 * Two-level structure: { kind: { language: stubString, ... }, ... }.
 * Returns empty string for unknown kind or language.
 */
const DECLARATION_STUB_TABLE = Object.freeze({
  config: Object.freeze({
    rust: 'pub struct Config {}',
    go: 'type Config struct {}',
    typescript: 'interface Config {}',
  }),
  api_contract: Object.freeze({
    rust: 'pub trait Service {}',
    go: 'type Service interface {}',
    typescript: 'interface Service {}',
  }),
  data_model: Object.freeze({
    rust: 'pub struct Model {}',
    go: 'type Model struct {}',
    typescript: 'interface Model {}',
  }),
  state_machine: Object.freeze({
    rust: 'pub enum State {}',
    go: 'type State int\n\nconst (\n\t// Stub: define states\n)',
    typescript: "type State = 'idle' | 'active' | 'done'",
  }),
  error_policy: Object.freeze({
    rust: 'pub enum Error {}',
    go: 'type Error struct {\n\t// Stub: define error fields\n}',
    typescript: 'class Error extends Error {\n\tconstructor(message: string) {\n\t\tsuper(message);\n\t\tthis.name = "Error";\n\t}\n}',
  }),
  security: Object.freeze({
    rust: 'pub fn authorize() {\n\t// Stub: implement authorization\n}',
    go: 'func Authorize() {\n\t// Stub: implement authorization\n}',
    typescript: 'function authorize(): void {\n\t// Stub: implement authorization\n}',
  }),
  test_policy: Object.freeze({
    rust: '#[cfg(test)]\nmod tests {\n\tuse super::*;\n\n\t#[test]\n\tfn test_example() {\n\t\t// Stub: write test\n\t}\n}',
    go: 'func TestExample(t *testing.T) {\n\t// Stub: write test\n}',
    typescript: "describe('Example', () => {\n\tit('should work', () => {\n\t\t// Stub: write test\n\t});\n});",
  }),
  build_ci: Object.freeze({
    rust: 'fn main() {\n\t// Stub: implement build/CI entry point\n}',
    go: 'func main() {\n\t// Stub: implement build/CI entry point\n}',
    typescript: '// build/CI script entry point\n// Stub: implement',
  }),
});

/**
 * Gets the declaration stub for the given kind and language.
 *
 * @param {string} kind — File kind ('config' | 'api_contract' | 'data_model' | 'state_machine' | 'error_policy' | 'security' | 'test_policy' | 'build_ci')
 * @param {string} language — Language name ('rust' | 'go' | 'typescript')
 * @returns {string} Declaration stub string. Empty string for unknown kind or language.
 */
function getDeclarationStub(kind, language) {
  const langStubs = DECLARATION_STUB_TABLE[kind];
  if (!langStubs) return '';
  const stub = langStubs[language];
  return stub !== undefined ? stub : '';
}

// ============================================================
// Language-specific comment syntax table
// PX-30: Use language-appropriate comment syntax when generating header comments
// ============================================================

/** Language-specific comment syntax (line start/end markers) */
const COMMENT_SYNTAX = Object.freeze({
  rust:       { line: '//', blockOpen: '/*', blockClose: '*/', hashLine: false },
  go:         { line: '//', blockOpen: '/*', blockClose: '*/', hashLine: false },
  typescript: { line: '//', blockOpen: '/*', blockClose: '*/', hashLine: false },
});

// ============================================================
// Header comment template constants
// PX-30: Machine-generated design info comments at the top of all generated files
// ============================================================

/** "Node" definition description (common to all files) */
const NODE_DEFINITION_EN_TEXT =
  '"Node" refers to a design fragment bounded by safe I/O boundaries in the ' +
  'Original RFC. Each node captures a distinct architectural concern that must ' +
  'be carefully implemented with attention to its relationships.';

/** Header separator line (common to all files) */
const HEADER_SEPARATOR =
  '============================================================================';

/**
 * The provenance header's identifying line.
 *
 * Named once because the generator and every reader of a header must agree on what one
 * looks like: the reverse branch (`reverse-boundify.js`) attaches this header and must
 * never re-type the marker, and supreme law 4 forbids altering it once written.
 */
const HEADER_MARKER_TEXT = 'Initial Design Artifact — RFC-driven Implementation';

/**
 * Header deletion prohibition warning (common to all files, English)
 * Strictly expresses in one line: "this comment is the heart of design traceability
 * and the bloodstream of provenance information — never delete or edit it."
 */
const HEADER_WARNING_EN_TEXT = [
  '!!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!',
];

// ============================================================
// Relative path resolution (resolveHeaderPaths)
// PX-30: Relative path calculation based on absolute paths
// ============================================================

/** The fixed artifact names every boundify artifact derives from. */
const ARTIFACT_NAMES = require('./lib/artifact-names.json');

/** The two design-source files a split package carries beside its graph. */
const DESIGN_SOURCE_FILES = Object.freeze({
  view: ARTIFACT_NAMES.view,
  stepContracts: ARTIFACT_NAMES.stepContracts,
});

/**
 * Name the design sources that exist beside a graph.
 *
 * A header must not point at an artifact the package does not carry, so the caller
 * checks existence here and passes a basename only for a present file.
 *
 * @param {string} graphDirAbs - absolute directory holding the graph
 * @returns {{view: string|null, stepContracts: string|null}}
 */
// [::TICKET::] PX-336 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-336 --for-spec --no-implementation-order`.
function resolveDesignSourceBasenames(graphDirAbs) {
  const fs = require('fs');
  const path = require('path');
  const present = (basename) => (fs.existsSync(path.join(graphDirAbs, basename)) ? basename : null);
  return {
    view: present(DESIGN_SOURCE_FILES.view),
    stepContracts: present(DESIGN_SOURCE_FILES.stepContracts),
  };
}

/**
 * Computes relative paths from the generated file to the fixed artifacts.
 *
 * The graph directory is the only variable: every basename below is a spec constant,
 * so no caller can pass a stale or divergent name. The design-source fields exist only
 * when those files exist beside the graph.
 *
 * @param {string} generatedFilePath - Absolute path of the file being generated
 * @param {string} graphDirAbs - path.dirname(graphPath) (absolute)
 * @returns {object} HeaderPaths
 *   { relDirToGraph, graphRelPath, dirsTreeRelPath, sourceRelPath, cdCommandPrefix,
 *     viewRelPath?, stepContractsRelPath? }
 */
// [::TICKET::] PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-336|PX-337) --for-spec --no-implementation-order`.
function resolveHeaderPaths(generatedFilePath, graphDirAbs) {
  const path = require('path');
  const fileDir = path.dirname(generatedFilePath);
  const rawRel = path.relative(fileDir, graphDirAbs);
  const relDir = rawRel === '' ? '.' : rawRel;
  const designSources = resolveDesignSourceBasenames(graphDirAbs);
  const relPathOf = (basename) => `${relDir}/${basename}`;

  return {
    relDirToGraph: relDir,
    graphRelPath: relPathOf(ARTIFACT_NAMES.graph),
    dirsTreeRelPath: relPathOf(ARTIFACT_NAMES.dirsTree),
    sourceRelPath: relPathOf(ARTIFACT_NAMES.source),
    cdCommandPrefix: `(cd ${relDir} &&`,
    ...(designSources.view === null ? {} : { viewRelPath: relPathOf(designSources.view) }),
    ...(designSources.stepContracts === null ? {} : { stepContractsRelPath: relPathOf(designSources.stepContracts) }),
  };
}

// ============================================================
// Header comment generation (generateHeaderComment)
// PX-30: Machine-generates header comments for all generated files
// ============================================================

/**
 * Generates the header comment placed at the top of all generated files.
 *
 * The basenames and the per-file cross-reference filter are derived from the arguments
 * here, so no caller can pass a stale source name or a list filtered against another file.
 *
 * @param {object} headerPaths - Return value of resolveHeaderPaths
 * @param {Array<{nodeId: string, title: string}>} mappedNodeIds - Node info array mapped to this file
 * @param {Array} crossReferences - Full root-level cross-reference array
 * @param {string} lang - Language ('rust' | 'go' | 'typescript')
 * @returns {string} Header comment string (including newlines)
 */
// [::TICKET::] P22-15, PX-319, PX-336, PX-337 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-15|PX-319|PX-336|PX-337) --for-spec --no-implementation-order`.
function generateHeaderComment(headerPaths, mappedNodeIds, crossReferences, lang) {
  const path = require('path');
  const syntax = COMMENT_SYNTAX[lang] || COMMENT_SYNTAX.rust;
  const L = syntax.line;
  const lines = [];
  const sourceBasename = path.basename(headerPaths.sourceRelPath);
  const graphFlagForCmd = '--graph="' + path.basename(headerPaths.graphRelPath) + '"';
  const dirsTreeFlagForCmd = '--dirs-tree="' + path.basename(headerPaths.dirsTreeRelPath) + '"';
  const mappedIds = new Set((mappedNodeIds ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.nodeId)));
  const crossRefs = (crossReferences ?? []).filter((reference) =>
    (reference.connections ?? []).some((connection) => mappedIds.has(connection.toNodeId)));
  const hasDesignSources = Boolean(headerPaths.viewRelPath && headerPaths.stepContractsRelPath);
  const missingDesignSources = [
    headerPaths.viewRelPath ? null : ARTIFACT_NAMES.view,
    headerPaths.stepContractsRelPath ? null : ARTIFACT_NAMES.stepContracts,
  ].filter(Boolean);

  // Opening separator line
  lines.push(L + ' ' + HEADER_SEPARATOR);
  lines.push(L + ' ' + HEADER_MARKER_TEXT);

  // Deletion prohibition warning (heart of design traceability)
  for (let wi = 0; wi < HEADER_WARNING_EN_TEXT.length; wi++) {
    lines.push(L + ' ' + HEADER_WARNING_EN_TEXT[wi]);
  }

  lines.push(L + ' ' + HEADER_SEPARATOR);

  // Node definition
  lines.push(L + ' ' + NODE_DEFINITION_EN_TEXT);

  // Path information
  lines.push(L + '');
  lines.push(L + ' Graph:        ' + headerPaths.graphRelPath);
  lines.push(L + ' Directory:    ' + headerPaths.dirsTreeRelPath);
  lines.push(L + ' Original RFC: ' + headerPaths.sourceRelPath);
  if (headerPaths.viewRelPath) lines.push(L + ' Sequences view: ' + headerPaths.viewRelPath);
  if (headerPaths.stepContractsRelPath) lines.push(L + ' Step contracts: ' + headerPaths.stepContractsRelPath);

  // Mapped nodes
  lines.push(L + '');
  if (mappedNodeIds && mappedNodeIds.length > 0) {
    lines.push(L + ' Mapped node(s):');
    for (let i = 0; i < mappedNodeIds.length; i++) {
      const entry = mappedNodeIds[i];
      const nid = (typeof entry === 'string') ? entry : entry.nodeId;
      const titleStr = (typeof entry === 'object' && entry.title) ? (' ' + entry.title) : '';
      lines.push(L + '   - NODE_ID=' + nid + ': ' + titleStr);
      lines.push(L + '     → To show details: ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/query.js ' + graphFlagForCmd + ' --source="' + sourceBasename + '"' + ' ' + dirsTreeFlagForCmd + ' --id=' + nid + ' --hops=2)');
      if (hasDesignSources) {
        lines.push(L + '     → For the implementation brief (contracts, forbidden, order): ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/show-node-contracts.mjs --id=' + nid + ')');
      }
    }
    if (!hasDesignSources) {
      lines.push(L + '   - Implementation brief: unavailable (' + missingDesignSources.join(', ') + ' not present beside ' + ARTIFACT_NAMES.graph + ')');
    }
  } else {
    lines.push(L + ' Mapped node(s):');
    lines.push(L + '   - No direct node mapping');
  }

  const unitIds = [...new Set((mappedNodeIds ?? []).flatMap((entry) =>
    (typeof entry === 'object' && Array.isArray(entry.unitIds) ? entry.unitIds : [])))];
  if (unitIds.length > 0) {
    const firstNodeId = typeof mappedNodeIds[0] === 'string' ? mappedNodeIds[0] : mappedNodeIds[0]?.nodeId;
    lines.push(L + ' units: ' + unitIds.join(', '));
    lines.push(L + '   → To show the node and its contract edges: ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/query.js ' + graphFlagForCmd + ' --source="' + sourceBasename + '"' + ' ' + dirsTreeFlagForCmd + ' --id=' + firstNodeId + ' --hops=1)');
  }

  // Cross-references (prose node information)
  if (crossRefs && crossRefs.length > 0) {
    lines.push(L + '');
    lines.push(L + ' Cross-referenced design context:');
    for (let i = 0; i < crossRefs.length; i++) {
      const cr = crossRefs[i];
      const headingInfo = cr.headingRef ? (' § ' + cr.headingRef) : '';
      lines.push(L + '   - ' + cr.kind + '/' + cr.title + ' [NODE_ID=' + cr.nodeId + ']' + headingInfo);
      if (cr.connections && cr.connections.length > 0) {
        for (let j = 0; j < cr.connections.length; j++) {
          const conn = cr.connections[j];
          lines.push(L + '     (' + conn.edgeType + ' ' + conn.direction + ' ' + conn.toFile + ')');
        }
      }
      lines.push(L + '     → ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/query.js ' + graphFlagForCmd + ' --source="' + sourceBasename + '"' + ' ' + dirsTreeFlagForCmd + ' --id=' + cr.nodeId + ' --hops=2)');
    }
  }

  // Full graph exploration command
  lines.push(L + '');
  lines.push(L + ' Full graph exploration:');
  lines.push(L + '   ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/show-graph-summary-markdown.js ' + graphFlagForCmd + ' --source="' + sourceBasename + '")');
  lines.push(L + '   ' + headerPaths.cdCommandPrefix + ' node .claude/scripts/rfc-graph/query.js ' + graphFlagForCmd + ' --source="' + sourceBasename + '"' + ' ' + dirsTreeFlagForCmd + ' --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)');

  // Closing separator line
  lines.push(L + ' ' + HEADER_SEPARATOR);

  return lines.join('\n') + '\n';
}

module.exports = {
  SCHEMA,
  SAFE_BOUNDARIES_EN_TEXT,
  collectLanguagesFromGraph,
  projectEdgesToDirectories,
  tarjanSCC,
  deduplicateFileNames,
  getDeclarationStub,
  resolveHeaderPaths,
  resolveDesignSourceBasenames,
  DESIGN_SOURCE_FILES,
  generateHeaderComment,
  // Expose constants for testing (immutable by design)
  COMMENT_SYNTAX,
  NODE_DEFINITION_EN_TEXT,
  HEADER_SEPARATOR,
  HEADER_MARKER_TEXT,
  HEADER_WARNING_EN_TEXT,
  DECLARATION_STUB_TABLE,
  DIRECTIONAL_EDGE_TYPES,
  LANGUAGE_EXTENSIONS,
  DESIGNATED_ENTRY_FILE,
  LANGUAGE_SEPARATORS,
  MAX_FILE_NAME_LENGTH
};
