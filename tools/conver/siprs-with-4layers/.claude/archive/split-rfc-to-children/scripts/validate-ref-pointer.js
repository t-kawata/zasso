#!/usr/bin/env node
/**
 * validate-ref-pointer.js — Anchor Marker リンク整合性検証スクリプト
 *
 * RFC-TREE.json と正典RFCのマーカーを照合し、以下の問題を検出する：
 *   1. 孤児マーカー（RFC-TREE.json が参照するマーカーが親RFCにない）
 *   2. 未参照マーカー（親RFCにマーカーがあるが RFC-TREE.json から未参照）
 *   3. ペア不整合（BEGIN に対応する END がない、または逆）
 *   4. 重複ID（同一IDの BEGIN が複数存在する）
 *   5. ネスト（BEGIN の中で別の BEGIN が開始されている）
 *
 * 使用例:
 *   node validate-ref-pointer.js <RFC-TREE.json>
 *   node validate-ref-pointer.js <RFC-TREE.json> --fix
 */
const fs = require("fs");
const path = require("path");

// [::STUB::] 要解決: マーカー文字列は将来的に generate-child-rfcs.js と共有定数化する
var MARKER_BEGIN = "REF-POINTER-BEGIN";
var MARKER_END = "REF-POINTER-END";
var MARKER_RE = /\[::(REF-POINTER-(BEGIN|END)-(\d{2}-\d{3}))::\]/g;

/**
 * エラーを統一フォーマットで標準出力に出力する。
 * @param {"ERROR"|"WARN"} level - エラーレベル
 * @param {string} file - ファイルパス
 * @param {number} line - 行番号
 * @param {string} markerId - マーカーID
 * @param {string} problem - 問題の説明
 * @param {string} fix - 修正方法の説明
 */
function emit(level, file, line, markerId, problem, fix) {
  var output = "[" + level + "] ファイル: " + file + "\n";
  if (line) {
    output += "          line: " + line + "\n";
  }
  if (markerId) {
    output += "          マーカーID: " + markerId + "\n";
  }
  output += "          問題: " + problem + "\n";
  output += "          修正: " + fix + "\n";
  console.log(output);
}

/**
 * RFC-TREE.json を読み込む。
 * @param {string} filePath - JSON ファイルのパス
 * @returns {{treeData: object, canonPath: string, treeRefs: object[]}}
 */
function loadInputs(filePath) {
  var resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.log(JSON.stringify({ success: false, error: "ファイルが見つかりません: " + resolved }));
    process.exit(1);
  }
  var treeData = JSON.parse(fs.readFileSync(resolved, "utf8"));

  var canonPath = treeData.canonicalRfcPath;
  if (!canonPath) {
    console.log(JSON.stringify({ success: false, error: "RFC-TREE.json に canonicalRfcPath がありません" }));
    process.exit(1);
  }
  var canonResolved = path.resolve(path.dirname(resolved), canonPath);
  if (!fs.existsSync(canonResolved)) {
    console.log(JSON.stringify({ success: false, error: "正典RFCが見つかりません: " + canonResolved }));
    process.exit(1);
  }

  // RFC-TREE.json の全ノードから refPointers を収集
  var treeRefs = [];
  var finalTree = treeData.finalTree || [];
  finalTree.forEach(function(child) {
    (child.refPointers || []).forEach(function(rp) {
      treeRefs.push({ id: rp.id, childId: child.childId, childName: child.name });
    });
    (child.children || []).forEach(function(gc) {
      (gc.refPointers || []).forEach(function(rp) {
        treeRefs.push({ id: rp.id, childId: child.childId + "-" + gc.grandchildId, childName: gc.name });
      });
    });
  });

  return { treeData: treeData, canonPath: canonResolved, treeRefs: treeRefs };
}

/**
 * 正典RFCから全マーカーをスキャンする。
 * @param {string} filePath - 正典RFCのパス
 * @returns {{markers: object[], lines: string[]}}
 */
