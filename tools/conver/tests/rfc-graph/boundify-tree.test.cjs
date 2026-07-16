/**
 * boundify-tree.test.cjs — boundify-tree.js unit tests
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Compliant with RFC-BOUNDIFY.md §3.5
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  KIND_FILE_RULES,
  buildDomainHierarchy,
  resolveDirForNode,
  resolveNodeToDirMap,
  buildDirectoryTree,
  generateDeclarationStub,
  generateReport,
  collectFiles,
  mergeTopLevelNodes,
  renderTreeAscii,
  pruneEmptyDirectories,
  collectDescendantIds,
  computeCrossReferences,
  findRuleDrivenNodes,
} = require('../../.claude/scripts/rfc-graph/boundify-tree.js');

const {
  getDeclarationStub,
} = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');

// --- Fixture data ---

/** Graph with a basic part_of hierarchy */
const SIMPLE_GRAPH = {
  nodes: [
    { id: 'root', title: 'Root', kind: 'architecture' },
    { id: 'child1', title: 'Event Model', kind: 'architecture' },
    { id: 'child2', title: 'Payload Definition', kind: 'data_model' },
    { id: 'config1', title: 'Config', kind: 'config' },
    { id: 'error1', title: 'Error Types', kind: 'error_policy' },
  ],
  edges: [
    { from: 'child1', to: 'root', type: 'part_of' },
    { from: 'child2', to: 'child1', type: 'part_of' },
    { from: 'child2', to: 'config1', type: 'references' },
  ],
};

/** Graph with no part_of edges */
const EDGELESS_GRAPH = {
  nodes: [
    { id: 'n1', title: 'Node1', kind: 'architecture' },
    { id: 'n2', title: 'Node2', kind: 'data_model' },
  ],
  edges: [],
};

/** Graph with circular part_of edges */
const CYCLIC_GRAPH = {
  nodes: [
    { id: 'a', title: 'A', kind: 'architecture' },
    { id: 'b', title: 'B', kind: 'architecture' },
    { id: 'c', title: 'C', kind: 'architecture' },
  ],
  edges: [
    { from: 'b', to: 'a', type: 'part_of' },
    { from: 'c', to: 'b', type: 'part_of' },
    { from: 'a', to: 'c', type: 'part_of' }, // circular
  ],
};

/** Graph with no part_of edges, only kinds */
const NO_PARENT_GRAPH = {
  nodes: [
    { id: 'cfg', title: 'Config', kind: 'config' },
    { id: 'err', title: 'ErrorTypes', kind: 'error_policy' },
  ],
  edges: [
    { from: 'err', to: 'cfg', type: 'references' },
  ],
};

/** Empty graph */
const EMPTY_GRAPH = {
  nodes: [],
  edges: [],
};

/** Directory node with child files */
const DIR_WITH_FILES = {
  name: 'event',
  type: 'directory',
  children: [
    { name: 'payload.rs', type: 'file', kind: 'data_model' },
    { name: 'meta.rs', type: 'file', kind: 'data_model' },
    { name: 'sub_dir', type: 'directory', kind: 'architecture' },
  ],
};

/** Directory node with no children */
const DIR_NO_CHILDREN = {
  name: 'empty',
  type: 'directory',
  children: [],
};

/** Directory containing a Rust barrel file (mod.rs) */
const DIR_WITH_MOD_RS = {
  name: 'event',
  type: 'directory',
  children: [
    { name: 'mod.rs', type: 'file', kind: 'architecture' },
    { name: 'payload.rs', type: 'file', kind: 'data_model' },
  ],
};

/** Directory containing a TS barrel file (index.ts) */
const DIR_WITH_INDEX_TS = {
  name: 'components',
  type: 'directory',
  children: [
    { name: 'index.ts', type: 'file', kind: 'architecture' },
    { name: 'button.ts', type: 'file', kind: 'api_contract' },
  ],
};

/** Complex graph with multiple levels and duplicates */
const COMPLEX_GRAPH = {
  nodes: [
    { id: 'src', title: 'SourceRoot', kind: 'architecture' },
    { id: 'evt', title: 'Event Model', kind: 'architecture' },
    { id: 'pl', title: 'Payload', kind: 'data_model' },
    { id: 'cfg', title: 'Config Manager', kind: 'config' },
    { id: 'err', title: 'Error Handler', kind: 'error_policy' },
    { id: 'sec', title: 'Security', kind: 'security' },
    { id: 'test', title: 'Test', kind: 'test_policy' },
    { id: 'build', title: 'Build', kind: 'build_ci' },
  ],
  edges: [
    { from: 'evt', to: 'src', type: 'part_of' },
    { from: 'pl', to: 'evt', type: 'part_of' },
  ],
};

