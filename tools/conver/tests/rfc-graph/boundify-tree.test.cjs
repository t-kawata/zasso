/**
 * boundify-tree.test.cjs — boundify-tree.js のユニットテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * RFC-BOUNDIFY.md §3.5 準拠
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

// --- フィクスチャデータ ---

/** 基本的な part_of 階層を持つグラフ */
const SIMPLE_GRAPH = {
  nodes: [
    { id: 'root', title: 'Root', kind: 'architecture' },
    { id: 'child1', title: 'イベントモデル', kind: 'architecture' },
    { id: 'child2', title: 'ペイロード定義', kind: 'data_model' },
    { id: 'config1', title: '設定', kind: 'config' },
    { id: 'error1', title: 'エラー型', kind: 'error_policy' },
  ],
  edges: [
    { from: 'child1', to: 'root', type: 'part_of' },
    { from: 'child2', to: 'child1', type: 'part_of' },
    { from: 'child2', to: 'config1', type: 'references' },
  ],
};

/** part_of エッジがないグラフ */
const EDGELESS_GRAPH = {
  nodes: [
    { id: 'n1', title: 'Node1', kind: 'architecture' },
    { id: 'n2', title: 'Node2', kind: 'data_model' },
  ],
  edges: [],
};

/** 循環 part_of エッジを持つグラフ */
const CYCLIC_GRAPH = {
  nodes: [
    { id: 'a', title: 'A', kind: 'architecture' },
    { id: 'b', title: 'B', kind: 'architecture' },
    { id: 'c', title: 'C', kind: 'architecture' },
  ],
  edges: [
    { from: 'b', to: 'a', type: 'part_of' },
    { from: 'c', to: 'b', type: 'part_of' },
    { from: 'a', to: 'c', type: 'part_of' }, // 循環
  ],
};

/** part_of エッジなし、kind だけのグラフ */
const NO_PARENT_GRAPH = {
  nodes: [
    { id: 'cfg', title: 'Config', kind: 'config' },
    { id: 'err', title: 'ErrorTypes', kind: 'error_policy' },
  ],
  edges: [
    { from: 'err', to: 'cfg', type: 'references' },
  ],
};

/** 空グラフ */
const EMPTY_GRAPH = {
  nodes: [],
  edges: [],
};

/** 子ファイルを持つディレクトリノード */
const DIR_WITH_FILES = {
  name: 'event',
  type: 'directory',
  children: [
    { name: 'payload.rs', type: 'file', kind: 'data_model' },
    { name: 'meta.rs', type: 'file', kind: 'data_model' },
    { name: 'sub_dir', type: 'directory', kind: 'architecture' },
  ],
};

/** 子がないディレクトリノード */
const DIR_NO_CHILDREN = {
  name: 'empty',
  type: 'directory',
  children: [],
};

/** Rust の barrel ファイル（mod.rs）を子に含む */
const DIR_WITH_MOD_RS = {
  name: 'event',
  type: 'directory',
  children: [
    { name: 'mod.rs', type: 'file', kind: 'architecture' },
    { name: 'payload.rs', type: 'file', kind: 'data_model' },
  ],
};

/** TS の barrel ファイル（index.ts）を子に含む */
const DIR_WITH_INDEX_TS = {
  name: 'components',
  type: 'directory',
  children: [
    { name: 'index.ts', type: 'file', kind: 'architecture' },
    { name: 'button.ts', type: 'file', kind: 'api_contract' },
  ],
};

/** 複数階層を持ち重複を含む複雑なグラフ */
const COMPLEX_GRAPH = {
  nodes: [
    { id: 'src', title: 'SourceRoot', kind: 'architecture' },
    { id: 'evt', title: 'イベントモデル', kind: 'architecture' },
    { id: 'pl', title: 'ペイロード', kind: 'data_model' },
    { id: 'cfg', title: '設定管理', kind: 'config' },
    { id: 'err', title: 'エラー処理', kind: 'error_policy' },
    { id: 'sec', title: 'セキュリティ', kind: 'security' },
    { id: 'test', title: 'テスト', kind: 'test_policy' },
    { id: 'build', title: 'ビルド', kind: 'build_ci' },
  ],
  edges: [
    { from: 'evt', to: 'src', type: 'part_of' },
    { from: 'pl', to: 'evt', type: 'part_of' },
  ],
};

