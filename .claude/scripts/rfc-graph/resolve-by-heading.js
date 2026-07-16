#!/usr/bin/env node

/**
 * resolve-by-heading.js — 見出しレベル+トークン列によるファイル内位置特定
 *
 * embed-markers.js + query.js resolveCurrentLines の後継。
 * ソースファイルに行番号マーカーを埋め込む代わりに、見出しレベルと
 * トークン列を使って動的に位置を特定する。
 *
 * CLI: resolve-by-heading.js --source=<path> --heading=<N> --texts="t1,t2,..."
 *   または: resolve-by-heading.js --graph=<path> --source=<path> （全ノード一括解決）
 *
 * 照合アルゴリズム（4段階フォールバック）:
 *   1. ^#{N} + texts[0] → 1行? → exact
 *   2. + texts[1] → 1行? → exact
 *   3. + texts[2] → 1行? → partial
 *   4. 全 texts → 1行? → partial
 *   複数行 → heading が大きい方を正とする。heading も同じ → texts.join で grep
 *   それでも複数/0 → エラー終了
 */

const fs = require('fs');
const path = require('path');

function exitWithError(summary, cause, action) {
  process.stderr.write(`[ERROR] ${summary}\nCause: ${cause}\nAction: ${action}\n`);
  process.exit(1);
}

/**
 * 4段階フォールバックで heading+tokens から行を特定する
 *
 * @param {string[]} sourceLines — ファイルの行配列
 * @param {number} heading — 見出しレベル（0〜6）
 * @param {string[]} texts — トークン列（["6.1", "Crate", "責務分割"]）
 * @returns {{ line: number, confidence: string } | null}
 *   line: 1-based 行番号。null の場合は特定不能
 *   confidence: "exact" | "partial" | null
 */
function resolveByHeading(sourceLines, heading, texts) {
  if (!Array.isArray(texts) || texts.length === 0) return null;

  // headingレベルのパターンを作成（heading=0は特殊: ファイル先頭付近）
  let headingPattern;
  if (heading === 0) {
    headingPattern = /^/; // ファイル先頭（行番号5以内 or 最初の空行まで）
  } else {
    headingPattern = new RegExp(`^#{${heading}}\\s+`);
  }

  // 4段階フォールバック
  for (let phase = 1; phase <= 4; phase++) {
    const searchTexts = texts.slice(0, phase);
    const matchingLines = [];

    for (let i = 0; i < sourceLines.length; i++) {
      const line = sourceLines[i];
      // heading レベルでフィルタ
      if (heading > 0 && !headingPattern.test(line)) continue;
      if (heading === 0 && i > 5 && line.trim() === '') continue; // 先頭5行以内 or 最初の空行まで

      // 全 searchTexts が行に含まれるか
      const allMatch = searchTexts.every(t => line.includes(t));
      if (allMatch) {
        matchingLines.push({ line: i + 1, text: line });
      }
    }

    if (matchingLines.length === 1) {
      return { line: matchingLines[0].line, confidence: phase <= 2 ? 'exact' : 'partial' };
    }

    if (matchingLines.length > 1) {
      // 複数マッチ: headingがより深い方を優先（より具体的な方）
      // heading も同じ → texts を連結して再 grep
      const joined = texts.join('');
      const joinedMatches = matchingLines.filter(m => m.text.includes(joined));
      if (joinedMatches.length === 1) {
        return { line: joinedMatches[0].line, confidence: 'partial' };
      }
      // それでも複数 → エラー
      return null;
    }
    // 0行 → 次のフェーズへ
  }

  return null; // 全フェーズでマッチせず
}

/**
 * グラフJSON内の全ノードの headingRefs を解決する
 *
 * @param {Object} graph — グラフデータ
 * @param {string} sourcePath — ソースファイルのパス
 * @returns {Array<{ refId: string, line: number, confidence: string } | { refId: string, error: string }>}
 */
function resolveAllHeadings(graph, sourcePath) {
  const sourceLines = fs.readFileSync(sourcePath, 'utf8').split('\n');
  const results = [];

  for (const node of graph.nodes) {
    if (!Array.isArray(node.headingRefs)) continue;
    for (const ref of node.headingRefs) {
      const resolved = resolveByHeading(sourceLines, ref.heading, ref.texts);
      if (resolved) {
        results.push({ refId: ref.refId, nodeId: node.id, line: resolved.line, confidence: resolved.confidence });
      } else {
        results.push({ refId: ref.refId, nodeId: node.id, error: '見出しの特定に失敗しました' });
      }
    }
  }
  return results;
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const result = {};

  for (const arg of args) {
    if (arg.startsWith('--source=')) result.sourcePath = arg.slice('--source='.length);
    else if (arg.startsWith('--graph=')) result.graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--heading=')) result.heading = parseInt(arg.slice('--heading='.length), 10);
    else if (arg.startsWith('--texts=')) result.texts = arg.slice('--texts='.length).split(',');
  }

  if (!result.sourcePath) throw new Error('--source=<path> is required.');
  return result;
}

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv);
  } catch (e) {
    exitWithError('引数のパースに失敗しました。', e.message, 'resolve-by-heading.js --source=<path> --heading=<N> --texts=t1,t2 または --graph=<path> --source=<path>');
  }

  const sourceLines = fs.readFileSync(parsed.sourcePath, 'utf8').split('\n');

  if (parsed.graphPath) {
    // グラフ全ノード一括解決
    const graph = JSON.parse(fs.readFileSync(parsed.graphPath, 'utf8'));
    const results = resolveAllHeadings(graph, parsed.sourcePath);
    console.log(JSON.stringify(results, null, 2));
  } else if (parsed.heading !== undefined && parsed.texts) {
    // 単一解決
    const result = resolveByHeading(sourceLines, parsed.heading, parsed.texts);
    if (result) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      exitWithError('見出しの特定に失敗しました。', `heading=${parsed.heading}, texts=[${parsed.texts.join(', ')}]`, 'ソースファイルの該当見出しが削除または改名された可能性があります。');
    }
  } else {
    exitWithError('引数が不足しています。', '--graph または --heading+--texts のいずれかが必要です。', 'resolve-by-heading.js --source=<path> --heading=<N> --texts=t1,t2');
  }
}

module.exports = { resolveByHeading, resolveAllHeadings, parseArguments };

if (require.main === module) main();