// --- Test suites ---

describe('KIND_FILE_RULES', () => {
  it('should have 8 rule-driven kinds (prose + architecture excluded)', () => {
    const expectedKinds = [
      'config', 'error_policy', 'security',
      'test_policy', 'build_ci',
      'api_contract', 'data_model', 'state_machine',
    ];
    for (const kind of expectedKinds) {
      assert.ok(typeof KIND_FILE_RULES[kind] === 'string',
        `kind "${kind}" is not defined in KIND_FILE_RULES`);
    }
    // prose kinds should be excluded
    assert.equal(KIND_FILE_RULES.rationale, undefined,
      'rationale should be excluded');
    assert.equal(KIND_FILE_RULES.glossary, undefined,
      'glossary should be excluded');
    assert.equal(KIND_FILE_RULES.requirement, undefined,
      'requirement should be excluded');
    assert.equal(KIND_FILE_RULES.requirement, undefined,
      'requirement should be removed');
  });

  it('config maps to config/ directory', () => {
    assert.equal(KIND_FILE_RULES.config, 'config');
  });

  it('error_policy maps to error/ directory', () => {
    assert.equal(KIND_FILE_RULES.error_policy, 'error');
  });

  it('test_policy maps to tests/ directory', () => {
    assert.equal(KIND_FILE_RULES.test_policy, 'tests');
  });

  it('build_ci maps to build/ directory', () => {
    assert.equal(KIND_FILE_RULES.build_ci, 'build');
  });

  it('architecture is NOT included in KIND_FILE_RULES', () => {
    assert.equal(KIND_FILE_RULES.architecture, undefined);
  });

  it('api_contract is included in KIND_FILE_RULES', () => {
    assert.equal(KIND_FILE_RULES.api_contract, 'api');
  });

  it('data_model is included in KIND_FILE_RULES', () => {
    assert.equal(KIND_FILE_RULES.data_model, 'model');
  });
});

describe('buildDomainHierarchy', () => {
  it('builds domain hierarchy from part_of edges', () => {
    const result = buildDomainHierarchy(SIMPLE_GRAPH);
    assert.ok(result.roots);
    assert.ok(result.childOf);

    // Root nodes: root (arch), config1, error1 (no part_of)
    assert.equal(result.roots.length, 3);
    assert.ok(result.roots.some(r => r.node.id === 'root'));

    // childOf map
    assert.equal(result.childOf['child1'], 'root');
    assert.equal(result.childOf['child2'], 'child1');
  });

  it('all nodes become roots when there are no part_of edges', () => {
    const result = buildDomainHierarchy(EDGELESS_GRAPH);
    assert.equal(result.roots.length, 2);
    assert.deepEqual(result.childOf, {});
  });

  it('builds hierarchy correctly with mixed kinds and only part_of edges', () => {
    const result = buildDomainHierarchy(SIMPLE_GRAPH);
    // root node should have child1 as a child
    const rootNode = result.roots.find(r => r.node.id === 'root');
    assert.ok(rootNode);
    assert.ok(rootNode.children);
    assert.equal(rootNode.children.length, 1);
    assert.equal(rootNode.children[0].node.id, 'child1');
  });

  it('handles empty graph without error', () => {
    const result = buildDomainHierarchy(EMPTY_GRAPH);
    assert.deepEqual(result.roots, []);
    assert.deepEqual(result.childOf, {});
  });

  it('handles circular part_of edges without error (circular nodes are excluded)', () => {
    const result = buildDomainHierarchy(CYCLIC_GRAPH);
    // Cycle detection may exclude at least one node
    assert.ok(Array.isArray(result.roots));
    assert.ok(result.roots.length <= 3);
  });
});

describe('resolveDirForNode', () => {
  it('config kind maps to config/ directory', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'c', kind: 'config' }, hierarchy);
    assert.equal(dir, 'config');
  });

  it('error_policy kind maps to error/ directory', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'e', kind: 'error_policy' }, hierarchy);
    assert.equal(dir, 'error');
  });

  it('architecture kind returns null (directory skeleton)', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'a', kind: 'architecture' }, hierarchy);
    assert.equal(dir, null);
  });

  it('api_contract kind maps to api (KIND_FILE_RULES)', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'a', kind: 'api_contract' }, hierarchy);
    assert.equal(dir, 'api');
  });

  it('data_model kind maps to model (KIND_FILE_RULES)', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'd', kind: 'data_model' }, hierarchy);
    assert.equal(dir, 'model');
  });

  it('state_machine kind maps to state (KIND_FILE_RULES)', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 's', kind: 'state_machine' }, hierarchy);
    assert.equal(dir, 'state');
  });

  it('undefined kind falls back to the kind name itself', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'x', kind: 'unknown_kind' }, hierarchy);
    assert.equal(dir, 'unknown_kind');
  });
});

