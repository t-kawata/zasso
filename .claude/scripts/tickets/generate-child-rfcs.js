#!/usr/bin/env node
/**
 * generate-child-rfcs.js — finalTree から子・孫RFCのディレクトリ構造を機械的に生成
 *
 * 2フェーズ構成:
 *   --phase=insert  (フェーズ1): 正典RFCに Anchor Marker を自動挿入（初回のみ）
 *   --phase=transfer (フェーズ2): マーカー範囲を子RFCの該当セクションに機械転記
 *   デフォルト: 両方実行
 *
 * 命名規則: 子={canonicalBase}-{childId}-{slug}/, 孫={canonicalBase}-{childId}-{grandchildId}-{slug}/
 *
 * 使用例:
 *   node generate-child-rfcs.js RFC-TREE.json
 *   node generate-child-rfcs.js RFC-TREE.json --phase=insert
 *   node generate-child-rfcs.js RFC-TREE.json --phase=transfer
 */
const fs = require("fs");
const path = require("path");

// ============================================================
// 定数
// ============================================================
var REF_POINTER_BEGIN = "REF-POINTER-BEGIN";
var REF_POINTER_END = "REF-POINTER-END";
var MARKER_RE = /<!--\s*\[::(REF-POINTER-(BEGIN|END)-(\d{2}-\d{3}))::\]\s*-->/g;
var BACKUP_SUFFIX = ".bak.";
var BACKUP_RETENTION_MAX = 5;  // 保持するバックアップの最大数

// ガイダンスコメント（旧 <!-- ??? --> の置き換え）
var GUIDANCE_RESPONSIBILITIES = [
  "【記述指針】",
  "このセクションには、この名前空間（crate/module/package）が提供する",
  "公開API・主要型定義・ライフサイクルを記述すること。",
  "",
  "最低限含めるべき情報:",
  "1. 公開構造体・enum・trait のシグネチャ一覧",
  "2. 主要な公開 async fn のシグネチャと簡潔な意味論",
  "3. この名前空間の初期化・終了ライフサイクル",
  "",
  "目安: 50〜200行程度。APIリファレンスとして機能する十分な具体性。",
].join("\n");

var GUIDANCE_IO_BOUNDARY = [
  "【記述指針】",
  "このセクションには、この名前空間が外部に公開するI/O境界のスキーマ定義と",
  "デカップリング方法を記述すること。具体的には：",
  "",
  "1. 公開API境界（pub struct / pub trait / pub fn のシグネチャ）",
  "2. FFI境界（unsafe コードの隔離範囲と安全抽象化の設計）",
  "3. 非同期/同期境界（async fn と blocking の混在ルール）",
  "4. ネットワーク/ファイルIO境界（HTTP、DB、ファイルシステム）",
].join("\n");

var GUIDANCE_PARENT_RELATION = [
  "【記述指針】",
  "この子RFCが正典RFCのどの範囲から派生したかを記述する。",
  "根拠セクション番号は自動生成される。",
].join("\n");

var GUIDANCE_DEPENDENCIES = [
  "【記述指針】",
  "この名前空間の依存関係を記述する。以下を含めること：",
  "1. 兄弟子RFCとの依存関係とその理由（dependencyOn の展開）",
  "2. 外部クレート/ライブラリ依存とそのバージョン",
  "3. ビルド時の依存（build.rs, bindgen, システムパッケージ等）",
  "4. optional feature とその影響範囲",
].join("\n");

// ============================================================
// 補助関数
// ============================================================

/**
 * ディレクトリを含めてファイルを書き込む。
 * @param {string} filePath - 出力ファイルパス
 * @param {string} content - ファイル内容
 */
