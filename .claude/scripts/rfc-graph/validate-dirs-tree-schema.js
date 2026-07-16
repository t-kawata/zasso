#!/usr/bin/env node
/**
 * validate-dirs-tree-schema.js — Dirs-Tree.json スキーマ検証スクリプト
 *
 * --dirs-tree=<path> --graph=<path> の形式で Dirs-Tree.json を検証する。
 * boundify-graph-to-dirs パイプラインの各 Step 終了時に自動実行される。
 * graphify の check-all-schema.js と同様の役割を担う。
 *
 * 検証項目（6項目）:
 *   1. JSON Schema 準拠 — schemaVersion, trees, dependencyDirections の存在
 *   2. 全 mappedNodeIds が元グラフに存在すること
 *   3. パスの重複がないこと
 *   4. 依存方向の from/to が実在のディレクトリパスであること
 *   5. ネスト深さが 4 を超えないこと
 *   6. 各ファイル名が言語の命名規則に従っていること
 *
 * 出力契約:
 *   正常時 → {"ok":true}（終了コード 0）
 *   異常時 → {"ok":false, "errors":[...]}（終了コード 1）
 *   異常時は stderr に 3 段テンプレートのエラーも出力する
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数
// ============================================================

/** 許可される最大ネスト深さ（ルートを 0 とする） */
const MAX_DEPTH = 4;

/** 言語別の想定拡張子マッピング */
const LANGUAGE_EXTENSIONS = Object.freeze({
  rust: '.rs',
  go: '.go',
  typescript: '.ts',
});

/** 対応言語の一覧 */
const SUPPORTED_LANGUAGES = Object.freeze(['rust', 'go', 'typescript']);

/** 3 段テンプレートエラー（stderr 用） — 引数不足時 */
const ERROR_MISSING_ARGS = '[ERROR] 引数が不足しています\n原因: --dirs-tree=<path> と --graph=<path> が必要\n対応: 両方の引数を指定して再実行';

// ============================================================
// 検証関数
// ============================================================