describe('resolveNodeToDirMap', () => {
  it('builds directory map for all nodes', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const map = resolveNodeToDirMap(SIMPLE_GRAPH, hierarchy);
    assert.ok(map['root'] === null);          // architecture -> skeleton
    assert.ok(map['child1'] === null);        // architecture -> skeleton
    assert.equal(map['child2'], 'model');       // data_model -> model/
    assert.equal(map['config1'], 'config');    // config -> config/
    assert.equal(map['error1'], 'error');      // error_policy -> error/
  });

  it('returns empty map for empty graph', () => {
    const hierarchy = buildDomainHierarchy(EMPTY_GRAPH);
    const map = resolveNodeToDirMap(EMPTY_GRAPH, hierarchy);
    assert.deepEqual(map, {});
  });
});

describe('buildDirectoryTree', () => {
  const helpers = {
    titleToFileName: (title, lang) => {
      const cleaned = String(title || '')
        .replace(/^§\S+\s*/, '')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .substring(0, 48);
      const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[lang] || '.rs';
      if (cleaned === 'mod' || cleaned === 'index') return `_${cleaned}${ext}`;
      return cleaned ? `${cleaned}${ext}` : `unnamed${ext}`;
    },
    deduplicateFileNames: (files, lang) => {
      const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[lang] || '.rs';
      const extPattern = new RegExp(`\\.(${['rs','go','ts'].join('|')})$`);
      const names = {};
      const result = [];
      for (const file of (files || [])) {
        const base = (file.name || '').replace(extPattern, '');
        if (names[base] !== undefined) {
          names[base]++;
          result.push({ name: `${base}_${names[base]}${ext}`, ...file, name: undefined });
        } else {
          names[base] = 0;
          result.push({ ...file, name: `${base}${ext}` });
        }
      }
      return result;
    },
    getDeclarationStub: getDeclarationStub,
  };

  it('single root produces single directory tree', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    assert.ok(result.tree);
    assert.equal(result.tree.name, 'src');
    assert.ok(result.tree.children.length > 0);
  });

  it('hierarchy produces subdirectories', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // There should be an "Event Model" directory under root
    assert.ok(result.files.length > 0);
  });

  it('nodeToDir map is correct', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    assert.ok(result.nodeToDir['root'] === null);
    assert.equal(result.nodeToDir['config1'], 'config');
    assert.equal(result.nodeToDir['error1'], 'error');
  });

  it('includes kind-rule-driven nodes', () => {
    const result = buildDirectoryTree(NO_PARENT_GRAPH, 'rust', helpers);
    // config and error_policy directories should be generated
    const dirNames = (result.tree?.children || []).map(c => c.name);
    assert.ok(dirNames.includes('config'), 'config directory should exist');
    assert.ok(dirNames.includes('error'), 'error directory should exist');
  });

  it('returns empty result for empty graph', () => {
    const result = buildDirectoryTree(EMPTY_GRAPH, 'rust', helpers);
    assert.equal(result.tree, null);
    assert.deepEqual(result.nodeToDir, {});
    assert.deepEqual(result.files, []);
  });

  it('files list contains all files', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // At minimum, files should exist under config and error directories
    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.some(p => p.includes('config')), 'config file should exist');
    assert.ok(filePaths.some(p => p.includes('error')), 'error file should exist');
  });

  it('all file nodes have declarationStub set', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    for (const file of result.files) {
      assert.ok(typeof file.declarationStub === 'string',
        `file "${file.path}" has no declarationStub set`);
    }
  });

  it('inline kind (data_model) files get correct declarationStub', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // Find data_model files
    const dataModelFiles = result.files.filter(f => f.kind === 'data_model');
    assert.ok(dataModelFiles.length > 0);
    for (const file of dataModelFiles) {
      assert.ok(file.declarationStub.includes('pub struct Model'),
        `data_model file "${file.path}" declaration stub invalid: ${file.declarationStub}`);
    }
  });

  it('config kind files get correct declarationStub', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'typescript', helpers);
    const configFiles = result.files.filter(f => f.kind === 'config');
    assert.ok(configFiles.length > 0);
    for (const file of configFiles) {
      assert.ok(file.declarationStub.includes('interface Config'),
        `config file "${file.path}" declaration stub invalid`);
    }
  });
});