function writeFile(filePath, content) {
  var dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * 子ノードのディレクトリ名を生成する。
 * @param {string} cb - canonicalBase（親RFCのファイル名から拡張子除去）
 * @param {object} child - 子ノード
 * @returns {string} ディレクトリ名
 */
function childDirName(cb, child) {
  return cb + "-" + child.childId + "-" + (child.slug || child.directoryName || child.childId);
}

/**
 * 孫ノードのディレクトリ名を生成する。
 * @param {string} cb - canonicalBase
 * @param {string} parentId - 親子ノードの childId
 * @param {object} gc - 孫ノード
 * @returns {string} ディレクトリ名
 */
function gcDirName(cb, parentId, gc) {
  return cb + "-" + parentId + "-" + gc.grandchildId + "-" + (gc.slug || gc.directoryName || gc.grandchildId);
}

/**
 * RFC-TREE.json を読み込む。
 * @param {string} rp - RFC-TREE.json のパス
 * @returns {{data: object, canonPath: string, canonBase: string, canonRel: string, canonDir: string, lang: string|null, tree: object[]}}
 */
function loadTree(rp) {
  var fp = path.resolve(rp);
  if (!fs.existsSync(fp)) {
    console.log(JSON.stringify({ success: false, error: "ファイルが見つかりません: " + fp }));
    process.exit(1);
  }
  var data = JSON.parse(fs.readFileSync(fp, "utf8"));
  var tree = data.finalTree;
  if (!tree || !Array.isArray(tree) || tree.length === 0) {
    console.log(JSON.stringify({ success: false, error: "finalTree empty" }));
    process.exit(1);
  }
  var canonDir = path.dirname(data.canonicalRfcPath);
  var canonBase = path.basename(data.canonicalRfcPath, ".md");
  var canonRel = "../" + path.basename(data.canonicalRfcPath);
  var canonPath = path.resolve(path.dirname(fp), data.canonicalRfcPath);
  if (!fs.existsSync(canonPath)) {
    console.log(JSON.stringify({ success: false, error: "正典RFCが見つかりません: " + canonPath }));
    process.exit(1);
  }
  return {
    data: data,
    canonPath: canonPath,
    canonBase: canonBase,
    canonRel: canonRel,
    canonDir: canonDir,
    lang: data.language || null,
    tree: tree
  };
}

/**
 * バックアップを作成する。
 * @param {string} filePath - バックアップ元のファイルパス
 * @returns {string} バックアップファイルのパス
 */
function backupFile(filePath) {
  var ts = new Date().toISOString().replace(/[:-]/g, "").replace(/\.\d+Z$/, "");
  var backupPath = filePath + BACKUP_SUFFIX + ts;
  fs.copyFileSync(filePath, backupPath);

  // 保持上限5件のクリーンアップ
  var dir = path.dirname(filePath);
  var base = path.basename(filePath);
  var backups = fs.readdirSync(dir)
    .filter(function(f) { return f.indexOf(base + BACKUP_SUFFIX) === 0; })
    .sort()
    .reverse();
  if (backups.length > BACKUP_RETENTION_MAX) {
    backups.slice(BACKUP_RETENTION_MAX).forEach(function(oldBak) {
      fs.unlinkSync(path.join(dir, oldBak));
    });
  }

  return backupPath;
}

/**
 * バックアップから復元する。
 * @param {string} filePath - 復元先ファイルパス
 * @param {string} backupPath - バックアップファイルパス
 */
function restoreFromBackup(filePath, backupPath) {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
  }
}

/**
 * 子RFCのファイルパスを解決する。
 * @param {string} canonDir - 正典RFCのディレクトリ
 * @param {string} cb - canonicalBase
 * @param {object} node - 子ノード
 * @returns {string} 子RFCのファイルパス
 */
function childRfcPath(canonDir, cb, node) {
  return path.join(canonDir, childDirName(cb, node), childDirName(cb, node) + ".md");
}

// ============================================================
// フェーズ1: マーカー自動挿入
// ============================================================

/**
 * 正典RFCに Anchor Marker を挿入する（フェーズ1）。
 * lineStart/lineEnd が設定されている refPointer のみを処理する。
 * 挿入後、lineStart/lineEnd は RFC-TREE.json から除去される。
 *
 * @param {object} ctx - loadTree() の戻り値
 * @returns {boolean} 1件以上のマーカーを挿入した場合は true
 */