/**
 * Dirs-Tree.json の schemaVersion フィールドの存在を検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkSchemaVersion(dirsTree, errors) {
  if (!dirsTree.schemaVersion) {
    errors.push('schemaVersion が欠落しています');
  }
}

/**
 * Dirs-Tree.json の trees フィールドの存在を検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkTreesField(dirsTree, errors) {
  if (!dirsTree.trees) {
    errors.push('trees が欠落しています');
  }
}

/**
 * Dirs-Tree.json の dependencyDirections フィールドの存在を検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkDependencyDirectionsField(dirsTree, errors) {
  if (!dirsTree.dependencyDirections) {
    errors.push('dependencyDirections が欠落しています');
  }
}

/**
 * 必須フィールド 3 項目（schemaVersion, trees, dependencyDirections）の存在を検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkRequiredFields(dirsTree, errors) {
  checkSchemaVersion(dirsTree, errors);
  checkTreesField(dirsTree, errors);
  checkDependencyDirectionsField(dirsTree, errors);
}

/**
 * ツリー内の全 mappedNodeIds が元グラフに存在することを再帰的に検証する
 *
 * @param {object} node — 現在の DirNode
 * @param {Set<string>} allNodeIds — 元グラフの全ノードID 集合
 * @param {string} pathStr — 現在のパス（エラーメッセージ用）
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkNodeIds(node, allNodeIds, pathStr, errors) {
  if (node.mappedNodeIds) {
    for (const entry of node.mappedNodeIds) {
      // mappedNodeIds はオブジェクト {nodeId, title} 形式と文字列 nodeId 形式の両方を許容する
      const nodeId = typeof entry === 'object' ? entry.nodeId : entry;
      if (!allNodeIds.has(nodeId)) {
        errors.push(
          `存在しないノードID "${nodeId}" が "${pathStr}" の mappedNodeIds で参照されています`
        );
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      checkNodeIds(child, allNodeIds, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * ツリー内の全パスが重複していないことを検証する
 *
 * 同一言語ツリー内で同名の兄弟ノード（file/directory）が存在する場合、
 * パス重複とみなす。
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkPathDuplication(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;

    checkNodeNameDuplication(tree, lang, errors);
  }
}

/**
 * 指定ノード配下の兄弟間で重複する名前がないか再帰的に検証する
 *
 * @param {object} node — 現在の DirNode
 * @param {string} pathStr — パス文字列（エラーメッセージ用）
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkNodeNameDuplication(node, pathStr, errors) {
  if (!node.children) return;

  const seenNames = new Set();
  for (const child of node.children) {
    if (seenNames.has(child.name)) {
      errors.push(
        `パス重複: "${pathStr}" 配下に同名ノード "${child.name}" が複数存在します`
      );
    }
    seenNames.add(child.name);
  }

  // 子ノードの配下も再帰的にチェック
  for (const child of node.children) {
    if (child.children) {
      checkNodeNameDuplication(child, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * ツリーのネスト深さが MAX_DEPTH を超えないことを再帰的に検証する
 *
 * @param {object} node — 現在の DirNode
 * @param {number} depth — 現在の深さ（ルートを 0 とする）
 * @param {string} pathStr — 現在のパス（エラーメッセージ用）
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkDepth(node, depth, pathStr, errors) {
  if (depth > MAX_DEPTH) {
    errors.push(`ネスト深さ制限(${MAX_DEPTH})超過: "${pathStr}"（深さ ${depth}）`);
  }
  if (node.children) {
    for (const child of node.children) {
      checkDepth(child, depth + 1, `${pathStr}/${child.name}`, errors);
    }
  }
}

/**
 * 全言語ツリーの全ノードのネスト深さを検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkAllDepths(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkDepth(tree, 0, `${lang}/${tree.name}`, errors);
  }
}

/**
 * 各言語ツリーのファイル名が言語の命名規則（拡張子）に従っていることを検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkNamingConventions(dirsTree, errors) {
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;

    const expectedExtension = LANGUAGE_EXTENSIONS[lang];
    checkNodeNaming(tree, lang, expectedExtension, errors);
  }
}

/**
 * 指定ノード配下の全ファイルの拡張子を再帰的に検証する
 *
 * directory ノードは拡張子チェックの対象外。
 * file ノードのみ、対応言語の想定拡張子と一致することを確認する。
 *
 * @param {object} node — 現在の DirNode
 * @param {string} lang — 言語名（rust/go/typescript）
 * @param {string} expectedExt — 期待される拡張子（例: ".rs"）
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkNodeNaming(node, lang, expectedExt, errors) {
  if (node.type === 'file') {
    const actualExtension = path.extname(node.name);
    if (actualExtension !== expectedExt) {
      errors.push(
        `${lang} ファイルの拡張子が "${expectedExt}" ではありません: "${node.name}"（拡張子: "${actualExtension}"）`
      );
    }
  }
  if (node.children) {
    for (const child of node.children) {
      checkNodeNaming(child, lang, expectedExt, errors);
    }
  }
}

/**
 * ファイル名が slug 形式（lower_snake_case + 拡張子）に従っていることを検証する
 *
 * PX-24 スキーマで導入された slug フィールドにより、ファイル名は
 * <slug><.ext> の形式になる。slug 部分は lower_snake_case に従う。
 * 拡張子が期待値と一致するかのチェックは checkNodeNaming が担当。
 *
 * @param {object} node — 現在の DirNode
 * @param {string} pathStr — パス文字列（エラーメッセージ用）
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkSlugConvention(node, pathStr, errors) {
  if (node.type === 'file') {
    const baseName = path.basename(node.name, path.extname(node.name));
    // slug パターン: lower_snake_case（英小文字・数字・アンダースコアのみ、先頭は英小文字）
    const slugPattern = /^[a-z][a-z0-9_]*$/;
    if (baseName === '' || baseName === 'unnamed') {
      // 空または unnamed はフォールバック名として許容する
      return;
    }
    if (!slugPattern.test(baseName)) {
      errors.push(
        `ファイル名が slug 形式（lower_snake_case）に従っていません: "${pathStr}/${node.name}"（ベース名: "${baseName}"）`
      );
    }
  }
  if (node.children) {
    for (const child of node.children) {
      const childPath = pathStr + '/' + child.name;
      checkSlugConvention(child, childPath, errors);
    }
  }
}

/**
 * 全言語の dependencyDirections が参照するディレクトリパスが実在することを検証する
 *
 * @param {object} dirsTree — 検証対象の Dirs-Tree.json オブジェクト
 * @param {string[]} errors — エラー蓄積用配列（副作用で追加）
 */
function checkDependencyDirections(dirsTree, errors) {
  const allDirectoryPaths = collectAllDirectoryPaths(dirsTree);

  const dependencyDirections = dirsTree.dependencyDirections;
  if (!dependencyDirections) return;

  for (const lang of SUPPORTED_LANGUAGES) {
    const directions = dependencyDirections[lang];
    if (!directions || !Array.isArray(directions)) continue;

    for (const direction of directions) {
      if (!allDirectoryPaths.has(direction.from)) {
        errors.push(
          `dependencyDirections.${lang} に存在しないディレクトリ from が参照されています: "${direction.from}"`
        );
      }
      if (!allDirectoryPaths.has(direction.to)) {
        errors.push(
          `dependencyDirections.${lang} に存在しないディレクトリ to が参照されています: "${direction.to}"`
        );
      }
    }
  }
}

/**
 * 全言語ツリーからディレクトリノードのパスを収集して Set で返す
 *
 * @param {object} dirsTree — Dirs-Tree.json オブジェクト
 * @returns {Set<string>} ディレクトリパスの集合
 */
