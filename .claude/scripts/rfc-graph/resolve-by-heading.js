#!/usr/bin/env node

/**
 * resolve-by-heading.js — Locate positions in a file by heading level + token array
 *
 * Successor to embed-markers.js + query.js resolveCurrentLines.
 * Instead of embedding line number markers in the source file, dynamically
 * locates positions using heading levels and token arrays.
 *
 * CLI: resolve-by-heading.js --source=<path> --heading=<N> --texts="t1,t2,..."
 *   Or: resolve-by-heading.js --graph=<path> --source=<path> (batch resolve all nodes)
 *
 * Matching algorithm (4-phase fallback):
 *   1. ^#{N} + texts[0] → 1 line? → exact
 *   2. + texts[1] → 1 line? → exact
 *   3. + texts[2] → 1 line? → partial
 *   4. All texts → 1 line? → partial
 *   Multiple lines → prefer the one with larger heading. Same heading → grep with texts.join
 *   Still multiple/zero → error exit
 */

const fs = require('fs');
const path = require('path');

function exitWithError(summary, cause, action) {
  process.stderr.write(`[ERROR] ${summary}\n原因: ${cause}\n対応: ${action}\n`);
  process.exit(1);
}

/**
 * Identify the line from heading+tokens using 4-phase fallback
 *
 * @param {string[]} sourceLines — Array of file lines
 * @param {number} heading — Heading level (0 through 6)
 * @param {string[]} texts — Token array (e.g. ["6.1", "Crate", "responsibility-split"])
 * @returns {{ line: number, confidence: string } | null}
 *   line: 1-based line number. null if unresolvable
 *   confidence: "exact" | "partial" | null
 */
function resolveByHeading(sourceLines, heading, texts) {
  if (!Array.isArray(texts) || texts.length === 0) return null;

  // Build heading level pattern (heading=0 is special: near file top)
  let headingPattern;
  if (heading === 0) {
    headingPattern = /^/; // File top (within line 5 or until first blank line)
  } else {
    headingPattern = new RegExp(`^#{${heading}}\\s+`);
  }

  // 4-phase fallback
  for (let phase = 1; phase <= 4; phase++) {
    const searchTexts = texts.slice(0, phase);
    const matchingLines = [];

    for (let i = 0; i < sourceLines.length; i++) {
      const line = sourceLines[i];
      // Filter by heading level
      if (heading > 0 && !headingPattern.test(line)) continue;
      if (heading === 0 && i > 5 && line.trim() === '') continue; // Within first 5 lines or until first blank line

      // Check if all searchTexts appear in the line
      const allMatch = searchTexts.every(t => line.includes(t));
      if (allMatch) {
        matchingLines.push({ line: i + 1, text: line });
      }
    }

    if (matchingLines.length === 1) {
      return { line: matchingLines[0].line, confidence: phase <= 2 ? 'exact' : 'partial' };
    }

    if (matchingLines.length > 1) {
      // Multiple matches: prefer deeper heading (more specific)
      // Same heading → concatenate texts and re-grep
      const joined = texts.join('');
      const joinedMatches = matchingLines.filter(m => m.text.includes(joined));
      if (joinedMatches.length === 1) {
        return { line: joinedMatches[0].line, confidence: 'partial' };
      }
      // Still multiple → error
      return null;
    }
    // 0 matches → proceed to next phase
  }

  return null; // No match across all phases
}

/**
 * Resolve all headingRefs for all nodes in a graph JSON
 *
 * @param {Object} graph — Graph data
 * @param {string} sourcePath — Path to the source file
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

  if (!result.sourcePath) throw new Error('--source=<path> が必要です。');
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
    // Batch resolve all nodes in the graph
    const graph = JSON.parse(fs.readFileSync(parsed.graphPath, 'utf8'));
    const results = resolveAllHeadings(graph, parsed.sourcePath);
    console.log(JSON.stringify(results, null, 2));
  } else if (parsed.heading !== undefined && parsed.texts) {
    // Single resolution
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