function phaseInsertMarkers(ctx) {
  var canonContent = fs.readFileSync(ctx.canonPath, "utf8");
  var lines = canonContent.split("\n");
  var modified = false;
  var backupPath = null;

  // 全ノードの refPointers で lineStart を持つものを収集
  var insertions = [];
  ctx.tree.forEach(function(child) {
    (child.refPointers || []).forEach(function(rp) {
      if (rp.lineStart && rp.lineEnd) {
        insertions.push({
          childId: child.childId,
          id: rp.id,
          lineStart: rp.lineStart,
          lineEnd: rp.lineEnd
        });
      }
    });
  });

  if (insertions.length === 0) {
    return false;
  }

  // 既存マーカー重複チェック
  MARKER_RE.lastIndex = 0;
  var existingMarkers = {};
  lines.forEach(function(line, idx) {
    var m;
    while ((m = MARKER_RE.exec(line)) !== null) {
      existingMarkers[m[3]] = true;
    }
  });
  MARKER_RE.lastIndex = 0;

  // 上書き前にマーカーが既存でないか確認
  insertions.forEach(function(ins) {
    if (existingMarkers[ins.id]) {
      console.log("[SKIP] マーカー " + ins.id + " は既に存在します（lineStart/lineEnd を削除して継続）");
      // JSON から lineStart/lineEnd を除去するために、ここでは削除リストに記録するだけ
    }
  });

  // バックアップ作成
  backupPath = backupFile(ctx.canonPath);

  try {
    // 行番号降順で処理（挿入による行番号ずれを防止）
    insertions.sort(function(a, b) { return b.lineStart - a.lineStart; });

    insertions.forEach(function(ins) {
      if (existingMarkers[ins.id]) { return; }

      // lineStart に BEGIN マーカーを挿入、その後に元の lineStart の内容を配置
      var beginLine = "<!-- [::" + REF_POINTER_BEGIN + "-" + ins.id + "::] -->";
      var endLine = "<!-- [::" + REF_POINTER_END + "-" + ins.id + "::] -->";
      var originalContent = lines[ins.lineStart - 1];

      // lineStart 行を BEGIN マーカーで置換し、その後に元の行を挿入
      lines[ins.lineStart - 1] = beginLine;
      lines.splice(ins.lineStart, 0, originalContent);

      // END マーカーを挿入（行番号は1つずれているので ins.lineEnd + 1）
      var endIndex = ins.lineEnd + 1;
      lines.splice(endIndex, 0, endLine);

      modified = true;
    });

    if (modified) {
      fs.writeFileSync(ctx.canonPath, lines.join("\n"), "utf8");
    }

    // lineStart/lineEnd を RFC-TREE.json から除去
    var treeChanged = false;
    ctx.tree.forEach(function(child) {
      if (child.refPointers) {
        child.refPointers.forEach(function(rp) {
          if (rp.lineStart || rp.lineEnd) {
            delete rp.lineStart;
            delete rp.lineEnd;
            treeChanged = true;
          }
        });
      }
    });

    if (treeChanged) {
      var treeFilePath = process.argv[2];
      if (treeFilePath) {
        fs.writeFileSync(path.resolve(treeFilePath), JSON.stringify(ctx.data, null, 2) + "\n", "utf8");
      }
    }
  } catch (e) {
    if (backupPath) {
      restoreFromBackup(ctx.canonPath, backupPath);
    }
    console.log(JSON.stringify({ success: false, error: "マーカー挿入に失敗しました: " + e.message }));
    process.exit(1);
  }

  return modified;
}

// ============================================================
// 注釈ブロック
// ============================================================

/**
 * 正典RFC用の注釈ブロックを生成する。
 * @param {string} content - 現在の正典RFC全文
 * @returns {string} 注釈ブロックが挿入された全文（既存なら変更なし）
 */
function annotateCanonRfc(content) {
  var annotation = [
    "<!--",
    "===== Anchor Marker System =====",
    "このファイルには `[::REF-POINTER-BEGIN/END-*::]` マーカーが埋め込まれている。",
    "これらのマーカーは機械的に子RFCへコードブロックを転記するためのものであり、",
    "手動で編集・削除しないこと。マーカー範囲内の内容を変更した場合は、",
    "generate-child-rfcs.js を再実行して子RFCの転記内容を更新すること。",
    "",
    "マーカーID の解釈:",
    "  <!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->",
    "  {childId} = 子RFCのID（01, 02, ...）",
    "  {seq}     = その子ID内での連番（001, 002, ...）",
    "===============================",
    "-->",
  ].join("\n");

  // 既存注釈チェック
  if (content.indexOf("===== Anchor Marker System =====") !== -1) {
    return content;
  }

  // frontmatter の直後に挿入
  var frontmatterEnd = content.indexOf("---", 3);
  if (frontmatterEnd !== -1) {
    frontmatterEnd = content.indexOf("\n", frontmatterEnd + 3);
    if (frontmatterEnd !== -1) {
      return content.slice(0, frontmatterEnd + 1) + "\n" + annotation + "\n\n" + content.slice(frontmatterEnd + 1);
    }
  }
  return annotation + "\n\n" + content;
}

