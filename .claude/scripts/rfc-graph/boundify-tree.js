#!/usr/bin/env node

/**
 * boundify-tree.js — boundify-graph-to-dirs のディレクトリツリー生成関数群
 *
 * グラフノードからディレクトリツリーを生成する6関数を提供する。
 * RFC-BOUNDIFY.md §3.5（ディレクトリ提案アルゴリズム）に準拠。
 *
 * 依存: boundify-helpers.js (titleToFileName, deduplicateFileNames)
 */

'use strict';

// P18-1 内部では require で読み込む（CommonJS）
const path = require('path');

/**
 * kind→ディレクトリ配置先 マッピング定数
 *
 * 各 kind がどのサブディレクトリに配置されるかを定義する。
 * value が null の kind はディレクトリ骨格（architecture）または
 * 親ドメイン内インライン配置（api_contract/data_model/state_machine）。
 */
const KIND_FILE_RULES = Object.freeze({
  config: 'config',
  error_policy: 'error',
  security: 'security',
  test_policy: 'tests',
  build_ci: 'build',
  rationale: 'docs',
  glossary: 'docs',
  requirement: 'docs',
});

/**
 * 親ドメイン内にインライン配置される kind のセット
 */
const INLINE_KINDS = Object.freeze(new Set([
  'api_contract',
  'data_model',
  'state_machine',
]));

/**
 * ディレクトリ骨格（ファイルを生成しない）kind のセット
 */
const BACKBONE_KINDS = Object.freeze(new Set([
  'architecture',
]));

/**
 * part_of エッジからドメイン階層を構築する
 *
 * @param {object} graph - グラフオブジェクト（{nodes, edges}）
 * @returns {{roots: Array, childOf: object}}
 *   roots: 再帰的ツリー構造のルートノード配列
 *   childOf: ノードID→親ノードID のマップ
 */