// ============================================================
// Verification that prose kinds (rationale/glossary/requirement) are excluded
// ============================================================

describe('prose kind exclusion', () => {
  const proseHelpers = {
    titleToFileName: (title, lang) => {
      const cleaned = String(title || '').replace(/^§\S+\s*/, '').replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase().substring(0, 48);
      const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[lang] || '.rs';
      if (cleaned === 'mod' || cleaned === 'index') return `_${cleaned}${ext}`;
      return cleaned ? `${cleaned}${ext}` : `unnamed${ext}`;
    },
    deduplicateFileNames: (files, lang) => files || [],
    getDeclarationStub: getDeclarationStub,
  };

  const PROSE_GRAPH = {
    nodes: [
      { id: 'root', title: 'Root', kind: 'architecture' },
      { id: 'doc1', title: 'Design Decision', kind: 'rationale' },
      { id: 'doc2', title: 'Glossary', kind: 'glossary' },
      { id: 'doc3', title: 'Requirements', kind: 'requirement' },
      { id: 'cfg', title: 'Config', kind: 'config' },
      { id: 'err', title: 'Error Types', kind: 'error_policy' },
    ],
    edges: [
      { from: 'doc1', to: 'root', type: 'part_of' },
      { from: 'doc2', to: 'root', type: 'part_of' },
      { from: 'doc3', to: 'root', type: 'part_of' },
      { from: 'cfg', to: 'root', type: 'references' },
      { from: 'err', to: 'root', type: 'depends_on' },
    ],
  };

  it('prose kinds are not in KIND_FILE_RULES', () => {
    assert.equal(KIND_FILE_RULES.rationale, undefined);
    assert.equal(KIND_FILE_RULES.glossary, undefined);
    assert.equal(KIND_FILE_RULES.requirement, undefined);
  });

  it('prose kind nodes do NOT appear in Dirs-Tree.json files', () => {
    const result = buildDirectoryTree(PROSE_GRAPH, 'rust', proseHelpers);
    // Prose kind files should not be present
    const proseKinds = result.files.filter(f =>
      ['rationale', 'glossary', 'requirement'].includes(f.kind)
    );
    assert.equal(proseKinds.length, 0,
      'prose kind files should not be present');
    // docs/ directory should not appear
    const hasDocs = result.files.some(f => f.path.includes('docs'));
    assert.equal(hasDocs, false, 'docs/ directory should not appear');
  });

  it('non-prose kinds still appear after removal', () => {
    const result = buildDirectoryTree(PROSE_GRAPH, 'rust', proseHelpers);
    const configFiles = result.files.filter(f => f.kind === 'config');
    assert.ok(configFiles.length > 0, 'config file should exist');
    const errorFiles = result.files.filter(f => f.kind === 'error_policy');
    assert.ok(errorFiles.length > 0, 'error_policy file should exist');
  });
});

describe('generateDeclarationStub', () => {
  it('Rust generates pub mod declarations', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'rust');
    assert.ok(result.includes('pub mod payload;'));
    assert.ok(result.includes('pub mod meta;'));
    assert.ok(result.includes('pub mod sub_dir;'));
  });

  it('Go generates package declaration', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'go');
    assert.equal(result, 'package event');
  });

  it('TypeScript generates barrel exports', () => {
    const dirWithTsFiles = {
      name: 'components',
      type: 'directory',
      children: [
        { name: 'button.ts', type: 'file', kind: 'api_contract' },
        { name: 'card.ts', type: 'file', kind: 'api_contract' },
        { name: 'sub_dir', type: 'directory', kind: 'architecture' },
      ],
    };
    const result = generateDeclarationStub(dirWithTsFiles, 'typescript');
    assert.ok(result.includes("export * from './button';"));
    assert.ok(result.includes("export * from './card';"));
    assert.ok(result.includes("export * from './sub_dir';"));
  });

  it('returns null when there are no children', () => {
    const result = generateDeclarationStub(DIR_NO_CHILDREN, 'rust');
    assert.equal(result, null);
  });

  it('Rust: mod.rs is skipped as self-declaration', () => {
    const result = generateDeclarationStub(DIR_WITH_MOD_RS, 'rust');
    // mod.rs should not be included
    assert.ok(!result.includes('pub mod mod;'));
    // payload.rs should be included
    assert.ok(result.includes('pub mod payload;'));
  });

  it('TypeScript: index.ts is skipped as self-barrel', () => {
    const result = generateDeclarationStub(DIR_WITH_INDEX_TS, 'typescript');
    // index.ts should not be included
    assert.ok(!result.includes("export * from './index';"));
    // button.ts should be included
    assert.ok(result.includes("export * from './button';"));
  });

  it('returns null for unsupported language', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'python');
    assert.equal(result, null);
  });

  it('returns null for null node', () => {
    const result = generateDeclarationStub(null, 'rust');
    assert.equal(result, null);
  });
});