/**
 * 子・孫RFC用の注釈ブロックを生成する。
 * @param {string} level - "child" または "grandchild"
 * @param {string} canonFilename - 親RFCのファイル名
 * @param {string|null} parentChildName - 親子ノードの名前（孫RFCの場合のみ）
 * @returns {string} 注釈ブロック
 */
function buildChildAnnotation(level, canonFilename, parentChildName) {
  if (level === "grandchild") {
    return [
      "<!--",
      "===== Anchor Marker System =====",
      "このファイルは子RFC（" + (parentChildName || "(unknown)") + "）の傘下として機械生成された。",
      "機械転記ブロックは子RFCから転記された内容を含む。",
      "===============================",
      "-->",
    ].join("\n");
  }

  return [
    "<!--",
    "===== Anchor Marker System =====",
    "このファイルの一部のセクションには「機械転記ブロック」として、",
    "親RFC（" + canonFilename + "）から機械的に転記された内容が含まれている。",
    "機械転記ブロックは `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->`",
    "で囲まれており、generate-child-rfcs.js の再実行で自動更新される。",
    "",
    "機械転記ブロック以外の記述（AI記述部）は維持される。機械転記ブロックの",
    "内容を変更する場合は、必ず親RFCの該当マーカー範囲を編集した上で",
    "generate-child-rfcs.js を再実行すること。",
    "===============================",
    "-->",
  ].join("\n");
}

// ============================================================
// 子RFCコンテンツ生成
// ============================================================

/**
 * YAML frontmatter を生成する。
 */
function buildFrontmatter(node, level, cPath, ev, pe) {
  var frontmatterLines = ["---"];
  frontmatterLines.push("tree:");
  frontmatterLines.push("  level: " + level);
  if (level === "child") {
    frontmatterLines.push('  childId: "' + node.childId + '"');
    frontmatterLines.push("  childName: " + (node.name || ""));
  }
  frontmatterLines.push("slug: " + (node.slug || node.directoryName || ""));
  if (level === "grandchild") {
    frontmatterLines.push('  grandchildId: "' + node.grandchildId + '"');
  }
  frontmatterLines.push("canonicalRfcPath: " + cPath);
  frontmatterLines.push('canonicalRfcSection: "' + (ev || "") + '"');
  frontmatterLines.push('ioSchema: "' + (node.ioSchema || "TBD") + '"');
  frontmatterLines.push('decouplingMethod: "' + (node.decouplingMethod || "TBD") + '"');
  if (node.dependencyOn) {
    frontmatterLines.push("dependencyOn: [" + node.dependencyOn.join(",") + "]");
  }
  if (pe) {
    frontmatterLines.push('parentEvidence: "' + pe + '"');
  }
  frontmatterLines.push("---");
  return frontmatterLines.join("\n");
}

/**
 * 「## 責務」セクションを生成する。
 * ガイダンスコメント + 機械転記ブロックで構成される。
 *
 * @param {string|null} transferredContent - 親RFCから転記されたコードブロック
 * @returns {string} セクション全文
 */
function buildResponsibilitiesSection(transferredContent) {
  var section = "\n\n## 責務\n\n";
  section += "<!--\n" + GUIDANCE_RESPONSIBILITIES + "\n-->\n\n";
  section += "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->\n";
  section += transferredContent || "";
  section += "\n<!-- /機械転記ブロック -->\n";
  section += "\n<!--\n【AI記述部】\n上記の機械転記ブロックで不足する設計判断・補足説明をここに記述する。\n機械転記ブロックは自動更新されるが、この AI 記述部は維持される。\n-->\n";
  return section;
}

/**
 * 「## I/O境界」セクションを生成する。
 * @param {string|null} transferredContent
 * @returns {string}
 */
function buildIoBoundarySection(transferredContent) {
  var section = "\n\n## I/O境界\n\n";
  section += "<!--\n" + GUIDANCE_IO_BOUNDARY + "\n-->\n\n";
  section += "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->\n";
  section += transferredContent || "";
  section += "\n<!-- /機械転記ブロック -->\n";
  return section;
}

