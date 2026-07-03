#!/usr/bin/env node
/**
 * add-ref-pointer.js — Anchor Marker 登録スクリプト
 *
 * AI がコマンドライン引数で行範囲を RFC-TREE.json に記録するための窓口。
 * RFC-TREE.json を直接編集させず、このスクリプト経由でのみ refPointers を操作する。
 *
 * 使用例:
 *   node add-ref-pointer.js RFC-TREE.json "01" add --id "01-001" --lineStart 292 --lineEnd 306
 *   node add-ref-pointer.js RFC-TREE.json "01" batch '[{"id":"01-001","lineStart":292,"lineEnd":306}]'
 *   node add-ref-pointer.js RFC-TREE.json "01" remove "01-001"
 *   node add-ref-pointer.js RFC-TREE.json "01" list
 */
const fs = require("fs");
const path = require("path");

const ID_PATTERN = /^\d{2}-\d{3}$/;

// [::STUB::] 要解決: マーカー文字列は将来的に generate-child-rfcs.js と共有定数化する
const CMD_ADD = "add";
const CMD_BATCH = "batch";
const CMD_REMOVE = "remove";
const CMD_LIST = "list";
const VALID_COMMANDS = [CMD_ADD, CMD_BATCH, CMD_REMOVE, CMD_LIST];

/**
 * スクリプト使用方法を標準出力に表示する。
 */
function printUsage() {
  console.log(`使用方法:
  node add-ref-pointer.js <RFC-TREE.json> <childId> add --id <id> --lineStart <n> --lineEnd <n>
  node add-ref-pointer.js <RFC-TREE.json> <childId> batch '<json_array>'
  node add-ref-pointer.js <RFC-TREE.json> <childId> remove <id>
  node add-ref-pointer.js <RFC-TREE.json> <childId> list`);
}

/**
 * エラー内容を JSON で出力して終了する。
 * @param {string} message - エラーメッセージ
 */
function fail(message) {
  console.log(JSON.stringify({ success: false, error: message }));
  process.exit(1);
}

/**
 * RFC-TREE.json を読み込む。
 * @param {string} filePath - JSON ファイルのパス
 * @returns {object} パースされた JSON オブジェクト
 */