function scanMarkers(filePath) {
  var content = fs.readFileSync(filePath, "utf8");
  var lines = content.split("\n");
  var markers = [];
  var match;
  // reset regex state
  MARKER_RE.lastIndex = 0;
  for (var i = 0; i < lines.length; i++) {
    MARKER_RE.lastIndex = 0;
    while ((match = MARKER_RE.exec(lines[i])) !== null) {
      markers.push({
        fullTag: match[1],
        type: match[2],   // "BEGIN" or "END"
        id: match[3],     // e.g. "01-001"
        line: i + 1       // 1-indexed
      });
    }
  }
  // Fix: If the regex state is corrupted, rebuild it
  MARKER_RE = /\[::(REF-POINTER-(BEGIN|END)-(\d{2}-\d{3}))::\]/g;
  return { markers: markers, lines: lines };
}

/**
 * 孤児マーカーを検出する。
 * RFC-TREE.json が参照しているが、正典RFCに存在しないマーカーIDを報告する。
 *
 * @param {object[]} treeRefs - RFC-TREE.json からのマーカー参照一覧
 * @param {object[]} canonMarkers - 正典RFCのマーカー一覧
 * @param {string} canonPath - 正典RFCのパス（エラー出力用）
 * @returns {boolean} エラーがあった場合は true
 */
function detectOrphans(treeRefs, canonMarkers, canonPath) {
  var hasError = false;
  var canonIds = {};
  canonMarkers.forEach(function(m) { canonIds[m.id] = true; });

  treeRefs.forEach(function(ref) {
    var existsInCanon = canonMarkers.some(function(m) { return m.id === ref.id; });
    if (!existsInCanon) {
      hasError = true;
      emit("ERROR", "", 0, ref.id,
        "【孤児マーカー】RFC-TREE.json（childId=" + ref.childId + "）はマーカー " + ref.id + " を参照しているが、正典RFCにこのマーカーが存在しません",
        "正典RFCの該当箇所に `<!-- [::" + MARKER_BEGIN + "-" + ref.id + "::] -->` と `<!-- [::" + MARKER_END + "-" + ref.id + "::] -->` を挿入するか、RFC-TREE.json の該当ノードの refPointers から \"" + ref.id + "\" を削除してください");
    }
  });
  return hasError;
}

/**
 * 未参照マーカーを検出する。
 * 正典RFCに存在するマーカーが、RFC-TREE.json のどのノードからも参照されていない場合に警告する。
 *
 * @param {object[]} canonMarkers - 正典RFCのマーカー一覧
 * @param {object[]} treeRefs - RFC-TREE.json からのマーカー参照一覧
 * @param {string} canonPath - 正典RFCのパス
 * @returns {boolean} 警告があった場合は true
 */
function detectUnreferenced(canonMarkers, treeRefs, canonPath) {
  var hasWarning = false;
  var refIds = {};
  treeRefs.forEach(function(r) { refIds[r.id] = true; });

  // 各マーカーのユニークIDでチェック（BEGIN/END 両方あるがID単位）
  var checked = {};
  canonMarkers.forEach(function(m) {
    if (checked[m.id]) { return; }
    checked[m.id] = true;
    if (!refIds[m.id]) {
      hasWarning = true;
      emit("WARN", canonPath, m.line, m.id,
        "【未参照マーカー】このマーカーは親RFCに存在しますが、RFC-TREE.json のどのノードの refPointers からも参照されていません",
        "不要であればマーカー行を削除してください。必要であれば RFC-TREE.json の該当ノードの refPointers に \"" + m.id + "\" を追加してください");
    }
  });
  return hasWarning;
}

/**
 * ペア整合性を検証する。
 * スタックマシンで BEGIN/END の対応を確認する。
 *
 * @param {object[]} canonMarkers - 正典RFCのマーカー一覧
 * @param {string} canonPath - 正典RFCのパス
 * @returns {boolean} エラーがあった場合は true
 */