/**
 * 「## 親との関係」セクションを生成する。
 * @param {string} ev - rfcEvidence（例: "§1-51"）
 * @param {string|null} transferredContent
 * @returns {string}
 */
function buildParentRelationSection(ev, transferredContent) {
  var section = "\n\n## 親との関係\n\n";
  section += "<!--\n" + GUIDANCE_PARENT_RELATION + "\n-->\n\n";
  section += "根拠: " + (ev || "(TBD)") + "\n\n";
  section += "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->\n";
  section += transferredContent || "";
  section += "\n<!-- /機械転記ブロック -->\n";
  return section;
}

/**
 * 「## 依存関係」セクションを生成する。
 * @param {string|null} transferredContent
 * @returns {string}
 */
function buildDependenciesSection(transferredContent) {
  var section = "\n\n## 依存関係\n\n";
  section += "<!--\n" + GUIDANCE_DEPENDENCIES + "\n-->\n\n";
  section += "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->\n";
  section += transferredContent || "";
  section += "\n<!-- /機械転記ブロック -->\n";
  return section;
}

/**
 * 子RFCの完全な Markdown コンテンツを生成する。
 *
 * @param {object} node - 子ノード
 * @param {string} level - "child" または "grandchild"
 * @param {string} cPath - 正典RFCへの相対パス
 * @param {string} ev - rfcEvidence
 * @param {string|null} pe - parentEvidence（孫のみ）
 * @param {object} transferred - マーカーID → 転記内容 のマップ
 * @returns {string}
 */
function buildChildRfcContent(node, level, cPath, ev, pe, transferred) {
  var content = buildFrontmatter(node, level, cPath, ev, pe);
  content += "\n\n# RFC: " + (node.name || "") + "\n";

  // Anchor Marker 注釈を挿入し、機械転記由来であることを明示する
  var filename = cPath || "(canon)";
  content += "\n" + buildChildAnnotation(level, filename, null) + "\n";

  // seq → 転記内容のマッピング
  content += buildResponsibilitiesSection(transferred["001"] || null);
  content += buildIoBoundarySection(transferred["002"] || null);
  content += buildParentRelationSection(ev, transferred["003"] || null);
  content += buildDependenciesSection(transferred["004"] || null);

  return content;
}

// ============================================================
// フェーズ2: 機械転記
// ============================================================

/**
 * 正典RFCから指定されたマーカーIDの範囲内容を抽出する。
 *
 * @param {string} canonContent - 正典RFC全文
 * @param {string} markerId - 抽出するマーカーID（例: "01-001"）
 * @returns {string|null} 抽出された内容、見つからなければ null
 */
function extractMarkerContent(canonContent, markerId) {
  var beginTag = "<!-- [::" + REF_POINTER_BEGIN + "-" + markerId + "::] -->";
  var endTag = "<!-- [::" + REF_POINTER_END + "-" + markerId + "::] -->";

  var beginIdx = canonContent.indexOf(beginTag);
  if (beginIdx === -1) { return null; }
  var endIdx = canonContent.indexOf(endTag);
  if (endIdx === -1) { return null; }

  var start = beginIdx + beginTag.length;
  var raw = canonContent.slice(start, endIdx);
  return raw.replace(/^\n+/, "").replace(/\n+$/, "");
}

/**
 * 子RFCの特定セクション内の機械転記ブロックを更新する。
 * `<!-- 機械転記ブロック -->` と `<!-- /機械転記ブロック -->` で囲まれた領域を
 * 新しい内容で置換する。ブロックが見つからない場合は何もしない。
 *
 * @param {string} childContent - 子RFCの現在の内容
 * @param {string} newTransfer - 新しい転記内容
 * @returns {string} 更新後の子RFCの内容
 */
function updateTransferBlock(childContent, newTransfer) {
  var blockBegin = "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->";
  var blockEnd = "<!-- /機械転記ブロック -->";

  var beginIdx = childContent.indexOf(blockBegin);
  if (beginIdx === -1) { return childContent; }
  var endIdx = childContent.indexOf(blockEnd, beginIdx);
  if (endIdx === -1) { return childContent; }

  var before = childContent.slice(0, beginIdx + blockBegin.length);
  var after = childContent.slice(endIdx);

  return before + "\n" + (newTransfer || "") + "\n" + after;
}

/**
 * フェーズ2: マーカー範囲の内容を子RFCの該当セクションに機械転記する。
 *
 * @param {object} ctx - loadTree() の戻り値
 */
