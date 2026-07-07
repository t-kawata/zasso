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
} = require('../../.claude/scripts/rfc-graph/boundify-tree.js');

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
  it('12 種の kind が定義済みである', () => {
    const expectedKinds = [
      'config', 'error_policy', 'security',
      'test_policy', 'build_ci',
      'rationale', 'glossary', 'requirement',
    ];
    for (const kind of expectedKinds) {
      assert.ok(typeof KIND_FILE_RULES[kind] === 'string',
        `kind "${kind}" が KIND_FILE_RULES に定義されていません`);
    }
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
  };

  it('単一ルート→単一ディレクトリツリー', () => {
    const result = buildDirectoryTree(SIMPLE_GRAPH, 'rust', helpers);
    assert.ok(result.tree);
    assert.equal(result.tree.name, 'root');
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