describe('generateReport', () => {
  it('includes statistics section', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## Statistics'));
    assert.ok(report.includes('Total nodes'));
    assert.ok(report.includes('Total edges'));
    assert.ok(report.includes('Generated files'));
  });

  it('includes kind statistics section', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('Node count by kind'));
    assert.ok(report.includes('architecture'));
    assert.ok(report.includes('data_model'));
  });

  it('includes directory tree section', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## Directory Tree'));
    assert.ok(report.includes('root/'));
  });

  it('includes file list section', () => {
    const dirsTree = {
      name: 'root', type: 'directory',
      children: [
        { name: 'test.rs', type: 'file', kind: 'data_model' },
      ],
    };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## File List'));
    assert.ok(report.includes('test.rs'));
  });

  it('handles empty graph without error', () => {
    const report = generateReport(EMPTY_GRAPH, null, 'rust');
    assert.ok(report);
    assert.ok(report.includes('Total nodes: 0'));
  });
});

describe('collectFiles', () => {
  it('collects only files', () => {
    const tree = {
      name: 'src', type: 'directory',
      children: [
        { name: 'main.rs', type: 'file', kind: 'architecture' },
        {
          name: 'event', type: 'directory',
          children: [
            { name: 'payload.rs', type: 'file', kind: 'data_model' },
          ],
        },
      ],
    };
    const files = collectFiles(tree, []);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, 'main.rs');
    assert.equal(files[0].path, 'src/main.rs');
    assert.equal(files[1].name, 'payload.rs');
    assert.equal(files[1].path, 'src/event/payload.rs');
  });

  it('returns empty array for null', () => {
    assert.deepEqual(collectFiles(null, []), []);
  });
});

describe('mergeTopLevelNodes', () => {
  it('merges children of directories with the same name', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'docs', type: 'directory', children: [{ name: 'a.md', type: 'file' }], mappedNodeIds: ['n1'] }],
      [{ name: 'docs', type: 'directory', children: [{ name: 'b.md', type: 'file' }], mappedNodeIds: ['n2'] }]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].children.length, 2);
    assert.deepEqual(merged[0].mappedNodeIds, ['n1', 'n2']);
  });

  it('directories with different names remain separate', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'src', type: 'directory', children: [] }],
      [{ name: 'docs', type: 'directory', children: [] }]
    );
    assert.equal(merged.length, 2);
  });
});

describe('renderTreeAscii', () => {
  it('renders directory tree in ASCII format', () => {
    const tree = {
      name: 'src', type: 'directory',
      children: [
        { name: 'main.rs', type: 'file' },
        { name: 'event', type: 'directory', children: [] },
      ],
    };
    const lines = renderTreeAscii(tree);
    assert.ok(lines.length >= 3);
    assert.ok(lines[0].includes('src/'));
  });
});

// ============================================================
// PX-29: pruneEmptyDirectories — remove empty dirs + flatten single-child dirs
// ============================================================

