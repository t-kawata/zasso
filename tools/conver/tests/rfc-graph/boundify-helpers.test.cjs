/**
 * boundify-helpers.test.cjs — boundify-helpers.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA,
  SAFE_BOUNDARIES_EN_TEXT,
  inferLanguage,
  graphToLangJson,
  projectEdgesToDirectories,
  tarjanSCC,
  titleToFileName,
  deduplicateFileNames,
} = require('../../.claude/scripts/rfc-graph/boundify-helpers.js');

// ============================================================
// SCHEMA 定数
// ============================================================

describe('SCHEMA', () => {
  it('should be a valid object with $schema', () => {
    assert.strictEqual(typeof SCHEMA, 'object');
    assert.strictEqual(SCHEMA.$schema, 'http://json-schema.org/draft-07/schema#');
    assert.strictEqual(SCHEMA.title, 'DirsTree');
    assert.strictEqual(SCHEMA.type, 'object');
  });

  it('should require all 7 top-level fields', () => {
    const required = SCHEMA.required;
    assert.ok(required.includes('schemaVersion'));
    assert.ok(required.includes('generatedAt'));
    assert.ok(required.includes('sourceGraph'));
    assert.ok(required.includes('analysis'));
    assert.ok(required.includes('trees'));
    assert.ok(required.includes('dependencyDirections'));
    assert.ok(required.includes('warnings'));
    assert.strictEqual(required.length, 7);
  });

  it('should have DirNode definition with name and type required', () => {
    const dirNode = SCHEMA.definitions.DirNode;
    assert.ok(dirNode.required.includes('name'));
    assert.ok(dirNode.required.includes('type'));
    assert.strictEqual(dirNode.properties.type.enum.length, 2);
    assert.ok(dirNode.properties.type.enum.includes('directory'));
    assert.ok(dirNode.properties.type.enum.includes('file'));
  });

  it('should have DependencyDirection with from, to, rule required', () => {
    const depDir = SCHEMA.definitions.DependencyDirection;
    assert.ok(depDir.required.includes('from'));
    assert.ok(depDir.required.includes('to'));
    assert.ok(depDir.required.includes('rule'));
  });

  it('should have trees requiring rust, go, typescript', () => {
    assert.ok(SCHEMA.properties.trees.required.includes('rust'));
    assert.ok(SCHEMA.properties.trees.required.includes('go'));
    assert.ok(SCHEMA.properties.trees.required.includes('typescript'));
  });

  it('should have DirNode with recursive children using $ref', () => {
    const children = SCHEMA.definitions.DirNode.properties.children;
    assert.strictEqual(children.items.$ref, '#/definitions/DirNode');
  });
});

// ============================================================
// SAFE_BOUNDARIES_EN_TEXT 定数
// ============================================================

describe('SAFE_BOUNDARIES_EN_TEXT', () => {
  it('should be a non-empty string', () => {
    assert.strictEqual(typeof SAFE_BOUNDARIES_EN_TEXT, 'string');
    assert.ok(SAFE_BOUNDARIES_EN_TEXT.length > 50);
  });

  it('should mention all three languages', () => {
    assert.ok(SAFE_BOUNDARIES_EN_TEXT.includes('Rust'));
    assert.ok(SAFE_BOUNDARIES_EN_TEXT.includes('Go'));
    assert.ok(SAFE_BOUNDARIES_EN_TEXT.includes('TypeScript'));
  });

  it('should mention boundaries', () => {
    assert.ok(SAFE_BOUNDARIES_EN_TEXT.includes('boundar'));
  });
});

// ============================================================
// inferLanguage
// ============================================================

describe('inferLanguage', () => {
  it('should detect Rust from crate keyword in title', () => {
    const result = inferLanguage({ title: 'crate root', summary: 'Entry point' });
    assert.ok(result.includes('rust'));
  });

  it('should detect Rust from unsafe keyword in summary', () => {
    const result = inferLanguage({ title: 'FFI', summary: 'unsafe extern "C"' });
    assert.ok(result.includes('rust'));
  });

  it('should detect Go from package keyword', () => {
    const result = inferLanguage({ title: 'package main', summary: 'func main()' });
    assert.ok(result.includes('go'));
  });

  it('should detect Go from goroutine keyword', () => {
    const result = inferLanguage({ title: 'Concurrent worker', summary: 'go func()' });
    assert.ok(result.includes('go'));
  });

  it('should detect TypeScript from TypeScript keyword', () => {
    const result = inferLanguage({ title: 'TypeScript barrel export', summary: '' });
    assert.ok(result.includes('typescript'));
  });

  it('should detect TypeScript from interface keyword', () => {
    const result = inferLanguage({ title: 'User interface', summary: 'interface Props' });
    assert.ok(result.includes('typescript'));
  });

  it('should return all three languages for kind=build_ci', () => {
    const result = inferLanguage({ title: 'CI config', summary: '', kind: 'build_ci' });
    assert.strictEqual(result.length, 3);
    assert.ok(result.includes('rust'));
    assert.ok(result.includes('go'));
    assert.ok(result.includes('typescript'));
  });

  it('should return all three languages for kind=security', () => {
    const result = inferLanguage({ title: 'Auth', summary: '', kind: 'security' });
    assert.strictEqual(result.length, 3);
  });

  it('should return all three languages for kind=architecture', () => {
    const result = inferLanguage({ title: 'Design', summary: '', kind: 'architecture' });
    assert.strictEqual(result.length, 3);
    assert.ok(result.includes('rust'));
    assert.ok(result.includes('go'));
    assert.ok(result.includes('typescript'));
  });

  it('should return all three languages for kind=requirement', () => {
    const result = inferLanguage({ title: 'Spec', summary: '', kind: 'requirement' });
    assert.strictEqual(result.length, 3);
  });

  it('should return default fallback for unknown kind', () => {
    const result = inferLanguage({ title: 'Misc', summary: '', kind: 'unknown' });
    assert.strictEqual(result.length, 3);
  });

  it('should not throw on empty title and summary', () => {
    const result = inferLanguage({});
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });

  it('should not throw on null/undefined node properties', () => {
    const result = inferLanguage({ title: null, summary: undefined });
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });
});

// ============================================================
// graphToLangJson
// ============================================================

describe('graphToLangJson', () => {
  it('should add languageMap to all nodes', () => {
    const graph = {
      nodes: [
        { id: 'N001', title: 'crate root', summary: '' },
        { id: 'N002', title: 'package main', summary: 'func main()' },
        { id: 'N003', title: 'TypeScript config', summary: '' }
      ],
      edges: [
        { from: 'N001', to: 'N002', type: 'depends_on' }
      ]
    };
    const result = graphToLangJson(graph);
    assert.ok(result.languageMap);
    assert.strictEqual(Object.keys(result.languageMap).length, 3);
    assert.ok(result.languageMap.N001.includes('rust'));
    assert.ok(result.languageMap.N002.includes('go'));
    assert.ok(result.languageMap.N003.includes('typescript'));
  });

  it('should preserve edges', () => {
    const graph = {
      nodes: [{ id: 'N001', title: 'test', summary: '' }],
      edges: [{ from: 'N001', to: 'N002', type: 'depends_on' }]
    };
    const result = graphToLangJson(graph);
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].type, 'depends_on');
  });

  it('should return empty languageMap for empty nodes', () => {
    const graph = { nodes: [], edges: [] };
    const result = graphToLangJson(graph);
    assert.strictEqual(Object.keys(result.languageMap).length, 0);
  });

  it('should handle null/undefined nodes gracefully', () => {
    const graph = {};
    const result = graphToLangJson(graph);
    assert.strictEqual(Object.keys(result.languageMap).length, 0);
  });
});

// ============================================================
// projectEdgesToDirectories
// ============================================================

describe('projectEdgesToDirectories', () => {
  const edges = [
    { from: 'N001', to: 'N002', type: 'depends_on' },
    { from: 'N003', to: 'N004', type: 'part_of' },
    { from: 'N005', to: 'N006', type: 'implements' }
  ];
  const nodeToDir = {
    N001: 'src/event/',
    N002: 'src/error/',
    N003: 'src/doc/',
    N004: 'src/doc/',
    N005: 'src/api/',
    N006: 'src/impl/'
  };

  it('should project depends_on edges between different directories', () => {
    const result = projectEdgesToDirectories(edges, nodeToDir);
    const dependsOn = result.find(function(e) { return e.from === 'src/event/' && e.to === 'src/error/'; });
    assert.ok(dependsOn);
    assert.strictEqual(dependsOn.type, 'depends_on');
    assert.ok(dependsOn.evidence.includes('N001->N002'));
  });

  it('should skip non-directional edge types like part_of', () => {
    const result = projectEdgesToDirectories(edges, nodeToDir);
    const partOf = result.find(function(e) { return e.type === 'part_of'; });
    assert.strictEqual(partOf, undefined);
  });

  it('should skip edges within same directory', () => {
    const sameDirEdges = [{ from: 'N001', to: 'N002', type: 'depends_on' }];
    const sameNodeToDir = { N001: 'src/event/', N002: 'src/event/' };
    const result = projectEdgesToDirectories(sameDirEdges, sameNodeToDir);
    assert.strictEqual(result.length, 0);
  });

  it('should skip unresolved node mappings', () => {
    const partialEdges = [{ from: 'N001', to: 'N999', type: 'depends_on' }];
    const partialMap = { N001: 'src/event/' };
    const result = projectEdgesToDirectories(partialEdges, partialMap);
    assert.strictEqual(result.length, 0);
  });

  it('should return empty array for no edges', () => {
    const result = projectEdgesToDirectories([], {});
    assert.strictEqual(result.length, 0);
  });

  it('should return implements edges', () => {
    const result = projectEdgesToDirectories(edges, nodeToDir);
    const impl = result.find(function(e) { return e.type === 'implements'; });
    assert.ok(impl);
    assert.strictEqual(impl.from, 'src/api/');
    assert.strictEqual(impl.to, 'src/impl/');
  });

  it('should process references, extends, constrains edges', () => {
    const allEdges = [
      { from: 'N001', to: 'N002', type: 'references' },
      { from: 'N003', to: 'N004', type: 'extends' },
      { from: 'N005', to: 'N006', type: 'constrains' }
    ];
    const dirMap = { N001: 'a/', N002: 'b/', N003: 'c/', N004: 'd/', N005: 'e/', N006: 'f/' };
    const result = projectEdgesToDirectories(allEdges, dirMap);
    assert.strictEqual(result.length, 3);
  });
});

// ============================================================
// tarjanSCC
// ============================================================

describe('tarjanSCC', () => {
  it('should return empty for acyclic graph', () => {
    const edges = [
      { from: 'src/a/', to: 'src/b/' },
      { from: 'src/b/', to: 'src/c/' }
    ];
    const result = tarjanSCC(edges);
    assert.strictEqual(result.length, 0);
  });

  it('should detect a simple cycle', () => {
    const edges = [
      { from: 'src/a/', to: 'src/b/' },
      { from: 'src/b/', to: 'src/c/' },
      { from: 'src/c/', to: 'src/a/' }
    ];
    const result = tarjanSCC(edges);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].cycle.includes('src/a/'));
    assert.ok(result[0].cycle.includes('src/b/'));
    assert.ok(result[0].cycle.includes('src/c/'));
  });

  it('should not report self-loop as cycle', () => {
    const edges = [
      { from: 'src/a/', to: 'src/a/' }
    ];
    const result = tarjanSCC(edges);
    assert.strictEqual(result.length, 0);
  });

  it('should detect multiple independent cycles', () => {
    const edges = [
      { from: 'src/a/', to: 'src/b/' },
      { from: 'src/b/', to: 'src/a/' },
      { from: 'src/c/', to: 'src/d/' },
      { from: 'src/d/', to: 'src/c/' }
    ];
    const result = tarjanSCC(edges);
    assert.strictEqual(result.length, 2);
  });

  it('should return empty for no edges', () => {
    const result = tarjanSCC([]);
    assert.strictEqual(result.length, 0);
  });

  it('should handle diamond-shaped graph (no cycle)', () => {
    const edges = [
      { from: 'src/a/', to: 'src/b/' },
      { from: 'src/a/', to: 'src/c/' },
      { from: 'src/b/', to: 'src/d/' },
      { from: 'src/c/', to: 'src/d/' }
    ];
    const result = tarjanSCC(edges);
    assert.strictEqual(result.length, 0);
  });

  it('should handle duplicate edges', () => {
    const edges = [
      { from: 'src/a/', to: 'src/b/' },
      { from: 'src/b/', to: 'src/a/' },
      { from: 'src/a/', to: 'src/b/' }
    ];
    const result = tarjanSCC(edges);
    // 重複エッジが存在しても、1つの循環として報告される
    assert.strictEqual(result.length, 1);
  });
});

// ============================================================
// titleToFileName
// ============================================================

describe('titleToFileName', () => {
  it('should convert §15 Event Model to snake_case .rs', () => {
    const result = titleToFileName('§15 Event Model', 'rust');
    assert.strictEqual(result, 'event_model.rs');
  });

  it('should convert §15 Event Model to snake_case .go', () => {
    const result = titleToFileName('§15 Event Model', 'go');
    assert.strictEqual(result, 'event_model.go');
  });

  it('should convert §15 Event Model to kebab-case .ts', () => {
    const result = titleToFileName('§15 Event Model', 'typescript');
    assert.strictEqual(result, 'event-model.ts');
  });

  it('should convert complex title to kebab-case .ts', () => {
    const result = titleToFileName('Media Session Controller', 'typescript');
    assert.strictEqual(result, 'media-session-controller.ts');
  });

  it('should produce snake_case for Rust mixed with hyphens', () => {
    const result = titleToFileName('media-session-controller', 'rust');
    assert.strictEqual(result, 'media_session_controller.rs');
  });

  it('should prefix barrel name mod with underscore for Rust', () => {
    const result = titleToFileName('mod', 'rust');
    assert.strictEqual(result, '_mod.rs');
  });

  it('should prefix barrel name index with underscore for TypeScript', () => {
    const result = titleToFileName('index', 'typescript');
    assert.strictEqual(result, '_index.ts');
  });

  it('should replace special characters with underscores', () => {
    const result = titleToFileName('A/B:C D', 'rust');
    // A/B:C_D → 特殊文字が_に置換される
    assert.ok(result.includes('_'));
    assert.ok(result.endsWith('.rs'));
  });

  it('should truncate to 48 characters before extension', () => {
    // 60 chars of clean text + ".rs" = 63 chars total if not truncated
    const longTitle = 'a' + 'b'.repeat(59);
    const result = titleToFileName(longTitle, 'rust');
    // 48 chars (base) + ".rs" (3) = 51
    assert.strictEqual(result.length, 51);
    assert.strictEqual(result.slice(-3), '.rs');
    assert.strictEqual(result.slice(0, 48).length, 48);
  });

  it('should return empty string + extension for empty title', () => {
    const result = titleToFileName('', 'rust');
    assert.strictEqual(result, '.rs');
  });

  it('should handle title with only non-alphanumeric characters', () => {
    const result = titleToFileName('§§§', 'rust');
    assert.strictEqual(result, '.rs');
  });

  it('should fallback to .rs for unknown language', () => {
    const result = titleToFileName('test', 'python');
    assert.strictEqual(result, 'test.rs');
  });
});

// ============================================================
// deduplicateFileNames
// ============================================================

describe('deduplicateFileNames', () => {
  it('should not change unique names', () => {
    const files = [{ name: 'a.rs' }, { name: 'b.rs' }];
    const result = deduplicateFileNames(files, 'rust');
    const names = result.map(function(f) { return f.name; });
    assert.ok(names.includes('a.rs'));
    assert.ok(names.includes('b.rs'));
    assert.strictEqual(result.length, 2);
  });

  it('should add _1 suffix to first duplicate', () => {
    const files = [{ name: 'a.rs' }, { name: 'a.rs' }];
    const result = deduplicateFileNames(files, 'rust');
    const names = result.map(function(f) { return f.name; });
    // 1つ目は a.rs、2つ目は a_1.rs
    assert.ok(names.includes('a.rs'));
    assert.ok(names.includes('a_1.rs'));
    assert.strictEqual(result.length, 2);
  });

  it('should add _1, _2 suffixes for three duplicates', () => {
    const files = [{ name: 'a.rs' }, { name: 'a.rs' }, { name: 'a.rs' }];
    const result = deduplicateFileNames(files, 'rust');
    const names = result.map(function(f) { return f.name; });
    assert.ok(names.includes('a.rs'));
    assert.ok(names.includes('a_1.rs'));
    assert.ok(names.includes('a_2.rs'));
    assert.strictEqual(result.length, 3);
  });

  it('should return empty array for empty input', () => {
    const result = deduplicateFileNames([], 'rust');
    assert.strictEqual(result.length, 0);
  });

  it('should handle TypeScript extensions correctly', () => {
    const files = [{ name: 'event.ts' }, { name: 'event.ts' }];
    const result = deduplicateFileNames(files, 'typescript');
    const names = result.map(function(f) { return f.name; });
    assert.ok(names.includes('event.ts'));
    assert.ok(names.includes('event_1.ts'));
  });

  it('should handle Go extensions correctly', () => {
    const files = [{ name: 'main.go' }, { name: 'main.go' }, { name: 'main.go' }];
    const result = deduplicateFileNames(files, 'go');
    const names = result.map(function(f) { return f.name; });
    assert.ok(names.includes('main.go'));
    assert.ok(names.includes('main_1.go'));
    assert.ok(names.includes('main_2.go'));
  });

  it('should handle mixed extensions in input', () => {
    const files = [{ name: 'a.rs' }, { name: 'a.go' }];
    const result = deduplicateFileNames(files, 'rust');
    const names = result.map(function(f) { return f.name; });
    assert.ok(names.includes('a.rs'));
    assert.ok(names.includes('a_1.rs')); // a.go のベース名 a → 重複とみなす
  });
});
