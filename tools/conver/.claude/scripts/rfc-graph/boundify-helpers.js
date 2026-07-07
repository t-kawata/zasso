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
// 言語推定ヒューリスティック
// RFC-BOUNDIFY.md §3.4 からの完全な移植
// ============================================================

/**
 * ノードのタイトルとサマリーから対象プログラミング言語を推定する。
 *
 * @param {{ title?: string, summary?: string, kind?: string }} node - グラフノード
 * @returns {string[]} 推定された言語の配列（'rust', 'go', 'typescript' から構成）
 */
function inferLanguage(node) {
  const title = (node.title || '');
  const summary = (node.summary || '');
  const text = (title + ' ' + summary).toLowerCase();

  // Rust 固有キーワード
  const rustPatterns = /\b(crate|mod\s|pub\s|unsafe|fn\s|impl\s|struct\s|enum\s|trait\s|cargo|#\[derive|::std::|mut\s|impl\s.+for\s|\.await)\b/;
  if (rustPatterns.test(text)) {
    return ['rust', 'go', 'typescript'];
  }

  // Go 固有キーワード
  const goPatterns = /\b(package|func\s|goroutine|interface\{\}|struct\s|defer\s|go func|select\s|\*\.\w+|\.\(\w+\))\b/;
  if (goPatterns.test(text)) {
    return ['go', 'typescript'];
  }

  // TypeScript 固有キーワード
  const tsPatterns = /\b(TypeScript|barrel|index\.ts|\.ts\b|interface\s|type\s|async\s+\w+\s*=>|React|Vue|Component|useState|useEffect)\b/;
  if (tsPatterns.test(text)) {
    return ['typescript'];
  }

  // kind ベースの補完
  const kind = node.kind || '';
  switch (kind) {
    case 'build_ci':
    case 'test_policy':
    case 'security':
    case 'glossary':
      return ['rust', 'go', 'typescript'];

    case 'rationale':
    case 'architecture':
      if (text.includes('rust') || text.includes('crate') || text.includes('ffi')) {
        return ['rust', 'go', 'typescript'];
      }
      return ['rust', 'go', 'typescript'];

    case 'requirement':
      return ['rust', 'go', 'typescript'];

    default:
      return ['rust', 'go', 'typescript'];
  }
}

// ============================================================
// グラフ → GRAPH-LANG.json 拡張
// ============================================================

/**
 * 入力グラフの全ノードに inferLanguage を適用し、language 注釈を追加する。
 *
 * @param {{ nodes: object[], edges: object[] }} graph - 入力グラフ
 * @param {Function} [inferFn] - 言語推定関数（省略時は inferLanguage）
 * @returns {{ nodes: object[], edges: object[], languageMap: object }}
 */
function graphToLangJson(graph, inferFn) {
  const fn = inferFn || inferLanguage;
  const nodes = (graph.nodes || []);
  const edges = (graph.edges || []);
  const languageMap = {};

  for (const node of nodes) {
    const nodeId = node.id;
    if (nodeId !== undefined && nodeId !== null) {
      languageMap[String(nodeId)] = fn(node);
    }
  }

  return { nodes, edges, languageMap };
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
// タイトル → ファイル名の決定
// RFC-BOUNDIFY.md §3.5（ノード→ファイル名の決定）および §4.6 からの移植
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

/**
 * ノードタイトルから言語別のファイル名を生成する。
 *
 * @param {string} title - ノードタイトル（例: "§15 Event Model"）
 * @param {string} language - 対象言語（"rust" | "go" | "typescript"）
 * @returns {string} 生成されたファイル名（例: "event_model.rs"）
 */
function titleToFileName(title, language) {
  // §プレフィックスと番号を除去
  const raw = String(title || '').replace(/^§\S+\s*/, '');

  // 言語別セパレータ
  const sep = LANGUAGE_SEPARATORS[language] || LANGUAGE_SEPARATORS.rust;
  // 言語別セパレータを許可文字に含める正規表現
  const allowedPattern = new RegExp('[^a-zA-Z0-9' + sep.replace(/-/g, '\\-') + ']', 'g');
  const multiSepPattern = new RegExp(sep + '+', 'g');
  const edgeSepPattern = new RegExp('^' + sep + '|' + sep + '$', 'g');

  const cleaned = raw
    .replace(allowedPattern, sep)
    .replace(multiSepPattern, sep)
    .replace(edgeSepPattern, '')
    .toLowerCase()
    .substring(0, MAX_FILE_NAME_LENGTH);

  // 言語別拡張子
  const ext = LANGUAGE_EXTENSIONS[language] || LANGUAGE_EXTENSIONS.rust;

  // 予約語による衝突回避: barrelファイル名は特殊扱い
  if (cleaned === 'mod' || cleaned === 'index') {
    return '_' + cleaned + ext;
  }

  return cleaned + ext;
}

// ============================================================
// 重複ファイル名の解決
// RFC-BOUNDIFY.md §3.5（衝突防止）からの移植
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
  const extPattern = new RegExp('\\.(' + Object.values(LANGUAGE_EXTENSIONS).map(function(e) { return e.slice(1); }).join('|') + ')$');
  const names = {};
  const result = [];

  for (const file of files) {
    const baseName = (file.name || '').replace(extPattern, '');
    if (names[baseName] !== undefined) {
      names[baseName]++;
      result.push({
        name: baseName + '_' + names[baseName] + ext
      });
    } else {
      names[baseName] = 0;
      result.push({
        name: baseName + ext
      });
    }
  }

  // 元のファイルオブジェクトのその他プロパティを保持（name のみ上書き）
  // 上記の単純化版では name のみを含むオブジェクトを返す。
  // 呼び出し元で他のプロパティが必要な場合、file.name を直接変更する方式に切り替える。
  return result;
}

// ============================================================
// モジュールエクスポート
// ============================================================

module.exports = {
  SCHEMA,
  SAFE_BOUNDARIES_EN_TEXT,
  inferLanguage,
  graphToLangJson,
  projectEdgesToDirectories,
  tarjanSCC,
  titleToFileName,
  deduplicateFileNames,
  // テスト用に定数を露出（変更不可の意図）
  DIRECTIONAL_EDGE_TYPES,
  LANGUAGE_EXTENSIONS,
  MAX_FILE_NAME_LENGTH
};