// --- テストスイート ---

describe('KIND_FILE_RULES', () => {
  it('should have 5 non-inline kinds (prose kinds removed)', () => {
    const expectedKinds = [
      'config', 'error_policy', 'security',
      'test_policy', 'build_ci',
    ];
    for (const kind of expectedKinds) {
      assert.ok(typeof KIND_FILE_RULES[kind] === 'string',
        `kind "${kind}" が KIND_FILE_RULES に定義されていません`);
    }
    // prose 系 kind は削除されている
    assert.equal(KIND_FILE_RULES.rationale, undefined,
      'rationale は削除されている');
    assert.equal(KIND_FILE_RULES.glossary, undefined,
      'glossary は削除されている');
    assert.equal(KIND_FILE_RULES.requirement, undefined,
      'requirement は削除されている');
  });

  it('config は config/ にマッピングされる', () => {
    assert.equal(KIND_FILE_RULES.config, 'config');
  });

  it('error_policy は error/ にマッピングされる', () => {
    assert.equal(KIND_FILE_RULES.error_policy, 'error');
  });

  it('test_policy は tests/ にマッピングされる', () => {
    assert.equal(KIND_FILE_RULES.test_policy, 'tests');
  });

  it('build_ci は build/ にマッピングされる', () => {
    assert.equal(KIND_FILE_RULES.build_ci, 'build');
  });

  it('architecture は KIND_FILE_RULES に含まれない', () => {
    assert.equal(KIND_FILE_RULES.architecture, undefined);
  });

  it('api_contract は KIND_FILE_RULES に含まれない', () => {
    assert.equal(KIND_FILE_RULES.api_contract, undefined);
  });

  it('data_model は KIND_FILE_RULES に含まれない', () => {
    assert.equal(KIND_FILE_RULES.data_model, undefined);
  });
});

describe('buildDomainHierarchy', () => {
  it('part_of エッジからドメイン階層を構築する', () => {
    const result = buildDomainHierarchy(SIMPLE_GRAPH);
    assert.ok(result.roots);
    assert.ok(result.childOf);

    // ルートノード: root（arch）、config1、error1（part_of なし）
    assert.equal(result.roots.length, 3);
    assert.ok(result.roots.some(r => r.node.id === 'root'));

    // childOf マップ
    assert.equal(result.childOf['child1'], 'root');
    assert.equal(result.childOf['child2'], 'child1');
  });

  it('part_of エッジがない場合、全ノードがルートになる', () => {
    const result = buildDomainHierarchy(EDGELESS_GRAPH);
    assert.equal(result.roots.length, 2);
    assert.deepEqual(result.childOf, {});
  });

  it('グラフに part_of エッジのみで kind が混在する場合も正しく階層構築する', () => {
    const result = buildDomainHierarchy(SIMPLE_GRAPH);
    // root ノードの子が child1
    const rootNode = result.roots.find(r => r.node.id === 'root');
    assert.ok(rootNode);
    assert.ok(rootNode.children);
    assert.equal(rootNode.children.length, 1);
    assert.equal(rootNode.children[0].node.id, 'child1');
  });

  it('空グラフでエラーにならない', () => {
    const result = buildDomainHierarchy(EMPTY_GRAPH);
    assert.deepEqual(result.roots, []);
    assert.deepEqual(result.childOf, {});
  });

  it('循環 part_of エッジでエラーにならない（循環ノードは除外される）', () => {
    const result = buildDomainHierarchy(CYCLIC_GRAPH);
    // 循環検出により少なくとも1つのノードが除外される可能性がある
    assert.ok(Array.isArray(result.roots));
    assert.ok(result.roots.length <= 3);
  });
});