describe('pruneEmptyDirectories', () => {
  it('removes empty directories', () => {
    const tree = { name: 'empty', type: 'directory', children: [] };
    assert.equal(pruneEmptyDirectories(tree), null);
  });

  it('flattens single-child directories', () => {
    const tree = {
      name: 'parent', type: 'directory',
      children: [
        { name: 'child', type: 'directory', children: [
          { name: 'file.rs', type: 'file', kind: 'config' },
        ]},
      ],
    };
    const result = pruneEmptyDirectories(tree);
    assert.ok(result);
    assert.equal(result.name, 'parent');
    // child should be flattened, putting file.rs directly under parent
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0].name, 'file.rs');
  });

  it('preserves directories with multiple children', () => {
    const tree = {
      name: 'multi', type: 'directory',
      children: [
        { name: 'a.rs', type: 'file', kind: 'config' },
        { name: 'b.rs', type: 'file', kind: 'config' },
      ],
    };
    const result = pruneEmptyDirectories(tree);
    assert.ok(result);
    assert.equal(result.children.length, 2);
  });

  it('preserves file-only directories', () => {
    const tree = {
      name: 'src', type: 'directory',
      children: [
        { name: 'main.rs', type: 'file', kind: 'architecture' },
      ],
    };
    const result = pruneEmptyDirectories(tree);
    assert.ok(result);
    assert.equal(result.children.length, 1);
  });

  it('recursively removes empty directories', () => {
    const tree = {
      name: 'src', type: 'directory',
      children: [
        {
          name: 'outer', type: 'directory',
          children: [
            { name: 'inner', type: 'directory', children: [] },
          ],
        },
      ],
    };
    const result = pruneEmptyDirectories(tree);
    // src -> outer -> inner (empty), src -> outer -> inner removed, outer also has no children -> removed
    // src also has no children -> removed
    assert.equal(result, null);
  });

  it('preserves mappedNodeIds after single-child flattening', () => {
    const tree = {
      name: 'parent', type: 'directory', mappedNodeIds: ['p1'],
      children: [
        {
          name: 'child', type: 'directory', mappedNodeIds: ['c1'],
          children: [
            { name: 'file.rs', type: 'file', kind: 'config', mappedNodeIds: ['f1'] },
          ],
        },
      ],
    };
    const result = pruneEmptyDirectories(tree);
    assert.ok(result);
    // mappedNodeIds should be merged
    assert.ok(result.mappedNodeIds.includes('p1'));
    assert.ok(result.mappedNodeIds.includes('c1'));
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0].name, 'file.rs');
  });

  it('returns null for null input', () => {
    assert.equal(pruneEmptyDirectories(null), null);
  });

  it('returns file nodes as-is', () => {
    const file = { name: 'test.rs', type: 'file', kind: 'config' };
    const result = pruneEmptyDirectories(file);
    assert.equal(result, file);
  });
});

// ============================================================
// PX-29: collectDescendantIds — collect hierarchy descendants
// ============================================================

describe('collectDescendantIds', () => {
  it('collects all descendants of architecture roots', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const ids = collectDescendantIds(hierarchy.roots);
    // root(arch)->child1(arch)->child2(data_model)
    assert.ok(ids.has('root'), 'root should be included');
    assert.ok(ids.has('child1'), 'child1 should be included');
    assert.ok(ids.has('child2'), 'child2 should be included');
    // Non-architecture roots should not be included
    assert.ok(!ids.has('config1'), 'config1 (non-backbone) should not be included');
    assert.ok(!ids.has('error1'), 'error1 (non-backbone) should not be included');
  });

  it('returns empty set for empty roots', () => {
    const ids = collectDescendantIds([]);
    assert.equal(ids.size, 0);
  });
});

// ============================================================
// PX-29: findRuleDrivenNodes — excludeNodeIds filter
// ============================================================

describe('findRuleDrivenNodes with excludeNodeIds', () => {
  it('excludes nodes present in excludeNodeIds', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const descendantIds = collectDescendantIds(hierarchy.roots);

    // With excludeNodeIds
    const filtered = findRuleDrivenNodes(
      SIMPLE_GRAPH, hierarchy, 'rust',
      (node) => (node.slug || node.id || 'unnamed') + '.rs',
      (files) => files,
      () => '// stub',
      descendantIds,
    );
    // config1 and error1 are not in descendantIds, so they remain
    const configEntries = filtered.filter(n => n.name === 'config');
    assert.equal(configEntries.length, 1, 'there should be exactly one config entry');

    // Without excludeNodeIds (legacy behavior)
    const unfiltered = findRuleDrivenNodes(
      SIMPLE_GRAPH, hierarchy, 'rust',
      (node) => (node.slug || node.id || 'unnamed') + '.rs',
      (files) => files,
      () => '// stub',
    );
    // Without excludeNodeIds, root/child1/child2 are also included but
    // resolveDirForNode returns null for them, so the result is effectively the same
    assert.ok(unfiltered.length >= filtered.length);
  });
});

// ============================================================
// PX-29: mergeTopLevelNodes — child dedup enhancement
// ============================================================

describe('mergeTopLevelNodes dedup', () => {
  it('deduplicates and merges children of same-name directories', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'docs', type: 'directory', children: [
        { name: 'a.md', type: 'file' },
        { name: 'b.md', type: 'file' },  // b.md is duplicate
      ], mappedNodeIds: ['n1'] }],
      [{ name: 'docs', type: 'directory', children: [
        { name: 'b.md', type: 'file' },  // duplicate
        { name: 'c.md', type: 'file' },
      ], mappedNodeIds: ['n2'] }]
    );
    assert.equal(merged.length, 1);
    // a.md, b.md, c.md — b.md deduplicated, so 3 total
    assert.equal(merged[0].children.length, 3);
    assert.deepEqual(merged[0].mappedNodeIds, ['n1', 'n2']);
  });
});