function buildDomainHierarchy(graph) {
  const childOf = {};
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // part_of エッジから親子関係マップを構築
  for (const edge of edges) {
    if (edge.type === 'part_of') {
      childOf[edge.from] = edge.to;
    }
  }

  // ルートノード（part_of の対象になっていないノード）を特定
  const allNodeIds = new Set(nodes.map(n => n.id));
  const hasParent = new Set(Object.keys(childOf));
  const rootIds = [...allNodeIds].filter(id => !hasParent.has(id));

  // 指定ノードを根とするサブツリーを再帰構築する
  function buildTree(nodeId, visited) {
    if (visited.has(nodeId)) {
      // [::STUB::] 循環 part_of エッジ: 現在はエラーとして扱う。
      // 将来、循環検出を改善する場合は tickets/P18-1 参照。
      return null;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;

    // このノードを親とする子ノードを収集
    const childIds = edges
      .filter(e => e.type === 'part_of' && childOf[e.from] === nodeId && e.from !== nodeId)
      .map(e => e.from);

    const children = childIds
      .map(id => buildTree(id, nextVisited))
      .filter(Boolean);

    return {
      node,
      children: children.length > 0 ? children : null,
    };
  }

  const roots = rootIds
    .map(id => buildTree(id, new Set()))
    .filter(Boolean);

  return { roots, childOf };
}

/**
 * ノードの kind と hierarchy に基づいて配置先ディレクトリを解決する
 *
 * @param {object} node - グラフノード（{id, kind, title}）
 * @param {object} hierarchy - buildDomainHierarchy の戻り値
 * @returns {string|null} ディレクトリ名（骨格の場合は null）
 */
function resolveDirForNode(node, hierarchy) {
  const kind = node.kind || '';
  const rules = KIND_FILE_RULES;

  // ディレクトリ骨格はファイルを生成しない
  if (BACKBONE_KINDS.has(kind)) return null;

  // 親ドメイン内インライン配置は親アーキテクチャ名を使用
  if (INLINE_KINDS.has(kind)) {
    const parentId = hierarchy.childOf[node.id];
    if (parentId) {
      // [::STUB::] 要解決: 親ノードの解決時に階層全体のパスを構築する。
      // 現在は親ノード名のみ返すが、将来はルートからの相対パスを返す必要がある。
      return null;
    }
    return null;
  }

  // kind→ディレクトリ名 マッピング
  const dirName = rules[kind];
  if (dirName) return dirName;

  // 未定義 kind は kind 名をそのままフォールバック
  return kind || null;
}

/**
 * グラフから ノード→ディレクトリ名 マップを構築する
 *
 * @param {object} graph - グラフオブジェクト（{nodes, edges}）
 * @returns {object} {nodeToDir: {[nodeId]: string|null}}
 */
function resolveNodeToDirMap(graph, hierarchy) {
  const nodeToDir = {};
  const nodes = graph.nodes || [];

  for (const node of nodes) {
    nodeToDir[node.id] = resolveDirForNode(node, hierarchy);
  }

  return nodeToDir;
}

/**
 * グラフからディレクトリツリーを構築する
 *
 * Phase 1（buildDomainHierarchy）の階層に Phase 2（kind ベース配置）を適用する。
 * メインの統合関数。内部で titleToFileName() と deduplicateFileNames() を使用。
 *
 * @param {object} graph - グラフオブジェクト
 * @param {string} lang - 言語名（'rust' | 'go' | 'typescript'）
 * @param {object} helpers - 外部依存関数（titleToFileName, deduplicateFileNames）
 * @returns {{tree: object|null, nodeToDir: object, files: Array}}
 *   tree: ディレクトリツリーのルート
 *   nodeToDir: ノードID→ディレクトリパス のマップ
 *   files: 生成されるファイル一覧
 */
function buildDirectoryTree(graph, lang, helpers) {
  const languageExtensions = helpers.languageExtensions || { rust: '.rs', go: '.go', typescript: '.ts' };
  const deduplicateFileNames = helpers.deduplicateFileNames;
  const hierarchy = buildDomainHierarchy(graph);
  const nodeToDir = resolveNodeToDirMap(graph, hierarchy);
  const nodes = graph.nodes || [];

  /**
   * ノードの slug から言語別ファイル名を解決する。
   * slug 未設定の場合はノードIDをフォールバックとして使用する。
   */
  function resolveFileName(node, lang) {
    const slug = node.slug;
    if (slug && typeof slug === 'string' && slug.length > 0) {
      return slug + (languageExtensions[lang] || '.rs');
    }
    // フォールバック: slug 未設定（古いグラフとの互換性）
    const fallback = node.id ? node.id.toLowerCase() : 'unnamed';
    return fallback + (languageExtensions[lang] || '.rs');
  }

  // ルート階層からディレクトリツリー構築
  function buildTreeFromRoot(root) {
    if (!root || !root.node) return null;

    const node = root.node;
    const kind = node.kind || '';

    // architecture kind → ディレクトリノード
    if (BACKBONE_KINDS.has(kind)) {
      const dirName = resolveFileName(node, lang).replace(/\.(rs|go|ts)$/, '');
      const dirNode = {
        name: dirName,
        type: 'directory',
        kind,
        mappedNodeIds: [node.id],
        children: [],
      };

      // 子ノードの処理
      if (root.children) {
        for (const child of root.children) {
          const childDir = buildTreeFromRoot(child);
          if (childDir) {
            dirNode.children.push(childDir);
          }
        }
      }

      // インライン kind の子ノードも追加（part_of 以外のエッジから）
      const inlineChildren = findInlineChildren(node.id, graph, hierarchy);
      for (const inlineChild of inlineChildren) {
        const fileName = resolveFileName(inlineChild, lang);
        dirNode.children.push({
          name: fileName,
          type: 'file',
          kind: inlineChild.kind || '',
          mappedNodeIds: [inlineChild.id],
        });
      }

      return dirNode;
    }

    return null;
  }

  // 指定ノードのインライン子ノードを取得（kind ベース）
  function findInlineChildren(nodeId, graph, hierarchy) {
    const allNodes = graph.nodes || [];
    const edges = graph.edges || [];

    // このノードを親とする part_of エッジの子で、インライン kind のものを収集
    const childIds = edges
      .filter(e => e.type === 'part_of' && hierarchy.childOf[e.from] === nodeId && e.from !== nodeId)
      .map(e => e.from);

    return childIds
      .map(id => allNodes.find(n => n.id === id))
      .filter(n => n && INLINE_KINDS.has(n.kind || ''));
  }

  // ルート階層全体をツリーに変換
  const topNodes = [];
  for (const root of hierarchy.roots) {
    const treeNode = buildTreeFromRoot(root);
    if (treeNode) topNodes.push(treeNode);
  }

  // kind→ディレクトリルールに該当する独立ノードも収集
  const ruleDrivenNodes = findRuleDrivenNodes(graph, hierarchy, lang, resolveFileName, deduplicateFileNames);

  // マージ
  const allTopNodes = mergeTopLevelNodes(topNodes, ruleDrivenNodes);

  const tree = allTopNodes.length > 0
    ? { name: 'root', type: 'directory', kind: 'root', children: allTopNodes }
    : null;

  // 全ファイル一覧を収集
  const files = collectFiles(tree, []);

  return { tree, nodeToDir, files };
}

/**
 * kind→ディレクトリルールに該当するルートレベルのノードを収集する
 */
function findRuleDrivenNodes(graph, hierarchy, lang, resolveFileNameFn, deduplicateFileNames) {
  const nodes = graph.nodes || [];
  const result = [];

  for (const node of nodes) {
    const dirName = resolveDirForNode(node, hierarchy);
    // ルールに該当し、かつルート階層に含まれていないノード
    if (dirName && !BACKBONE_KINDS.has(node.kind || '')) {
      const fileName = resolveFileNameFn(node, lang);
      result.push({
        name: dirName,
        type: 'directory',
        kind: node.kind || '',
        mappedNodeIds: [node.id],
        children: [{
          name: fileName,
          type: 'file',
          kind: node.kind || '',
          mappedNodeIds: [node.id],
        }],
      });
    }
  }

  return result;
}

/**
 * 同階層のノードを名前でマージする
 * 同名ディレクトリがあれば子を統合する
 */
function mergeTopLevelNodes(backboneNodes, ruleDrivenNodes) {
  const merged = {};

  for (const node of [...backboneNodes, ...ruleDrivenNodes]) {
    if (!merged[node.name]) {
      merged[node.name] = node;
    } else {
      // 同名ディレクトリ → 子をマージ
      const existing = merged[node.name];
      if (node.children) {
        existing.children = existing.children || [];
        for (const child of node.children) {
          existing.children.push(child);
        }
      }
      if (node.mappedNodeIds) {
        existing.mappedNodeIds = existing.mappedNodeIds || [];
        existing.mappedNodeIds.push(...node.mappedNodeIds);
      }
    }
  }

  return Object.values(merged);
}

/**
 * ツリーから全ファイル一覧を再帰収集する
 */
function collectFiles(treeNode, pathSegments) {
  const files = [];
  if (!treeNode) return files;

  if (treeNode.type === 'file') {
    files.push({
      path: [...pathSegments, treeNode.name].join('/'),
      name: treeNode.name,
      kind: treeNode.kind || '',
      mappedNodeIds: treeNode.mappedNodeIds || [],
    });
  }

  if (treeNode.children) {
    const newPath = treeNode.type === 'directory'
      ? [...pathSegments, treeNode.name]
      : pathSegments;
    for (const child of treeNode.children) {
      files.push(...collectFiles(child, newPath));
    }
  }

  return files;
}

/**
 * 子ファイルの宣言スタブ（Rust pub mod / Go package / TS barrel）を生成する
 *
 * @param {object} dirNode - ディレクトリノード（{name, type, children}）
 * @param {string} lang - 言語名（'rust' | 'go' | 'typescript'）
 * @returns {string|null} 宣言文字列、子がない場合は null
 */
function generateDeclarationStub(dirNode, lang) {
  if (!dirNode || !dirNode.children || dirNode.children.length === 0) return null;

  const files = dirNode.children.filter(c => c.type === 'file');
  const subdirs = dirNode.children.filter(c => c.type === 'directory');
  const declarations = [];

  switch (lang) {
    case 'rust': {
      // mod.rs は self 宣言に相当するためスキップ
      const modDecls = files
        .filter(f => path.basename(f.name, '.rs') !== 'mod')
        .map(f => `pub mod ${path.basename(f.name, '.rs')};`);
      const subModDecls = subdirs.map(d => `pub mod ${d.name};`);
      declarations.push(...modDecls, ...subModDecls);
      break;
    }
    case 'go': {
      declarations.push(`package ${dirNode.name}`);
      break;
    }
    case 'typescript': {
      // index.ts は barrel 自身に相当するためスキップ
      const barrel = files
        .filter(f => path.basename(f.name, '.ts') !== 'index')
        .map(f => `export * from './${path.basename(f.name, '.ts')}';`);
      const subBarrel = subdirs.map(d => `export * from './${d.name}';`);
      declarations.push(...barrel, ...subBarrel);
      break;
    }
    default:
      return null;
  }

  return declarations.length > 0 ? declarations.join('\n') : null;
}

/**
 * Markdown レポートを生成する
 *
 * @param {object} graph - グラフオブジェクト
 * @param {object|null} dirsTree - buildDirectoryTree の戻り値 tree
 * @param {string} lang - 言語名
 * @returns {string} Markdown レポート
 */
function generateReport(graph, dirsTree, lang) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const langName = { rust: 'Rust', go: 'Go', typescript: 'TypeScript' }[lang] || lang;

  const lines = [];
  lines.push(`# ディレクトリツリーレポート（${langName}）`);
  lines.push('');
  lines.push(`生成日時: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 統計');
  lines.push('');
  lines.push(`- 総ノード数: ${nodes.length}`);
  lines.push(`- 総エッジ数: ${edges.length}`);
  lines.push(`- 対象言語: ${langName}`);

  // 全ファイル数を収集
  const files = dirsTree ? collectFiles(dirsTree, []) : [];
  lines.push(`- 生成ファイル数: ${files.length}`);

  // kind 別統計
  const kindCounts = {};
  for (const node of nodes) {
    const kind = node.kind || 'unknown';
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }
  lines.push('');
  lines.push('### kind 別ノード数');
  lines.push('');
  lines.push('| kind | ノード数 |');
  lines.push('|------|---------|');
  for (const [kind, count] of Object.entries(kindCounts).sort()) {
    lines.push(`| ${kind} | ${count} |`);
  }

  // ツリー構造
  if (dirsTree) {
    lines.push('');
    lines.push('## ディレクトリツリー');
    lines.push('');
    lines.push('```');
    lines.push(...renderTreeAscii(dirsTree));
    lines.push('```');
  }

  // ファイル一覧
  if (files.length > 0) {
    lines.push('');
    lines.push('## ファイル一覧');
    lines.push('');
    for (const file of files) {
      lines.push(`- ${file.path}`);
    }
  }

  return lines.join('\n');
}