describe('resolveDirForNode', () => {
  it('config kind → config/ ディレクトリ', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'c', kind: 'config' }, hierarchy);
    assert.equal(dir, 'config');
  });

  it('error_policy kind → error/ ディレクトリ', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'e', kind: 'error_policy' }, hierarchy);
    assert.equal(dir, 'error');
  });

  it('architecture kind → null（ディレクトリ骨格）', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'a', kind: 'architecture' }, hierarchy);
    assert.equal(dir, null);
  });

  it('api_contract kind → null（親ドメイン内インライン）', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'a', kind: 'api_contract' }, hierarchy);
    assert.equal(dir, null);
  });

  it('data_model kind → null（親ドメイン内インライン）', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'd', kind: 'data_model' }, hierarchy);
    assert.equal(dir, null);
  });

  it('state_machine kind → null（親ドメイン内インライン）', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 's', kind: 'state_machine' }, hierarchy);
    assert.equal(dir, null);
  });

  it('未定義 kind は kind 名をフォールバックする', () => {
    const hierarchy = { childOf: {} };
    const dir = resolveDirForNode({ id: 'x', kind: 'unknown_kind' }, hierarchy);
    assert.equal(dir, 'unknown_kind');
  });
});

describe('resolveNodeToDirMap', () => {
  it('全ノードのディレクトリマップを構築する', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const map = resolveNodeToDirMap(SIMPLE_GRAPH, hierarchy);
    assert.ok(map['root'] === null);          // architecture → 骨格
    assert.ok(map['child1'] === null);        // architecture → 骨格
    assert.ok(map['child2'] === null);        // data_model → インライン
    assert.equal(map['config1'], 'config');    // config → config/
    assert.equal(map['error1'], 'error');      // error_policy → error/
  });

  it('空グラフで空マップを返す', () => {
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

  it('単一ルート→単一ディレクトリツリー', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    assert.ok(result.tree);
    assert.equal(result.tree.name, 'src');
    assert.ok(result.tree.children.length > 0);
  });

  it('階層→子ディレクトリ', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // root の子に「イベントモデル」ディレクトリがある
    assert.ok(result.files.length > 0);
  });

  it('nodeToDir マップが正しい', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    assert.ok(result.nodeToDir['root'] === null);
    assert.equal(result.nodeToDir['config1'], 'config');
    assert.equal(result.nodeToDir['error1'], 'error');
  });

  it('kind ルール駆動ノードが含まれる', () => {
    const result = buildDirectoryTree(NO_PARENT_GRAPH, 'rust', helpers);
    // config と error_policy のディレクトリが生成される
    const dirNames = (result.tree?.children || []).map(c => c.name);
    assert.ok(dirNames.includes('config'), 'config ディレクトリが存在する');
    assert.ok(dirNames.includes('error'), 'error ディレクトリが存在する');
  });

  it('空グラフで空の結果を返す', () => {
    const result = buildDirectoryTree(EMPTY_GRAPH, 'rust', helpers);
    assert.equal(result.tree, null);
    assert.deepEqual(result.nodeToDir, {});
    assert.deepEqual(result.files, []);
  });

  it('files 一覧に全ファイルが含まれる', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // 少なくとも config と error ディレクトリ配下にファイルがある
    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.some(p => p.includes('config')), 'config ファイルが存在する');
    assert.ok(filePaths.some(p => p.includes('error')), 'error ファイルが存在する');
  });

  it('全ファイルノードに declarationStub が設定されている', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    for (const file of result.files) {
      assert.ok(typeof file.declarationStub === 'string',
        `ファイル "${file.path}" に declarationStub が設定されていません`);
    }
  });

  it('inline kind（data_model）のファイルに正しい declarationStub が設定される', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // data_model のファイルを探す
    const dataModelFiles = result.files.filter(f => f.kind === 'data_model');
    assert.ok(dataModelFiles.length > 0);
    for (const file of dataModelFiles) {
      assert.ok(file.declarationStub.includes('pub struct Model'),
        `data_model ファイル "${file.path}" の宣言スタブが不正: ${file.declarationStub}`);
    }
  });

  it('config kind のファイルに正しい declarationStub が設定される', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'typescript', helpers);
    const configFiles = result.files.filter(f => f.kind === 'config');
    assert.ok(configFiles.length > 0);
    for (const file of configFiles) {
      assert.ok(file.declarationStub.includes('interface Config'),
        `config ファイル "${file.path}" の宣言スタブが不正`);
    }
  });
});