function collectAllDirectoryPaths(dirsTree) {
  const allDirectoryPaths = new Set();

  function collectDirPaths(node, prefix) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'directory') {
      allDirectoryPaths.add(currentPath);
      if (node.children) {
        for (const child of node.children) {
          collectDirPaths(child, currentPath);
        }
      }
    }
  }

  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    collectDirPaths(tree, '');
  }

  return allDirectoryPaths;
}

/**
 * Dirs-Tree.json の全 6 項目を検証する
 *
 * @param {string} dirsTreePath — Dirs-Tree.json のファイルパス
 * @param {string} graphPath — 元グラフ JSON のファイルパス
 * @returns {{ok: boolean, errors?: string[]}} 検証結果
 */
function validateFiles(dirsTreePath, graphPath) {
  const errors = [];

  // ファイルの存在確認
  if (!fs.existsSync(dirsTreePath)) {
    console.error(`[ERROR] Dirs-Tree.json not found\nCause: File does not exist at specified path\nAction: Verify path and re-run: ${dirsTreePath}`);
    return { ok: false, errors: [`Dirs-Tree.json not found: ${dirsTreePath}`] };
  }
  if (!fs.existsSync(graphPath)) {
    console.error(`[ERROR] Graph JSON not found\nCause: File does not exist at specified path\nAction: Verify path and re-run: ${graphPath}`);
    return { ok: false, errors: [`Graph JSON not found: ${graphPath}`] };
  }

  // JSON パース
  let dirsTree;
  let graph;
  try {
    dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf-8'));
  } catch (parseError) {
    console.error(`[ERROR] Dirs-Tree.json parse failed\nCause: ${parseError.message}\nAction: Verify the file is valid JSON`);
    return { ok: false, errors: [`Dirs-Tree.json parse error: ${parseError.message}`] };
  }
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  } catch (parseError) {
    console.error(`[ERROR] Graph JSON parse failed\nCause: ${parseError.message}\nAction: Verify the file is valid JSON`);
    return { ok: false, errors: [`Graph JSON parse error: ${parseError.message}`] };
  }

  const allNodeIds = new Set(graph.nodes.map(node => node.id));

  // 検証 1: 必須フィールド
  checkRequiredFields(dirsTree, errors);

  // 検証 2: mappedNodeIds
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkNodeIds(tree, allNodeIds, `${lang}/${tree.name}`, errors);
  }

  // 検証 3: パス重複
  checkPathDuplication(dirsTree, errors);

  // 検証 4: ネスト深さ
  checkAllDepths(dirsTree, errors);

  // 検証 5: ファイル命名規則
  checkNamingConventions(dirsTree, errors);

  // 検証 5b: slug 命名規則（lower_snake_case）
  // PX-24 以降のスキーマではファイル名が slug + 拡張子の形式になるため、
  // slug 部分が lower_snake_case に従っていることを確認する。
  for (const lang of SUPPORTED_LANGUAGES) {
    const tree = dirsTree.trees && dirsTree.trees[lang];
    if (!tree) continue;
    checkSlugConvention(tree, `${lang}/${tree.name}`, errors);
  }

  // 検証 6: dependencyDirections パス存在確認
  checkDependencyDirections(dirsTree, errors);

  // エラーがある場合、先頭に修正優先順位の指示を追加する
  if (errors.length > 0) {
    errors.unshift(
      `---\n${errors.length}件の検証エラーがあります。上から順に1件ずつ修正し、その都度再実行してください。\n修正手順:\n  1. 先頭のエラーから修正を開始してください\n  2. 1件修正するごとに本スクリプトを再実行し、エラーが減ったことを確認してください\n  3. 全エラーが解消されるまで繰り返してください\n---`
    );
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true };
}

/**
 * CLI エントリポイント。コマンドライン引数をパースして検証を実行する
 *
 * @param {string[]} [testArgs] — テスト用の引数配列（省略時は process.argv を使用）
 */
function validate(testArgs) {
  const args = testArgs || process.argv.slice(2);

  const dirsTreeFlag = args.find(arg => arg.startsWith('--dirs-tree='));
  const graphFlag = args.find(arg => arg.startsWith('--graph='));

  if (!dirsTreeFlag || !graphFlag) {
    console.error(ERROR_MISSING_ARGS);
    process.exit(1);
  }

  const dirsTreePath = path.resolve(dirsTreeFlag.slice('--dirs-tree='.length));
  const graphPath = path.resolve(graphFlag.slice('--graph='.length));

  const result = validateFiles(dirsTreePath, graphPath);

  if (result.ok) {
    // 出力契約: stdout に JSON 結果を出力
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  } else {
    console.error(
      `[ERROR] スキーマ検証に失敗しました\n原因: ${result.errors.length} 件の違反\n対応: 各エラーを修正してから次の Step に進んでください`
    );
    // 出力契約: stdout にエラー情報を含む JSON 結果を出力
    process.stdout.write(JSON.stringify({ ok: false, errors: result.errors }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  validate();
}

module.exports = { validate, validateFiles };