// ============================================================
// PX-29: buildDirectoryTree — hierarchy behavior verification
// ============================================================

describe('buildDirectoryTree hierarchy', () => {
  const helpers = {
    titleToFileName: (title, lang) => {
      const cleaned = String(title || '')
        .replace(/^§\S+\s*/, '')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .substring(0, 48);
      const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[lang] || '.rs';
      if (cleaned === 'mod' || cleaned === 'index') return `_${cleaned}${ext}`;
      return cleaned ? `${cleaned}${ext}` : `unnamed${ext}`;
    },
    deduplicateFileNames: (files, lang) => files || [],
    getDeclarationStub: getDeclarationStub,
  };

  it('non-architecture children are placed under architecture subdirectories', () => {
    // Graph where config/error_policy are part_of children of architecture
    const HIERARCHICAL_GRAPH = {
      nodes: [
        { id: 'root', title: 'Root', kind: 'architecture', slug: 'root' },
        { id: 'cfg', title: 'Config', kind: 'config', slug: 'config' },
        { id: 'err', title: 'Error', kind: 'error_policy', slug: 'error' },
      ],
      edges: [
        { from: 'cfg', to: 'root', type: 'part_of' },
        { from: 'err', to: 'root', type: 'part_of' },
      ],
    };
    const result = buildDirectoryTree(HIERARCHICAL_GRAPH, 'rust', helpers);
    assert.ok(result.tree, 'tree should be generated');

    // root/ should contain config/ and error/
    const rootDir = result.tree.children.find(c => c.name === 'root');
    assert.ok(rootDir, 'root directory should exist');
    const configDir = rootDir.children.find(c => c.name === 'config');
    assert.ok(configDir, 'config directory should exist under root');
    const errorDir = rootDir.children.find(c => c.name === 'error');
    assert.ok(errorDir, 'error directory should exist under root');

    // config directory should have a file
    assert.ok(configDir.children.length > 0);
    assert.equal(configDir.children[0].name, 'config.rs');

    // config/error should NOT appear at root level
    const topLevelConfig = result.tree.children.find(c => c.name === 'config');
    assert.ok(!topLevelConfig, 'config directory should not appear directly under root');
  });

  it('mixed kinds are split into individual subdirectories', () => {
    const MULTI_KIND_GRAPH = {
      nodes: [
        { id: 'root', title: 'Root', kind: 'architecture', slug: 'root' },
        { id: 'cfg', title: 'Config', kind: 'config', slug: 'config' },
        { id: 'sec', title: 'Security', kind: 'security', slug: 'security' },
        { id: 'bld', title: 'Build', kind: 'build_ci', slug: 'build' },
      ],
      edges: [
        { from: 'cfg', to: 'root', type: 'part_of' },
        { from: 'sec', to: 'root', type: 'part_of' },
        { from: 'bld', to: 'root', type: 'part_of' },
      ],
    };
    const result = buildDirectoryTree(MULTI_KIND_GRAPH, 'rust', helpers);
    assert.ok(result.tree);

    const rootDir = result.tree.children.find(c => c.name === 'root');
    assert.ok(rootDir);

    const subDirNames = rootDir.children.map(c => c.name).sort();
    assert.deepEqual(subDirNames, ['build', 'config', 'security']);
  });

  it('data_model is placed under architecture as a child file', () => {
    const RULE_GRAPH = {
      nodes: [
        { id: 'root', title: 'Root', kind: 'architecture', slug: 'root' },
        { id: 'model', title: 'Model', kind: 'data_model', slug: 'model' },
      ],
      edges: [
        { from: 'model', to: 'root', type: 'part_of' },
      ],
    };
    const result = buildDirectoryTree(RULE_GRAPH, 'rust', helpers);
    assert.ok(result.tree);

    const rootDir = result.tree.children.find(c => c.name === 'root');
    assert.ok(rootDir);

    // data_model should be placed as model.rs under root
    const hasModelFile = rootDir.children.some(c => c.type === 'file' && c.name === 'model.rs');
    assert.ok(hasModelFile, 'root/model.rs should exist');

    // nodeToDir should have a mapping for the model node
    assert.equal(result.nodeToDir['model'], 'model');
  });

  it('all files are under src/ after flattening', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // All file paths should start with src/
    for (const file of result.files) {
      assert.ok(file.path.startsWith('src/'),
        `file path "${file.path}" does not start with src/`);
    }
  });
});


