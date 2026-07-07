#!/usr/bin/env node

/**
 * boundify-helpers.js — boundify-graph-to-dirs の内部純粋関数群
 *
 * 本モジュールは P17-1（4純粋関数一括）の実装である。
 * すべての関数は外部I/Oを持たない純粋関数として設計される。
 *
 * @module boundify-helpers
 */

// ============================================================
// Dirs-Tree.json 完全JSON Schema
// RFC-BOUNDIFY.md Appendix A からの完全な移植
// ============================================================

/** Dirs-Tree.json のJSON Schema定義 */
const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DirsTree',
  type: 'object',
  required: ['schemaVersion', 'generatedAt', 'sourceGraph', 'analysis', 'trees', 'dependencyDirections', 'warnings'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+$' },
    generatedAt: { type: 'string', format: 'date-time' },
    sourceGraph: { type: 'string' },
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
          description: 'ディレクトリノードのみ有効。ファイルノードでは使用しない。',
          type: 'object',
          properties: {
            rust: { type: 'string' },
            go: { type: 'string' },
            typescript: { type: 'string' }
          }
        },
        mappedNodeIds: { type: 'array', items: { type: 'string' } },
        role: { type: 'string' },
        declarationStub: { type: 'string' },
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
    }
  }
};

// ============================================================
// SAFE_BOUNDARIES_EN_TEXT 定数
// RFC-BOUNDIFY.md §3.2 に基づく英文 safe boundaries 説明
// ============================================================

/** ディレクトリと名前空間で構築された安全な境界を説明する英文テキスト */
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
// グラフ → 言語収集
// graphToLangJson の後継: PX-24 で追加されたノードの
// language フィールドを直接読み取る（推論は行わない）。
// ============================================================

/**
 * グラフ全ノードの language フィールドを収集し、マップとユニーク言語リストを返す。
 *
 * PX-24 でスキーマに追加された language フィールド（単一値）を直接読み取る。
 * 言語推論（inferLanguage）は行わない。language 未設定のノードは無視される。
 * 全ノードが language 未設定の場合は graph.mainLanguage をフォールバックとして使用する。
 *
 * @param {{ mainLanguage?: string, nodes: object[] }} graph - 入力グラフ
 * @returns {{ languageMap: object, languages: string[] }}
 *   languageMap: ノードID → language 値（string）のマップ
 *   languages: 使用する言語値のユニーク配列（少なくとも1件）
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

  // フォールバック: 全ノードが language 未設定の場合のみ mainLanguage を使用
  if (languageSet.size === 0 && graph.mainLanguage && typeof graph.mainLanguage === "string") {
    languageSet.add(graph.mainLanguage);
  }

  return {
    languageMap,
    languages: Array.from(languageSet),
  };
}

// ============================================================
// ノード間エッジ → ディレクトリ間エッジの投影
// RFC-BOUNDIFY.md §3.6 からの完全な移植
// ============================================================

/**
 * 方向性を持つエッジ種別の集合（これら以外のエッジは投影対象外）。
 */
const DIRECTIONAL_EDGE_TYPES = new Set([
  'depends_on',
  'implements',
  'references',
  'extends',
  'constrains'
]);

/**
 * ノード間エッジを、ノード→ディレクトリのマッピングテーブルを用いて
 * ディレクトリ間エッジに投影する。
 *
 * @param {{ from: string, to: string, type: string }[]} graphEdges - グラフのエッジ配列
 * @param {object} nodeToDirMap - ノードID → ディレクトリパスのマッピング
 * @returns {{ from: string, to: string, type: string, evidence: string }[]}
 */
function projectEdgesToDirectories(graphEdges, nodeToDirMap) {
  const dirEdges = [];

  for (const edge of graphEdges) {
    const fromDir = nodeToDirMap[edge.from];
    const toDir = nodeToDirMap[edge.to];

    // マッピング未解決のノードはスキップ
    if (!fromDir || !toDir) continue;
    // 同一ディレクトリ内のエッジはスキップ
    if (fromDir === toDir) continue;
    // 方向性のあるエッジ種別のみ対象
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
// 循環依存の検出（Tarjan SCC）
// RFC-BOUNDIFY.md §3.6 からの完全な移植
// ============================================================

/**
 * 投影されたディレクトリ間有向グラフに対してTarjanの強連結成分分解（SCC）を適用する。
 * サイズが1より大きいSCCのみを循環として報告する。
 *
 * @param {{ from: string, to: string }[]} dirEdges - ディレクトリ間エッジ配列
 * @returns {{ cycle: string[] }[]} 検出された循環の配列
 */
function tarjanSCC(dirEdges) {
  // 隣接リストを構築
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
      // サイズ > 1 の SCC のみを循環として報告
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
// ファイル名構築用定数
// slug + 拡張子でファイル名を構築するために使用。
// titleToFileName は PX-25 で削除された。代わりにノードの
// slug フィールドをそのままファイル名ベースとして使用する。
// ============================================================

/**
 * 言語別の拡張子マッピング。
 */
const LANGUAGE_EXTENSIONS = {
  rust: '.rs',
  go: '.go',
  typescript: '.ts'
};

/**
 * 言語別のセパレータ（Rust/Go はアンダースコア、TypeScript はハイフン）。
 * slug は lower_snake_case のため、ディレクトリ名などでのみ使用する。
 */
const LANGUAGE_SEPARATORS = {
  rust: '_',
  go: '_',
  typescript: '-'
};

/**
 * 最大ファイル名長（拡張子を除く）。
 */
const MAX_FILE_NAME_LENGTH = 48;

// ============================================================
// 重複ファイル名の解決（フォールバック用）
// slug による一意化が原則だが、古いグラフとの互換性のために維持。
// ============================================================

/**
 * 同一ディレクトリ内で重複するファイル名にサフィックス（_1, _2）を付与する。
 *
 * @param {{ name: string }[]} files - ファイルノード配列
 * @param {string} language - 対象言語
 * @returns {{ name: string }[]} 重複解決後のファイルノード配列
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
// モジュールエクスポート
// ============================================================

module.exports = {
  SCHEMA,
  SAFE_BOUNDARIES_EN_TEXT,
  collectLanguagesFromGraph,
  projectEdgesToDirectories,
  tarjanSCC,
  deduplicateFileNames,
  // テスト用に定数を露出（変更不可の意図）
  DIRECTIONAL_EDGE_TYPES,
  LANGUAGE_EXTENSIONS,
  LANGUAGE_SEPARATORS,
  MAX_FILE_NAME_LENGTH
};