function phaseTransfer(ctx) {
  var canonContent = fs.readFileSync(ctx.canonPath, "utf8");

  ctx.tree.forEach(function(child) {
    var dn = childDirName(ctx.canonBase, child);
    var childPath = path.join(ctx.canonDir, dn, dn + ".md");

    // refPointers から seq → 転記内容 のマップを構築
    var transferred = {};
    (child.refPointers || []).forEach(function(rp) {
      var seq = rp.id.split("-")[1];
      if (seq) {
        var content = extractMarkerContent(canonContent, rp.id);
        if (content !== null) {
          transferred[seq] = content;
        }
      }
    });

    // 子RFCが既に存在するか
    var childContent;
    if (fs.existsSync(childPath)) {
      childContent = fs.readFileSync(childPath, "utf8");
    } else {
      childContent = buildChildRfcContent(child, "child", ctx.canonRel, child.rfcEvidence || "", null, transferred);
      writeFile(childPath, childContent);
      return;
    }

    // 既存ファイルの機械転記ブロックを更新
    var updated = childContent;
    if (transferred["001"] !== undefined) {
      updated = updateTransferBlockForSection(updated, "## 責務", transferred["001"]);
    }
    if (transferred["002"] !== undefined) {
      updated = updateTransferBlockForSection(updated, "## I/O境界", transferred["002"]);
    }
    if (transferred["003"] !== undefined) {
      updated = updateTransferBlockForSection(updated, "## 親との関係", transferred["003"]);
    }
    if (transferred["004"] !== undefined) {
      updated = updateTransferBlockForSection(updated, "## 依存関係", transferred["004"]);
    }

    if (updated !== childContent) {
      writeFile(childPath, updated);
    }
  });
}

/**
 * 指定されたセクション内の機械転記ブロックを更新する。
 * セクション単位で処理するため、セクション開始位置を特定してから転記ブロックを探す。
 *
 * @param {string} content - 子RFC全文
 * @param {string} sectionHeader - セクション見出し（例: "## 責務"）
 * @param {string} newTransfer - 新しい転記内容
 * @returns {string}
 */
function updateTransferBlockForSection(content, sectionHeader, newTransfer) {
  var blockBegin = "<!-- 機械転記ブロック（generate-child-rfcs.js が更新） -->";
  var blockEnd = "<!-- /機械転記ブロック -->";

  // セクション開始位置を特定
  var sectionIdx = content.indexOf("\n" + sectionHeader + "\n");
  if (sectionIdx === -1) { return content; }

  var beginIdx = content.indexOf(blockBegin, sectionIdx);
  if (beginIdx === -1) { return content; }
  var endIdx = content.indexOf(blockEnd, beginIdx);
  if (endIdx === -1) { return content; }

  var before = content.slice(0, beginIdx + blockBegin.length);
  var after = content.slice(endIdx);

  return before + "\n" + (newTransfer || "") + "\n" + after;
}

// ============================================================
// 既存機能: Cargo.toml, lib.rs, go.mod, package.json 生成
// ============================================================

/**
 * Rust crate 用の Cargo.toml と src/lib.rs を生成する（既存機能の維持）。
 * @param {object} child - 子ノード
 * @param {string} cb - canonicalBase
 * @param {string} cd - 子ノードのディレクトリパス
 */