function loadTree(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fail(`ファイルが見つかりません: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

/**
 * RFC-TREE.json を書き込む（排他的な保存窓口）。
 * @param {string} filePath - JSON ファイルのパス
 * @param {object} data - 書き込むデータ
 */
function saveTree(filePath, data) {
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * childId に対応する childNode を finalTree から検索する。
 * @param {object[]} tree - finalTree 配列
 * @param {string} childId - 2桁0埋めの子ID
 * @returns {object|null} 見つかった childNode、なければ null
 */
function findChild(tree, childId) {
  return tree.find(function(n) { return n.childId === childId; }) || null;
}

/**
 * 1件の refPointer を子ノードに追加する。
 * @param {object} child - 子ノード
 * @param {string} id - マーカーID（{childId}-{seq}）
 * @param {number} lineStart - 開始行番号
 * @param {number} lineEnd - 終了行番号
 */
function addRefPointer(child, id, lineStart, lineEnd) {
  if (!child.refPointers) {
    child.refPointers = [];
  }
  var exists = child.refPointers.some(function(r) { return r.id === id; });
  if (exists) {
    fail("ID 重複: childId=" + child.childId + ", id=" + id + " は既に登録されています");
  }
  child.refPointers.push({ id: id, lineStart: lineStart, lineEnd: lineEnd });
}

/**
 * バッチモードで複数の refPointer を追加する。
 * @param {object} child - 子ノード
 * @param {object[]} entries - refPointer エントリの配列
 */
function batchAddRefPointers(child, entries) {
  if (!Array.isArray(entries)) {
    fail("batch モードの入力は JSON 配列である必要があります");
  }
  entries.forEach(function(entry, i) {
    if (!entry.id || !ID_PATTERN.test(entry.id)) {
      fail("batch[" + i + "]: id が不正です（期待形式: {childId}-{seq}, 例: 01-001）");
    }
    if (typeof entry.lineStart !== "number" || entry.lineStart < 1) {
      fail("batch[" + i + "]: lineStart が不正です（1以上の数値が必要）");
    }
    if (typeof entry.lineEnd !== "number" || entry.lineEnd < entry.lineStart) {
      fail("batch[" + i + "]: lineEnd が不正です（lineStart 以上の数値が必要）");
    }
    addRefPointer(child, entry.id, entry.lineStart, entry.lineEnd);
  });
}

/**
 * 指定された id の refPointer を子ノードから削除する。
 * @param {object} child - 子ノード
 * @param {string} id - 削除するマーカーID
 */
function removeRefPointer(child, id) {
  if (!child.refPointers) {
    fail("削除対象なし: childId=" + child.childId + " に refPointers が存在しません");
  }
  var index = -1;
  child.refPointers.some(function(r, i) {
    if (r.id === id) { index = i; return true; }
    return false;
  });
  if (index === -1) {
    fail("削除対象なし: childId=" + child.childId + ", id=" + id + " は見つかりません");
  }
  child.refPointers.splice(index, 1);
  if (child.refPointers.length === 0) {
    delete child.refPointers;
  }
}

/**
 * 子ノードの refPointers 一覧を標準出力に表示する。
 * @param {object} child - 子ノード
 */
function listRefPointers(child) {
  var pointers = child.refPointers || [];
  console.log(JSON.stringify({
    success: true,
    childId: child.childId,
    childName: child.name || "",
    count: pointers.length,
    refPointers: pointers
  }, null, 2));
}

// === メイン処理 ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 3) {
    printUsage();
    process.exit(1);
  }

  var treePath = args[0];
  var childId = args[1];
  var command = args[2];

  if (!ID_PATTERN.test(childId + "-000")) {
    // childId 単体では /^\d{2}$/ のパターンだが、ID_PATTERN は /^\d{2}-\d{3}$/
    // 簡易チェックとして先頭2桁が数字か確認
    if (!/^\d{2}$/.test(childId)) {
      fail("childId が不正です（2桁の数字が必要, 例: 01）");
    }
  }

  if (VALID_COMMANDS.indexOf(command) === -1) {
    fail("不明なコマンド: " + command + "（有効: " + VALID_COMMANDS.join(", ") + "）");
  }

  var treeData = loadTree(treePath);
  var finalTree = treeData.finalTree;
  if (!finalTree || !Array.isArray(finalTree)) {
    fail("RFC-TREE.json に finalTree が存在しません");
  }

  var child = findChild(finalTree, childId);
  if (!child) {
    fail("childId=" + childId + " が RFC-TREE.json の finalTree に見つかりません");
  }

  if (command === CMD_ADD) {
    var addIdx = args.indexOf("--id");
    var lsIdx = args.indexOf("--lineStart");
    var leIdx = args.indexOf("--lineEnd");
    if (addIdx === -1 || lsIdx === -1 || leIdx === -1) {
      fail("add モードには --id, --lineStart, --lineEnd が必須です");
    }
    var id = args[addIdx + 1];
    var lineStart = parseInt(args[lsIdx + 1], 10);
    var lineEnd = parseInt(args[leIdx + 1], 10);

    if (!id || !ID_PATTERN.test(id)) {
      fail("id が不正です（期待形式: {childId}-{seq}, 例: 01-001）");
    }
    if (isNaN(lineStart) || lineStart < 1) {
      fail("lineStart が不正です（1以上の数値が必要）");
    }
    if (isNaN(lineEnd) || lineEnd < lineStart) {
      fail("lineEnd が不正です（lineStart 以上の数値が必要）");
    }

    addRefPointer(child, id, lineStart, lineEnd);
    saveTree(treePath, treeData);
    console.log(JSON.stringify({ success: true, childId: childId, action: "add", id: id,
      lineStart: lineStart, lineEnd: lineEnd, refPointers: child.refPointers }));

  } else if (command === CMD_BATCH) {
    var jsonStr = args[3];
    if (!jsonStr) {
      fail("batch モードには JSON 配列文字列が必須です");
    }
    var entries;
    try {
      entries = JSON.parse(jsonStr);
    } catch (e) {
      fail("batch モードの JSON パースエラー: " + e.message);
    }
    batchAddRefPointers(child, entries);
    saveTree(treePath, treeData);
    console.log(JSON.stringify({ success: true, childId: childId, action: "batch",
      count: entries.length, refPointers: child.refPointers }));

  } else if (command === CMD_REMOVE) {
    var removeId = args[3];
    if (!removeId) {
      fail("remove モードには削除する id が必須です");
    }
    removeRefPointer(child, removeId);
    saveTree(treePath, treeData);
    console.log(JSON.stringify({ success: true, childId: childId, action: "remove",
      id: removeId, refPointers: child.refPointers || [] }));

  } else if (command === CMD_LIST) {
    listRefPointers(child);
  }
}

if (require.main === module) {
  main();
}