// ============================================================
// prose 系 kind（rationale/glossary/requirement）が排除されることの検証
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
      { id: 'doc1', title: '設計判断', kind: 'rationale' },
      { id: 'doc2', title: '用語集', kind: 'glossary' },
      { id: 'doc3', title: '要件定義', kind: 'requirement' },
      { id: 'cfg', title: '設定', kind: 'config' },
      { id: 'err', title: 'エラー型', kind: 'error_policy' },
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
    // prose 系 kind のファイルが含まれていない
    const proseKinds = result.files.filter(f =>
      ['rationale', 'glossary', 'requirement'].includes(f.kind)
    );
    assert.equal(proseKinds.length, 0,
      'prose 系 kind のファイルが含まれています');
    // docs/ ディレクトリが出現しない
    const hasDocs = result.files.some(f => f.path.includes('docs'));
    assert.equal(hasDocs, false, 'docs/ ディレクトリが出現しています');
  });

  it('non-prose kinds still appear after removal', () => {
    const result = buildDirectoryTree(PROSE_GRAPH, 'rust', proseHelpers);
    const configFiles = result.files.filter(f => f.kind === 'config');
    assert.ok(configFiles.length > 0, 'config ファイルが存在する');
    const errorFiles = result.files.filter(f => f.kind === 'error_policy');
    assert.ok(errorFiles.length > 0, 'error_policy ファイルが存在する');
  });
});

describe('generateDeclarationStub', () => {
  it('Rust → pub mod 宣言を生成する', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'rust');
    assert.ok(result.includes('pub mod payload;'));
    assert.ok(result.includes('pub mod meta;'));
    assert.ok(result.includes('pub mod sub_dir;'));
  });

  it('Go → package 宣言を生成する', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'go');
    assert.equal(result, 'package event');
  });

  it('TypeScript → barrel export を生成する', () => {
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

  it('子がない場合 → null', () => {
    const result = generateDeclarationStub(DIR_NO_CHILDREN, 'rust');
    assert.equal(result, null);
  });

  it('Rust: mod.rs は self 宣言としてスキップされる', () => {
    const result = generateDeclarationStub(DIR_WITH_MOD_RS, 'rust');
    // mod.rs は含まれない
    assert.ok(!result.includes('pub mod mod;'));
    // payload.rs は含まれる
    assert.ok(result.includes('pub mod payload;'));
  });

  it('TypeScript: index.ts は barrel 自身としてスキップされる', () => {
    const result = generateDeclarationStub(DIR_WITH_INDEX_TS, 'typescript');
    // index.ts は含まれない
    assert.ok(!result.includes("export * from './index';"));
    // button.ts は含まれる
    assert.ok(result.includes("export * from './button';"));
  });

  it('未対応言語 → null', () => {
    const result = generateDeclarationStub(DIR_WITH_FILES, 'python');
    assert.equal(result, null);
  });

  it('null ノード → null', () => {
    const result = generateDeclarationStub(null, 'rust');
    assert.equal(result, null);
  });
});

describe('generateReport', () => {
  it('統計セクションが含まれる', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## 統計'));
    assert.ok(report.includes('総ノード数'));
    assert.ok(report.includes('総エッジ数'));
    assert.ok(report.includes('生成ファイル数'));
  });

  it('kind 別統計セクションが含まれる', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('kind 別ノード数'));
    assert.ok(report.includes('architecture'));
    assert.ok(report.includes('data_model'));
  });

  it('ディレクトリツリーセクションが含まれる', () => {
    const dirsTree = { name: 'root', type: 'directory', children: [] };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## ディレクトリツリー'));
    assert.ok(report.includes('root/'));
  });

  it('ファイル一覧セクションが含まれる', () => {
    const dirsTree = {
      name: 'root', type: 'directory',
      children: [
        { name: 'test.rs', type: 'file', kind: 'data_model' },
      ],
    };
    const report = generateReport(SIMPLE_GRAPH, dirsTree, 'rust');
    assert.ok(report.includes('## ファイル一覧'));
    assert.ok(report.includes('test.rs'));
  });

  it('空グラフでもエラーにならない', () => {
    const report = generateReport(EMPTY_GRAPH, null, 'rust');
    assert.ok(report);
    assert.ok(report.includes('総ノード数: 0'));
  });
});