/**
 * ディレクトリツリーを ASCII ツリー形式でレンダリングする
 *
 * @param {object} node - ツリーノード
 * @param {string} prefix - 行頭プレフィックス
 * @returns {string[]} ツリー行の配列
 */
function renderTreeAscii(node, prefix) {
  if (!node) return [];
  const lines = [];
  const name = node.name || '(unnamed)';
  const suffix = node.type === 'directory' ? '/' : '';
  lines.push(`${prefix || ''}${name}${suffix}`);

  if (node.children && node.children.length > 0) {
    for (let i = 0; i < node.children.length; i++) {
      const isLast = i === node.children.length - 1;
      const childPrefix = (prefix || '') + (isLast ? '    ' : '│   ');
      lines.push(
        ...renderTreeAscii(node.children[i], childPrefix)
          .map((l, idx) => idx === 0
            ? `${prefix || ''}${isLast ? '└── ' : '├── '}${l.slice((prefix || '').length)}`
            : l)
      );
    }
  }

  return lines;
}

module.exports = {
  KIND_FILE_RULES,
  INLINE_KINDS,
  BACKBONE_KINDS,
  buildDomainHierarchy,
  resolveDirForNode,
  resolveNodeToDirMap,
  buildDirectoryTree,
  generateDeclarationStub,
  generateReport,
  // テスト用
  collectFiles,
  mergeTopLevelNodes,
  renderTreeAscii,
};