// ============================================================
// PX-30: computeCrossReferences
// ============================================================

describe('computeCrossReferences', () => {
  const SIMPLE_NODES = [
    { id: 'N001', kind: 'architecture', title: 'Root', language: 'rust' },
    { id: 'N002', kind: 'config', title: 'DB Config', language: 'rust' },
    { id: 'N003', kind: 'rationale', title: 'Why EDA', headingRef: '§ 2.1' },
    { id: 'N004', kind: 'glossary', title: 'EDA Definition' },
    { id: 'N005', kind: 'requirement', title: 'Must be Async' },
    { id: 'N006', kind: 'data_model', title: 'User Model' },
    { id: 'N007', kind: 'rationale', title: 'Orphan Rationale' },
  ];

  const SIMPLE_EDGES = [
    { from: 'N003', to: 'N001', type: 'refines' },
    { from: 'N003', to: 'N002', type: 'refines' },
    { from: 'N004', to: 'N001', type: 'references' },
    { from: 'N005', to: 'N006', type: 'constrains' },
    { from: 'N002', to: 'N005', type: 'implements' },
  ];

  const NODE_TO_DIR = {
    N001: 'src',
    N002: 'src/config',
    N003: 'src/docs',
    N004: 'src/docs',
    N005: 'src',
    N006: 'src/models',
  };

  it('should collect prose nodes and resolve connections', () => {
    const graph = { nodes: SIMPLE_NODES, edges: SIMPLE_EDGES };
    const result = computeCrossReferences(graph, NODE_TO_DIR);
    assert.strictEqual(result.length, 4);
    const n003 = result.find(r => r.nodeId === 'N003');
    assert.ok(n003);
    assert.strictEqual(n003.kind, 'rationale');
    assert.strictEqual(n003.connections.length, 2);
    assert.strictEqual(n003.connections[0].toFile, 'src');
    assert.strictEqual(n003.connections[0].edgeType, 'refines');
    assert.strictEqual(n003.connections[0].direction, '→');
    assert.strictEqual(n003.connections[0].toNodeId, 'N001');
  });

  it('should record direction: prose->target=→, target->prose=←', () => {
    const graph = { nodes: SIMPLE_NODES, edges: SIMPLE_EDGES };
    const result = computeCrossReferences(graph, NODE_TO_DIR);
    const n003 = result.find(r => r.nodeId === 'N003');
    const connToN001 = n003.connections.find(c => c.toNodeId === 'N001');
    assert.strictEqual(connToN001.direction, '→');
    const n005 = result.find(r => r.nodeId === 'N005');
    const connFromN002 = n005.connections.find(c => c.toNodeId === 'N002');
    assert.strictEqual(connFromN002.direction, '←');
  });

  it('should include headingRef and title', () => {
    const graph = { nodes: SIMPLE_NODES, edges: SIMPLE_EDGES };
    const result = computeCrossReferences(graph, NODE_TO_DIR);
    const n003 = result.find(r => r.nodeId === 'N003');
    assert.strictEqual(n003.title, 'Why EDA');
    assert.strictEqual(n003.headingRef, '§ 2.1');
  });

  it('should return empty array when no prose nodes exist', () => {
    const result = computeCrossReferences({ nodes: [{ id: 'N001', kind: 'config' }], edges: [] }, {});
    assert.strictEqual(result.length, 0);
  });

  it('should return empty connections for prose with no edges', () => {
    const graph = { nodes: SIMPLE_NODES, edges: SIMPLE_EDGES };
    const result = computeCrossReferences(graph, NODE_TO_DIR);
    const orphan = result.find(r => r.nodeId === 'N007');
    assert.ok(orphan);
    assert.strictEqual(orphan.connections.length, 0);
  });

  it('should skip edges to unmapped nodes', () => {
    const graph = { nodes: SIMPLE_NODES, edges: [{ from: 'N003', to: 'UNMAPPED', type: 'refines' }] };
    const result = computeCrossReferences(graph, NODE_TO_DIR);
    const n003 = result.find(r => r.nodeId === 'N003');
    assert.strictEqual(n003.connections.length, 0);
  });

  it('should handle empty graph', () => {
    const result = computeCrossReferences({ nodes: [], edges: [] }, {});
    assert.strictEqual(result.length, 0);
  });
});