function validatePairs(canonMarkers, canonPath) {
  var hasError = false;
  var stack = [];

  canonMarkers.forEach(function(m) {
    if (m.type === "BEGIN") {
      // ネストチェック: スタックが空でないなら、新しいBEGINが既存のBEGINの中で開始されている
      if (stack.length > 0) {
        hasError = true;
        emit("ERROR", canonPath, m.line, m.id,
          "【ネスト検出】マーカーがネストしています: `<!-- [::" + MARKER_BEGIN + "-" + m.id + "::] -->` が `<!-- [::" + MARKER_BEGIN + "-" + stack[stack.length - 1].id + "::] -->` の中で開始されました",
          "マーカー範囲を重ならないように配置するか、異なる ID を使用してください");
      }
      stack.push(m);
    } else if (m.type === "END") {
      if (stack.length === 0) {
        hasError = true;
        emit("ERROR", canonPath, m.line, m.id,
          "【ペア不整合】対応する BEGIN がない END マーカー: `<!-- [::" + MARKER_END + "-" + m.id + "::] -->`",
          "この END に対応する `<!-- [::" + MARKER_BEGIN + "-" + m.id + "::] -->` を追加するか、不要であればこの END 行を削除してください");
      } else {
        var lastBegin = stack.pop();
        if (lastBegin.id !== m.id) {
          hasError = true;
          emit("ERROR", canonPath, m.line, m.id,
            "BEGIN/END の ID 不一致: BEGIN=" + lastBegin.id + " に対応する END として " + m.id + " が見つかりました。期待: " + lastBegin.id,
            "END マーカーの ID を `" + lastBegin.id + "` に修正してください");
        }
      }
    }
  });

  // スタックに残った BEGIN（対応する END がない）
  stack.forEach(function(begin) {
    hasError = true;
    emit("ERROR", canonPath, begin.line, begin.id,
      "【ペア不整合】対応する END がない BEGIN マーカー: `<!-- [::" + MARKER_BEGIN + "-" + begin.id + "::] -->`",
      "BEGIN マーカーの直後に `<!-- [::" + MARKER_END + "-" + begin.id + "::] -->` を追加してください");
  });

  return hasError;
}

/**
 * 重複IDを検出する。
 * 同一IDの BEGIN マーカーが複数存在する場合にエラーとする。
 *
 * @param {object[]} canonMarkers - 正典RFCのマーカー一覧
 * @param {string} canonPath - 正典RFCのパス
 * @returns {boolean} エラーがあった場合は true
 */
function detectDuplicateIds(canonMarkers, canonPath) {
  var hasError = false;
  var seen = {};

  canonMarkers.forEach(function(m) {
    if (m.type !== "BEGIN") { return; }
    if (seen[m.id]) {
      hasError = true;
      emit("ERROR", canonPath, m.line, m.id,
        "`<!-- [::" + MARKER_BEGIN + "-" + m.id + "::] -->` が【重複ID】複数箇所に存在します（最初の出現: " + seen[m.id] + "行目、2回目: " + m.line + "行目）",
        "一方の ID を未使用の seq に変更してください（例: 現在の seq をインクリメント）");
    } else {
      seen[m.id] = m.line;
    }
  });
  return hasError;
}

// === メイン処理 ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("使用方法: node validate-ref-pointer.js <RFC-TREE.json> [--fix]");
    process.exit(1);
  }

  var treePath = args[0];
  var inputs = loadInputs(treePath);
  var canonPath = inputs.canonPath;
  var treeRefs = inputs.treeRefs;
  var scanResult = scanMarkers(canonPath);
  var canonMarkers = scanResult.markers;

  var hasError = false;
  var hasWarning = false;

  // 1. 孤児マーカー検出
  if (detectOrphans(treeRefs, canonMarkers, canonPath)) {
    hasError = true;
  }
  // 2. 未参照マーカー検出
  if (detectUnreferenced(canonMarkers, treeRefs, canonPath)) {
    hasWarning = true;
  }
  // 3. ペア整合性検証（ネスト検出含む）
  if (validatePairs(canonMarkers, canonPath)) {
    hasError = true;
  }
  // 4. 重複ID検出
  if (detectDuplicateIds(canonMarkers, canonPath)) {
    hasError = true;
  }

  // サマリー
  if (!hasError && !hasWarning) {
    console.log("[OK] 全マーカーの整合性が確認されました（" + treeRefs.length + " 参照、 " + canonMarkers.length + " マーカー）");
  } else {
    if (hasError) {
      console.log("[SUMMARY] エラーがあります。修正後、再実行してください。");
    } else {
      console.log("[SUMMARY] 警告のみです（エラーはありません）。");
    }
  }

  process.exit(hasError ? 1 : 0);
}

if (require.main === module) {
  main();
}