describe('collectFiles', () => {
  it('ファイルのみを収集する', () => {
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

  it('null で空配列を返す', () => {
    assert.deepEqual(collectFiles(null, []), []);
  });
});

describe('mergeTopLevelNodes', () => {
  it('同名ディレクトリの子をマージする', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'docs', type: 'directory', children: [{ name: 'a.md', type: 'file' }], mappedNodeIds: ['n1'] }],
      [{ name: 'docs', type: 'directory', children: [{ name: 'b.md', type: 'file' }], mappedNodeIds: ['n2'] }]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].children.length, 2);
    assert.deepEqual(merged[0].mappedNodeIds, ['n1', 'n2']);
  });

  it('異名ディレクトリは独立して残る', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'src', type: 'directory', children: [] }],
      [{ name: 'docs', type: 'directory', children: [] }]
    );
    assert.equal(merged.length, 2);
  });
});

describe('renderTreeAscii', () => {
  it('ディレクトリツリーを ASCII 形式でレンダリングする', () => {
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
// PX-29: pruneEmptyDirectories — 空ディレクトリ削除 + 子1つフラット化
// ============================================================

describe('pruneEmptyDirectories', () => {
  it('空ディレクトリを削除する', () => {
    const tree = { name: 'empty', type: 'directory', children: [] };
    assert.equal(pruneEmptyDirectories(tree), null);
  });

  it('子が1つだけのディレクトリをフラット化する', () => {
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
    // child がフラット化され、その子 file.rs が親の直下に
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0].name, 'file.rs');
  });

  it('複数子のディレクトリは維持する', () => {
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

  it('ファイルのみのディレクトリは維持する', () => {
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

  it('再帰的に空ディレクトリを削除する', () => {
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
    // src → outer → inner（空）, src → outer → inner は削除, outer も子が空になる → 削除
    // src も子が空 → 削除
    assert.equal(result, null);
  });

  it('子1つのフラット化後も mappedNodeIds が継承される', () => {
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
    // mappedNodeIds がマージされている
    assert.ok(result.mappedNodeIds.includes('p1'));
    assert.ok(result.mappedNodeIds.includes('c1'));
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0].name, 'file.rs');
  });

  it('null 入力で null を返す', () => {
    assert.equal(pruneEmptyDirectories(null), null);
  });

  it('ファイルノードはそのまま返す', () => {
    const file = { name: 'test.rs', type: 'file', kind: 'config' };
    const result = pruneEmptyDirectories(file);
    assert.equal(result, file);
  });
});

// ============================================================
// PX-29: collectDescendantIds — 階層子孫収集
// ============================================================

describe('collectDescendantIds', () => {
  it('architecture ルートの全子孫を収集する', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const ids = collectDescendantIds(hierarchy.roots);
    // root(arch)→child1(arch)→child2(data_model)
    assert.ok(ids.has('root'), 'root が含まれる');
    assert.ok(ids.has('child1'), 'child1 が含まれる');
    assert.ok(ids.has('child2'), 'child2 が含まれる');
    // 非 architecture ルートは含まれない
    assert.ok(!ids.has('config1'), 'config1（非 backbone）は含まれない');
    assert.ok(!ids.has('error1'), 'error1（非 backbone）は含まれない');
  });

  it('空ルートで空セットを返す', () => {
    const ids = collectDescendantIds([]);
    assert.equal(ids.size, 0);
  });
});

// ============================================================
// PX-29: findRuleDrivenNodes — excludeNodeIds フィルタ
// ============================================================

describe('findRuleDrivenNodes with excludeNodeIds', () => {
  it('excludeNodeIds に含まれるノードを除外する', () => {
    const hierarchy = buildDomainHierarchy(SIMPLE_GRAPH);
    const descendantIds = collectDescendantIds(hierarchy.roots);

    // excludeNodeIds あり
    const filtered = findRuleDrivenNodes(
      SIMPLE_GRAPH, hierarchy, 'rust',
      (node) => (node.slug || node.id || 'unnamed') + '.rs',
      (files) => files,
      () => '// stub',
      descendantIds,
    );
    // config1 と error1 は descendantIds に含まれていないので残る
    const configEntries = filtered.filter(n => n.name === 'config');
    assert.equal(configEntries.length, 1, 'config エントリが1つ存在する');

    // excludeNodeIds なし（従来動作）
    const unfiltered = findRuleDrivenNodes(
      SIMPLE_GRAPH, hierarchy, 'rust',
      (node) => (node.slug || node.id || 'unnamed') + '.rs',
      (files) => files,
      () => '// stub',
    );
    // excludeNodeIds なしの場合、root/child1/child2 も含まれるが
    // resolveDirForNode が null を返すので実質的には同じ
    assert.ok(unfiltered.length >= filtered.length);
  });
});

// ============================================================
// PX-29: mergeTopLevelNodes — 子の重複排除強化
// ============================================================

describe('mergeTopLevelNodes dedup', () => {
  it('同名ディレクトリの子を重複排除してマージする', () => {
    const merged = mergeTopLevelNodes(
      [{ name: 'docs', type: 'directory', children: [
        { name: 'a.md', type: 'file' },
        { name: 'b.md', type: 'file' },  // b.md は重複
      ], mappedNodeIds: ['n1'] }],
      [{ name: 'docs', type: 'directory', children: [
        { name: 'b.md', type: 'file' },  // 重複
        { name: 'c.md', type: 'file' },
      ], mappedNodeIds: ['n2'] }]
    );
    assert.equal(merged.length, 1);
    // a.md, b.md, c.md → b.md は重複排除されて3つ
    assert.equal(merged[0].children.length, 3);
    assert.deepEqual(merged[0].mappedNodeIds, ['n1', 'n2']);
  });
});

// ============================================================
// PX-29: buildDirectoryTree — 階層化の動作検証
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

  it('非 architecture 子が architecture 下のサブディレクトリに配置される', () => {
    // config/error_policy が architecture の part_of 子であるグラフ
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
    assert.ok(result.tree, 'ツリーが生成される');

    // root/ 配下に config/ と error/ がある
    const rootDir = result.tree.children.find(c => c.name === 'root');
    assert.ok(rootDir, 'root ディレクトリが存在する');
    const configDir = rootDir.children.find(c => c.name === 'config');
    assert.ok(configDir, 'root 下に config ディレクトリが存在する');
    const errorDir = rootDir.children.find(c => c.name === 'error');
    assert.ok(errorDir, 'root 下に error ディレクトリが存在する');

    // config ディレクトリにファイルがある
    assert.ok(configDir.children.length > 0);
    assert.equal(configDir.children[0].name, 'config.rs');

    // ルート直下に config/error がない
    const topLevelConfig = result.tree.children.find(c => c.name === 'config');
    assert.ok(!topLevelConfig, 'ルート直下に config ディレクトリがない');
  });

  it('複数 kind 混在でも個別サブディレクトリに分割される', () => {
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

  it('inline kind（data_model）は従来通り親ディレクトリにファイルとして配置される', () => {
    const INLINE_GRAPH = {
      nodes: [
        { id: 'root', title: 'Root', kind: 'architecture', slug: 'root' },
        { id: 'model', title: 'Model', kind: 'data_model', slug: 'model' },
      ],
      edges: [
        { from: 'model', to: 'root', type: 'part_of' },
      ],
    };
    const result = buildDirectoryTree(INLINE_GRAPH, 'rust', helpers);
    assert.ok(result.tree);

    const rootDir = result.tree.children.find(c => c.name === 'root');
    assert.ok(rootDir);

    // data_model はインライン配置 → root/ 直下に model.rs がある
    const hasModelFile = rootDir.children.some(c => c.type === 'file' && c.name === 'model.rs');
    assert.ok(hasModelFile, 'data_model が inline ファイルとして配置される');

    // data_model がサブディレクトリとして出現しない
    const hasModelDir = rootDir.children.some(c => c.type === 'directory' && c.name === 'model');
    assert.ok(!hasModelDir, 'data_model がサブディレクトリとして出現しない');
  });

  it('フラット化後も全ファイルが src/ 直下に存在する', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    // 全ファイルパスが src/ で始まる
    for (const file of result.files) {
      assert.ok(file.path.startsWith('src/'),
        `ファイルパス "${file.path}" が src/ で始まらない`);
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

  it('should record direction: prose→target=→, target→prose=←', () => {
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