function generateRustProject(child, cb, cd) {
  var dn = childDirName(cb, child);
  // Cargo.toml
  var cargoContent = '[package]\nname = "' + dn + '"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n';
  if (child.dependencyOn) {
    child.dependencyOn.forEach(function(depId) {
      cargoContent += child.childId + '-dep-' + depId + ' = { path = "../' + cb + '-' + depId + '-<slug>" }\n';
    });
  }
  writeFile(path.join(cd, "Cargo.toml"), cargoContent);

  // src/lib.rs
  var srcDir = path.join(cd, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  var libContent = "// [::STUB::] Generated\n";
  if (child.children) {
    child.children.forEach(function(gc) {
      libContent += "pub mod " + gcDirName(cb, child.childId, gc) + ";\n";
    });
  }
  libContent += '\nfn main() {}\n';
  writeFile(path.join(srcDir, "lib.rs"), libContent);
}

/**
 * Go プロジェクト用の go.mod を生成する（既存機能の維持）。
 * @param {string} cd - 子ノードのディレクトリパス
 * @param {string} dn - ディレクトリ名
 */
function generateGoProject(cd, dn) {
  writeFile(path.join(cd, "go.mod"), 'module github.com/user/project/' + dn + '\n\ngo 1.22\n');
}

/**
 * TypeScript プロジェクト用の package.json と tsconfig.json を生成する（既存機能の維持）。
 * @param {string} cd - 子ノードのディレクトリパス
 * @param {string} dn - ディレクトリ名
 */
function generateTypeScriptProject(cd, dn) {
  writeFile(path.join(cd, "package.json"), JSON.stringify({ name: "@project/" + dn, version: "0.1.0", type: "module" }, null, 2) + "\n");
  writeFile(path.join(cd, "tsconfig.json"), JSON.stringify({ compilerOptions: { composite: true, outDir: "./dist", rootDir: "./src" }, include: ["src"] }, null, 2) + "\n");
}

// ============================================================
// メイン処理
// ============================================================

function main() {
  var args = process.argv.slice(2);
  var treePath = args[0];
  var phase = "both";

  // --phase フラグの解析
  for (var i = 1; i < args.length; i++) {
    if (args[i].indexOf("--phase=") === 0) {
      phase = args[i].split("=")[1];
    }
  }

  if (!treePath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node generate-child-rfcs.js <RFC_TREE_PATH> [--phase=insert|transfer]" }));
    process.exit(1);
  }

  var ctx = loadTree(treePath);

  // ===== フェーズ1: マーカー自動挿入 =====
  if (phase === "both" || phase === "insert") {
    var inserted = phaseInsertMarkers(ctx);
    if (inserted) {
      console.log("[フェーズ1] マーカーを挿入しました");
    } else {
      console.log("[フェーズ1] 挿入すべきマーカーはありませんでした");
    }

    // 正典RFCに注釈ブロックを挿入
    var canonContent = fs.readFileSync(ctx.canonPath, "utf8");
    var annotated = annotateCanonRfc(canonContent);
    if (annotated !== canonContent) {
      fs.writeFileSync(ctx.canonPath, annotated, "utf8");
      console.log("[フェーズ1] 正典RFCに注釈ブロックを挿入しました");
    }
  }

  // ===== フェーズ2: 機械転記 =====
  if (phase === "both" || phase === "transfer") {
    // バックアップ（子RFCファイルを書き込む前）
    var backupPath = backupFile(ctx.canonPath);
    try {
      phaseTransfer(ctx);
      console.log("[フェーズ2] 機械転記が完了しました");
    } catch (e) {
      restoreFromBackup(ctx.canonPath, backupPath);
      console.log(JSON.stringify({ success: false, error: "機械転記に失敗しました: " + e.message }));
      process.exit(1);
    }
  }

  // ===== 既存機能: 言語別プロジェクト生成 =====
  ctx.tree.forEach(function(child) {
    var dn = childDirName(ctx.canonBase, child);
    var cd = path.join(ctx.canonDir, dn);

    if (ctx.lang === "rust") {
      generateRustProject(child, ctx.canonBase, cd);
    } else if (ctx.lang === "go") {
      generateGoProject(cd, dn);
    } else if (ctx.lang === "typescript") {
      generateTypeScriptProject(cd, dn);
    }

    // 孫RFCの生成
    if (child.children) {
      child.children.forEach(function(gc) {
        var dnGC = gcDirName(ctx.canonBase, child.childId, gc);
        var gd = path.join(cd, dnGC);

        // 孫の refPointers から転記内容を構築
        var gcTransferred = {};
        (gc.refPointers || []).forEach(function(rp) {
          var canonContent = fs.readFileSync(ctx.canonPath, "utf8");
          var content = extractMarkerContent(canonContent, rp.id);
          if (content !== null) {
            var seq = rp.id.split("-")[1];
            if (seq) { gcTransferred[seq] = content; }
          }
        });

        var gcContent = buildChildRfcContent(gc, "grandchild", ctx.canonRel,
          gc.rfcEvidence || "", gc.parentEvidence || "", gcTransferred);
        writeFile(path.join(gd, dnGC + ".md"), gcContent);
      });
    }
  });

  console.log(JSON.stringify({ success: true, canonicalBase: ctx.canonBase }));
}

if (require.main === module) {
  main();
}
