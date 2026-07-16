#!/usr/bin/env node

/**
 * analyze-source-structure.js — Mechanical information provider script for 3-axis split support
 *
 * Used in graphify-rfc Step 1. Mechanically extracts structural information
 * (section tree, substantive line count excluding code blocks, kind candidates,
 * external dependencies, sections exceeding 100 lines) from a source Markdown document,
 * and outputs it as a natural language report to stdout.
 *
 * CLI: analyze-source-structure.js <source-path>
 *
 * Axis 1 (section hierarchy) is deterministically determined.
 * Axis 2 (kind estimation) and Axis 3 (external dependency detection) provide
 * mechanical candidate suggestions that the AI may override. The output includes
 * a disclaimer to that effect.
 *
 * Output contract:
 *   Normal → natural language report to stdout (exit code 0)
 *   Error → 3-part template to stderr (exit code 1)
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// Kind estimation keyword table (Axis 2)
// Composed of heading triggers (heading) and body keywords (body).
// Heading matches take priority; body keywords are supplementary.
// ============================================================
const KIND_PATTERNS = [
  {
    kind: "requirement",
    heading: [/要件/, /要求/, /必須/, /条件/, /必要/, /機能要件/, /非機能要件/],
    body: [
      /must\b/,
      /\bshall\b/,
      /need to/,
      /必要がある/,
      /しなければならない/,
      /必須/,
      /〜する必要/,
      /〜できること/,
    ],
  },
  {
    kind: "api_contract",
    heading: [
      /API/,
      /エンドポイント/,
      /インターフェース/,
      /I\/F/,
      /REST/,
      /Web API/,
      /インタフェース/,
    ],
    body: [
      /POST\b/,
      /GET\b/,
      /PUT\b/,
      /DELETE\b/,
      /PATCH\b/,
      /HTTP/,
      /\brequest\b/,
      /\bresponse\b/,
      /endpoint/,
      /\broute\b/,
      /\bhandler\b/,
      /fetch/,
      /api\//,
      /\/v1\//,
      /ステータスコード/,
      /status code/,
      /リクエストボディ/,
    ],
  },
  {
    kind: "data_model",
    heading: [
      /データモデル/,
      /スキーマ/,
      /型定義/,
      /エンティティ/,
      /\bDB\b/,
      /データベース/,
      /テーブル/,
      /ストレージ/,
      /データ構造/,
      /モデル定義/,
      /\bentity/,
      /カラム/,
      /フィールド定義/,
    ],
    body: [
      /\bstruct\b/,
      /\btype\b/,
      /\bfield\b/,
      /\bcolumn\b/,
      /primary key/,
      /foreign key/,
      /\bindex\b/,
      /migration/,
      /CREATE TABLE/,
      /ALTER TABLE/,
      /\bSELECT\b/,
      /\bINSERT\b/,
      /\bWHERE\b/,
      /\bjoin\b/,
      /\bschema\b/,
    ],
  },
  {
    kind: "state_machine",
    heading: [
      /状態機械/,
      /状態遷移/,
      /ステート/,
      /ステートマシン/,
      /状態/,
      /遷移/,
      /\bworkflow\b/,
      /ワークフロー/,
      /フェーズ/,
      /ライフサイクル/,
      /状態図/,
    ],
    body: [
      /\bstate\b/,
      /\btransition\b/,
      /\bevent\b/,
      /state_machine/,
      /\bstatus\b/,
      /\benum\b/,
      /\bmatch\b/,
      /遷移条件/,
      /ガード条件/,
      /\bguard\b/,
      /\btrigger\b/,
    ],
  },
  {
    kind: "architecture",
    heading: [
      /アーキテクチャ/,
      /構成/,
      /コンポーネント/,
      /モジュール構成/,
      /システム構成/,
      /レイヤ/,
      /階層/,
      /全体図/,
      /コンポーネント図/,
      /システム設計/,
      /モジュール/,
      /サブシステム/,
    ],
    body: [
      /\bcomponent\b/,
      /\bmodule\b/,
      /\blayer\b/,
      /\barchitecture\b/,
      /\bdependency\b/,
      /依存関係/,
      /結合/,
      /\binterface\b/,
      /責務/,
      /\bresponsibility\b/,
    ],
  },
  {
    kind: "security",
    heading: [
      /セキュリティ/,
      /認証/,
      /認可/,
      /暗号/,
      /脅威/,
      /プライバシー/,
      /セキュリティ対策/,
      /セキュリティモデル/,
      /アクセス制御/,
      /監査/,
      /コンプライアンス/,
    ],
    body: [
      /\bauth\b/,
      /\btoken\b/,
      /\bpassword\b/,
      /\bencrypt\b/,
      /\bdecrypt\b/,
      /\bhash\b/,
      /\bJWT\b/,
      /\bOAuth\b/,
      /\bSSL\b/,
      /\bTLS\b/,
      /\bcertificate\b/,
      /\bpermission\b/,
      /\brole\b/,
      /\bACL\b/,
      /\bCVE\b/,
      /\binjection\b/,
      /\bXSS\b/,
      /\bCSRF\b/,
      /攻撃/,
      /認証/,
      /認可/,
      /権限/,
      /\bsanitize\b/,
      /バリデーション/,
    ],
  },
  {
    kind: "error_policy",
    heading: [
      /エラー/,
      /エラー処理/,
      /エラーハンドリング/,
      /例外/,
      /異常系/,
      /障害/,
      /リカバリ/,
      /回復/,
      /フォールバック/,
      /エラー戦略/,
      /障害対策/,
    ],
    body: [
      /\berror\b/,
      /\bexception\b/,
      /\bpanic\b/,
      /\bfail\b/,
      /\bfallback\b/,
      /\bretry\b/,
      /\btimeout\b/,
      /circuit breaker/,
      /\bgraceful\b/,
      /\bshutdown\b/,
      /グレースフル/,
      /リトライ/,
      /タイムアウト/,
      /\bcatch\b/,
      /\bResult\b/,
      /\bOption\b/,
      /\bunwrap\b/,
    ],
  },
  {
    kind: "config",
    heading: [
      /設定/,
      /コンフィグ/,
      /環境変数/,
      /設定値/,
      /構成管理/,
      /\bconfiguration\b/,
      /\bconfig\b/,
      /設定ファイル/,
      /パラメータ/,
    ],
    body: [
      /\benv\b/,
      /\.env/,
      /\bconfig\b/,
      /environment variable/,
      /\bsetting\b/,
      /\bYAML\b/,
      /\bTOML\b/,
      /\bINI\b/,
      /設定ファイル/,
      /\bconf\b/,
      /\bcfg\b/,
      /\bvar\b/,
      /既定値/,
      /\bdefault\b/,
      /初期化/,
      /\binit\b/,
    ],
  },
  {
    kind: "test_policy",
    heading: [
      /テスト/,
      /テスト計画/,
      /テスト戦略/,
      /品質/,
      /単体テスト/,
      /結合テスト/,
      /\bE2E\b/,
      /テスト手法/,
      /品質保証/,
    ],
    body: [
      /\btest\b/,
      /\bspec\b/,
      /\bassert\b/,
      /\bmock\b/,
      /\bcoverage\b/,
      /\bjest\b/,
      /\bvitest\b/,
      /\bplaywright\b/,
      /\bdescribe\b/,
      /\bit\b/,
      /\bshould\b/,
      /\bexpect\b/,
      /\bspy\b/,
      /\bstub\b/,
      /\bfixture\b/,
      /\bCI\b/,
    ],
  },
  {
    kind: "build_ci",
    heading: [
      /ビルド/,
      /\bCI\b/,
      /\bCD\b/,
      /デプロイ/,
      /リリース/,
      /パッケージ/,
      /CI\/CD/,
      /デプロイ戦略/,
      /ビルド設定/,
      /継続的インテグレーション/,
    ],
    body: [
      /\bMakefile\b/,
      /\bcargo\b/,
      /\bnpm\b/,
      /\byarn\b/,
      /\bpnpm\b/,
      /\bdocker\b/,
      /\bbuild\b/,
      /\bpublish\b/,
      /\brelease\b/,
      /\bpipeline\b/,
      /github actions/,
      /\bworkflow\b/,
      /\bartifact\b/,
      /\bdist\b/,
      /コンパイル/,
      /\bcompile\b/,
    ],
  },
  {
    kind: "rationale",
    heading: [
      /根拠/,
      /設計判断/,
      /判断根拠/,
      /なぜ/,
      /意思決定/,
      /選択理由/,
      /代替案/,
      /トレードオフ/,
      /背景/,
      /設計選択/,
      /比較/,
    ],
    body: [
      /\btherefore\b/,
      /\bbecause\b/,
      /\breason\b/,
      /trade-off/,
      /pros\/cons/,
      /理由/,
      /〜のため/,
      /なぜなら/,
      /したがって/,
      /一方/,
      /比較/,
      /検討/,
      /優位性/,
      /デメリット/,
    ],
  },
  {
    kind: "glossary",
    heading: [/用語/, /用語集/, /定義/, /用語定義/, /語彙/, /辞書/, /用語解説/],
    body: [
      /用語/,
      /定義/,
      /略語/,
      /\bacronym\b/,
      /略称/,
      /正式名称/,
      /意味/,
      /説明/,
      /すなわち/,
      /\bi\.e\./,
      /\be\.g\./,
      /曖昧さ回避/,
    ],
  },
];

// ============================================================
// External dependency detection table (Axis 3)
// ============================================================
const DEP_PATTERNS = [
  {
    label: "ファイルI/O",
    patterns: [
      /fs\./,
      /readFile/,
      /writeFile/,
      /openFile/,
      /mkdir/,
      /rmdir/,
      /chmod/,
      /\baccess\b/,
      /\bstat\b/,
      /\bpath\b/,
      /\bFile\b/,
      /ファイル読み込み/,
      /ファイル書き込み/,
      /\bfsync\b/,
      /\brename\b/,
      /\bunlink\b/,
    ],
  },
  {
    label: "ネットワーク",
    patterns: [
      /http:\/\//,
      /https:\/\//,
      /\breqwest\b/,
      /\baxios\b/,
      /fetch\(/,
      /websocket/i,
      /\bWebSocket\b/,
      /\bTCP\b/,
      /\bUDP\b/,
      /\bsocket\b/,
      /\bconnect\b/,
      /\blisten\b/,
      /\bport\b/,
      /ネットワーク/,
      /\bcurl\b/,
      /通信/,
      /リモート/,
    ],
  },
  {
    label: "データベース",
    patterns: [
      /\bDB\b/,
      /\bdatabase\b/,
      /\bquery\b/,
      /\bSQL\b/,
      /\bSELECT\b/,
      /\bINSERT\b/,
      /\bUPDATE\b/,
      /\bDELETE\b/,
      /migration/,
      /connection pool/,
      /\borm\b/,
      /\bprisma\b/,
      /\bdiesel\b/,
      /\bseaorm\b/,
      /\bsqlx\b/,
      /コネクション/,
      /\bpostgresql\b/,
      /\bmysql\b/,
      /\bsqlite\b/,
      /\bredis\b/,
      /\bmongo\b/,
    ],
  },
  {
    label: "LLM/API",
    patterns: [
      /\bLLM\b/,
      /\bGPT\b/,
      /\bClaude\b/,
      /API key/,
      /\bopenai\b/,
      /\banthropic\b/,
      /\bcompletion\b/,
      /\bembedding\b/,
      /言語モデル/,
      /\btoken\b/,
      /\bprompt\b/,
      /推論/,
    ],
  },
  {
    label: "非同期ランタイム",
    patterns: [
      /\btokio\b/,
      /\basync\b/,
      /\bawait\b/,
      /\bFuture\b/,
      /\bPromise\b/,
      /\bthread\b/,
      /\bspawn\b/,
      /\bjoin\b/,
      /async fn/,
      /非同期/,
      /async\/await/,
      /\bconcurrent\b/,
      /\bparallel\b/,
    ],
  },
  {
    label: "乱数生成",
    patterns: [
      /\brandom\b/,
      /\brand\b/,
      /暗号論的乱数/,
      /crypto\.random/,
      /Math\.random/,
      /乱数/,
      /ランダム/,
      /\bUUID\b/,
      /\buuid\b/,
      /\bnonce\b/,
    ],
  },
  {
    label: "システム時間",
    patterns: [
      /\bclock\b/,
      /\btime\b/,
      /\bnow\b/,
      /\bSystemTime\b/,
      /\bchrono\b/,
      /\bduration\b/,
      /\btimestamp\b/,
      /\bdate\b/,
      /日時/,
      /時刻/,
      /タイマー/,
      /経過時間/,
    ],
  },
  {
    label: "プロセス管理",
    patterns: [
      /\bprocess\b/,
      /\bexit\b/,
      /\bsignal\b/,
      /child_process/,
      /\bexec\b/,
      /\bspawn\b/,
      /\bkill\b/,
      /プロセス/,
      /シグナル/,
      /デーモン/,
      /\bdaemon\b/,
    ],
  },
  {
    label: "外部モジュール読込",
    patterns: [
      /require\(/,
      /\bimport\b/,
      /use `/,
      /extern crate/,
      /from '/,
      /from "/,
      /\bmod\b/,
      /依存関係/,
      /\bdependency\b/,
      /\bcrate\b/,
      /\bpackage\b/,
      /ライブラリ/,
    ],
  },
  {
    label: "標準入出力",
    patterns: [
      /\bstdin\b/,
      /\bstdout\b/,
      /\bstderr\b/,
      /\bprint\b/,
      /\bprintln\b/,
      /console\.log/,
      /console\.error/,
      /\boutput\b/,
      /標準出力/,
      /標準エラー/,
      /入出力/,
    ],
  },
  {
    label: "設定ファイル読込",
    patterns: [
      /\.env/,
      /\bconfig\b/,
      /\bYAML\b/,
      /\bTOML\b/,
      /\bJSON\b/,
      /設定ファイル/,
      /\bconf\b/,
      /\bini\b/,
      /読み込み/,
      /\bload\b/,
      /\bparse\b/,
    ],
  },
];

// ============================================================
// Constants
// ============================================================

/** Threshold for forced splitting (sections exceeding this line count must be split into multiple nodes) */
const LONG_SECTION_THRESHOLD = 100;

// ============================================================
// Utilities
// ============================================================

/**
 * エラーを3-partテンプレート形式でstderrに出力し、終了コード1でプロセスを終了する
 *
 * @param {string} summary — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべき対応
 */
function exitWithError(summary, cause, action) {
  process.stderr.write(
    `[ERROR] ${summary}\n` + `原因: ${cause}\n` + `対応: ${action}\n`,
  );
  process.exit(1);
}

// ============================================================
// Argument parsing
// ============================================================

/**
 * CLI引数をパースする
 *
 * @param {string[]} argv — process.argv 相当の配列
 * @returns {{ sourcePath: string }} パース結果
 * @throws {Error} 引数が不正な場合
 */
function parseArguments(argv) {
  if (argv.length < 3) {
    throw new Error(
      "ソースファイルのパスを指定してください。\n使用法: analyze-source-structure.js <source-path>",
    );
  }
  if (argv[2] === "--help" || argv[2] === "-h") {
    console.log("使用法: analyze-source-structure.js <source-path>");
    console.log("");
    console.log(
      "Markdownファイルの構造情報（セクションツリー、行数、kind候補、外部依存）を",
    );
    console.log("自然言語レポートとして標準出力に出力します。");
    process.exit(0);
  }
  if (argv.length > 3) {
    throw new Error(
      `余剰な引数があります: ${argv.slice(3).join(" ")}\n使用法: analyze-source-structure.js <source-path>`,
    );
  }
  return { sourcePath: argv[2] };
}

/**
 * 引数をパースし、失敗時は exitWithError で終了する（main用）
 *
 * @param {string[]} argv — process.argv 相当の配列
 * @returns {{ sourcePath: string }}
 */
function parseArgumentsSafe(argv) {
  try {
    return parseArguments(argv);
  } catch (e) {
    exitWithError(
      "引数のパースに失敗しました。",
      e.message,
      "正しい引数で再実行してください。",
    );
    // unreachable
    process.exit(1);
  }
}

/**
 * ソースファイルを行の配列として読み込む
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function readSourceFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ソースファイルが見つかりません: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  return content.split("\n");
}

// ============================================================
// Code block detection
// ============================================================

/**
 * ``` で囲まれたコードブロックの行範囲を検出する
 *
 * @param {string[]} sourceLines
 * @returns {{ start: number, end: number }[]}
 */
function extractCodeBlocks(sourceLines) {
  const blocks = [];
  let inBlock = false;
  let blockStart = -1;

  for (let i = 0; i < sourceLines.length; i++) {
    const trimmed = sourceLines[i].trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      if (!inBlock) {
        inBlock = true;
        blockStart = i;
      } else {
        inBlock = false;
        blocks.push({ start: blockStart, end: i });
      }
    }
  }
  // Ignore unclosed code blocks (do not treat until end of file as a code block)
  return blocks;
}

// ============================================================
// Section tree extraction (Axis 1)
// ============================================================

/**
 * コードブロック外のMarkdown見出しを抽出する
 *
 * @param {string[]} sourceLines
 * @param {{ start: number, end: number }[]} codeBlocks
 * @returns {Array<{ level: number, heading: string, startLine: number, endLine: number, proseLines: number, codeBlockCount: number, bodyText: string }>}
 */
function extractHeadingTree(sourceLines, codeBlocks) {
  const codeBlockSet = new Set();
  for (const block of codeBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      codeBlockSet.add(i);
    }
  }

  const sections = [];
  let currentSection = null;

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const lineNum = i + 1; // 1-based

    // Skip lines inside code blocks (headings are also ignored)
    if (codeBlockSet.has(i)) continue;

    // Detect heading lines
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // Close the previous section
      if (currentSection) {
        currentSection.endLine = lineNum - 1;
        // Recalculate actual prose line count excluding code block lines (done later)
      }

      currentSection = {
        level: headingMatch[1].length,
        heading: headingMatch[2].trim(),
        startLine: lineNum,
        endLine: sourceLines.length, // Tentative
        proseLines: 0,
        codeBlockCount: 0,
        bodyText: "",
      };
      sections.push(currentSection);
    }
  }

  // If no headings exist, treat the entire file as one section
  if (sections.length === 0) {
    sections.push({
      level: 0,
      heading: "(全体)",
      startLine: 1,
      endLine: sourceLines.length,
      proseLines: 0,
      codeBlockCount: 0,
      bodyText: "",
    });
  }

  // Finalize each section's range (up to just before the next heading of same or higher level)
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    let endLine = sourceLines.length;
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level <= sec.level) {
        endLine = sections[j].startLine - 1;
        break;
      }
    }
    sec.endLine = endLine;

    // Calculate prose line count and code block count within the section
    let proseCount = 0;
    let codeBlockCount = 0;
    const bodyParts = [];
    for (let j = sec.startLine - 1; j < sec.endLine; j++) {
      if (codeBlockSet.has(j)) continue;
      const text = sourceLines[j];
      // Do not count blank lines
      if (text.trim() !== "") {
        proseCount++;
        // Exclude the heading line itself from the body (title line)
        const isHeading = /^#{1,6}\s+/.test(text);
        if (!isHeading) {
          bodyParts.push(text);
        }
      }
    }
    sec.proseLines = proseCount;
    sec.codeBlockCount = codeBlocks.filter(
      (b) => b.start >= sec.startLine - 1 && b.end <= sec.endLine - 1,
    ).length;
    sec.bodyText = bodyParts.join("\n");
  }

  return sections;
}

// ============================================================
// kind estimation (Axis 2 support)
// ============================================================

/**
 * 見出しと本文から kind 候補を推定する
 *
 * @param {string} heading — セクション見出し
 * @param {string} bodyText — セクション本文
 * @returns {string[]} 推定されたkindの配列（0〜複数）
 */
function estimateKind(heading, bodyText) {
  const matches = [];

  for (const pattern of KIND_PATTERNS) {
    // Heading match (priority)
    const headingMatch = pattern.heading.some((re) => re.test(heading));
    if (headingMatch) {
      matches.push(pattern.kind);
      continue; // Skip body check if heading matched (prevent duplicates)
    }
    // Body keyword match (supplementary)
    const bodyMatch = pattern.body.some((re) => re.test(bodyText));
    if (bodyMatch) {
      matches.push(pattern.kind);
    }
  }

  return matches;
}

/**
 * 本文から正規表現パターンにマッチする文字列を収集する（重複除去、最大5件）
 *
 * @param {string} bodyText — 検索対象の本文
 * @param {RegExp[]} patterns — マッチさせる正規表現パターンの配列
 * @returns {string[]} マッチした文字列の配列（部分一致を含む）
 */
function collectBodyMatches(bodyText, patterns) {
  const matches = [];
  for (const re of patterns) {
    const results = bodyText.match(re);
    if (results) {
      for (const m of results.slice(0, 3)) {
        if (m.length === 0) continue;
        const truncated = m.length > 30 ? m.substring(0, 30) + "…" : m;
        if (!matches.includes(truncated)) {
          matches.push(truncated);
        }
      }
    }
  }
  return matches.slice(0, 5);
}

// ============================================================
// External dependency detection (Axis 3 support)
// ============================================================

/**
 * セクションに子見出し（より深いレベルの見出し）が存在するか判定する
 *
 * 子見出しを持つセクションは既に適切に分割済みとみなし、
 * 長大セクション（100行超）の警告対象から除外する。
 *
 * @param {Array} sections — 全セクションの配列
 * @param {Object} sec — 評価対象のセクション
 * @returns {boolean} 子見出しが存在する場合 true
 */
function sectionHasChildren(sections, sec) {
  return sections.some(
    (s) => s.level > sec.level && s.startLine > sec.startLine && s.startLine <= sec.endLine,
  );
}

/**
 * 本文から外部依存パターンを検出する
 *
 * @param {string} bodyText
 * @returns {string[]} 検出された依存ラベルの配列
 */
function detectExternalDeps(bodyText) {
  const found = [];
  for (const dep of DEP_PATTERNS) {
    if (dep.patterns.some((re) => re.test(bodyText))) {
      found.push(dep.label);
    }
  }
  return found;
}

// ============================================================
// Report formatting
// ============================================================

/**
 * 見出しテキストからトークン列を機械的に抽出する
 *
 * 日本語・英語の見出しテキストを空白と記号類で分割し、
 * 意味のある単位の配列として返す。空文字列は除外する。
 * スラッシュ（/）は分割しない（パスやURLを保持するため）。
 *
 * @param {string} headingText — 見出しテキスト
 * @returns {string[]} トークン列
 */
function extractHeadingTokens(headingText) {
  return headingText
    .split(/[\s、。，．・：；（）\[\]{}「」『』【】　\\]+/)
    .filter(Boolean);
}

/**
 * セクション情報から候補 headingRefs を生成する
 *
 * 機械的なトークン抽出結果であり、AI が判断を上書き可能。
 *
 * @param {Array} sections — セクション配列
 * @returns {Array<{ lineRange: string, heading: number, texts: string[] }>}
 */
function generateCandidateHeadingRefs(sections) {
  return sections.map((sec) => ({
    lineRange: `L${sec.startLine}-L${sec.endLine}`,
    heading: sec.level,
    texts: extractHeadingTokens(sec.heading),
  }));
}

/**
 * 自然言語レポートとして整形する
 *
 * 第2軸・第3軸の出力には「機械的な候補でありAIが判断を上書き可能」の但し書きを含める。
 * 第4軸（候補 headingRefs）も同様。
 *
 * @param {string} sourcePath — 解析対象ファイルパス
 * @param {number} totalLines — 総行数
 * @param {number} codeLines — コードブロック行数
 * @param {Array} sections — セクション配列
 * @param {Array} kindHints — { lineRange, kind, reason }[]
 * @param {Array} deps — { lineRange, labels }[]
 * @param {Array} longSections — { lineRange, label, proseLines }[]
 * @param {Array} headingRefCandidates — { lineRange, heading, texts }[]
 * @returns {string}
 */
function formatReport(
  sourcePath,
  totalLines,
  codeLines,
  sections,
  kindHints,
  deps,
  longSections,
  headingRefCandidates,
) {
  const proseLines = totalLines - codeLines;
  const lines = [];

  const basename = path.basename(sourcePath);

  lines.push(`# ${basename} 構造分析レポート`);
  lines.push("");
  lines.push(`## 基本情報`);
  lines.push(
    `総行数: ${totalLines}行（うちコードブロック: ${codeLines}行、実質記述: ${proseLines}行）`,
  );
  lines.push("");

  // Build kind/dep lookup keyed by section lineRange
  const kindByRange = {};
  for (const hint of kindHints) {
    kindByRange[hint.lineRange] = hint.kind;
  }
  const depByRange = {};
  for (const dep of deps) {
    depByRange[dep.lineRange] = dep.labels.join(", ");
  }

  // Section listing
  lines.push(
    `## セクション一覧（ノード候補。機械的な検出結果でありAIが判断を上書き可能。）`,
  );
  for (const sec of sections) {
    const hTag = `- h${sec.level}`;
    const proseStr = sec.proseLines > 0 ? `${sec.proseLines}行` : "";
    const indent = sec.level > 0 ? "  ".repeat(sec.level - 1) : "";
    const range = `L${sec.startLine}-L${sec.endLine}`;
    const kindInfo = kindByRange[range] ? ` [kind: ${kindByRange[range]}]` : "";
    const depInfo = depByRange[range] ? ` [dep: ${depByRange[range]}]` : "";
    lines.push(
      `${indent}${hTag} ${range}: ${sec.heading.trim()} (${proseStr})${kindInfo}${depInfo}`,
    );
  }
  lines.push("");

  // // kind candidates (Axis 2) — already annotated inline on each section line
  // lines.push(`## kind 候補（機械的推定。AI が判断を上書き可能）`);
  // if (kindHints.length === 0) {
  //   lines.push(
  //     "該当なし（キーワード未マッチのため kind を推定できませんでした）",
  //   );
  // } else {
  //   for (const hint of kindHints) {
  //     lines.push(`${hint.lineRange}  ${hint.kind}  ← ${hint.reason}`);
  //   }
  // }
  // lines.push("");
  //
  // // External dependencies (Axis 3) — already annotated inline on each section line
  // lines.push(
  //   `## 外部依存の可能性があるセクション（機械的検出。AIは参考にして自由に判断可。）`,
  // );
  // if (deps.length === 0) {
  //   lines.push("検出なし");
  // } else {
  //   for (const dep of deps) {
  //     lines.push(`${dep.lineRange}  ${dep.labels.join(", ")}`);
  //   }
  // }
  // lines.push("");

  // // Candidate headingRefs (Axis 4)
  // lines.push(
  //   `## ノード候補 headingRefs（機械的抽出。AI は参考にして独自に判断可。）`,
  // );
  // if (!headingRefCandidates || headingRefCandidates.length === 0) {
  //   lines.push(
  //     "該当なし（セクションが存在しないため候補を生成できませんでした）",
  //   );
  // } else {
  //   for (const cand of headingRefCandidates) {
  //     const headingLabel = cand.heading > 0 ? `h${cand.heading}` : "title";
  //     lines.push(`${cand.lineRange}  ${headingLabel}: ${cand.texts.join(" ")}`);
  //   }
  // }
  // lines.push("");

  // Sections exceeding 100 lines
  lines.push(
    `## 100行超セクション（コードブロック除く実質記述行数 — 強制分割候補）`,
  );
  if (longSections.length === 0) {
    lines.push("なし（全セクションが100行未満）");
  } else {
    for (const sec of longSections) {
      lines.push(`${sec.lineRange}  実質${sec.proseLines}行  ${sec.label}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ============================================================
// Report generation (integration of all information)
// ============================================================

/**
 * 全解析結果を統合し、自然言語レポートを生成する
 *
 * @param {string} sourcePath
 * @param {string[]} sourceLines
 * @returns {string}
 */
function generateReport(sourcePath, sourceLines) {
  const totalLines = sourceLines.length;

  // Code block detection
  const codeBlocks = extractCodeBlocks(sourceLines);
  const codeBlockLines = new Set();
  for (const block of codeBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      codeBlockLines.add(i);
    }
  }
  const codeLines = codeBlockLines.size;

  // Section tree extraction
  const sections = extractHeadingTree(sourceLines, codeBlocks);

  // Kind candidates (Axis 2)
  const kindHints = [];
  for (const sec of sections) {
    // Heading lines are not included in bodyText, so pass heading as well
    const matches = estimateKind(sec.heading, sec.bodyText);
    if (matches.length > 0) {
      const reasons = [];
      // Search for matched patterns to construct reasons
      for (const kind of matches) {
        const pattern = KIND_PATTERNS.find((p) => p.kind === kind);
        if (!pattern) continue;
        const headingMatch = pattern.heading.some((re) => re.test(sec.heading));
        if (headingMatch) {
          reasons.push(`見出しに "${sec.heading}"`);
        } else {
          const bodyMatches = collectBodyMatches(sec.bodyText, pattern.body);
          reasons.push(
            bodyMatches.length > 0
              ? `本文に "${bodyMatches.slice(0, 3).join('", "')}"`
              : `本文キーワード`,
          );
        }
      }
      kindHints.push({
        lineRange: `L${sec.startLine}-L${sec.endLine}`,
        kind: matches.join(", "),
        reason: reasons.join("; "),
      });
    }
  }

  // External dependencies (Axis 3)
  const deps = [];
  for (const sec of sections) {
    const foundDeps = detectExternalDeps(sec.bodyText);
    if (foundDeps.length > 0) {
      deps.push({
        lineRange: `L${sec.startLine}-L${sec.endLine}`,
        labels: foundDeps,
      });
    }
  }

  // Sections exceeding 100 lines (h2 and above only; h1 wraps the entire document so it is excluded)
  // Sections with child headings (h3/h4) are considered already properly split and excluded
  const longSections = [];
  for (const sec of sections) {
    if (sec.level <= 1) continue;
    if (sec.proseLines > LONG_SECTION_THRESHOLD && !sectionHasChildren(sections, sec)) {
      longSections.push({
        lineRange: `L${sec.startLine}-L${sec.endLine}`,
        proseLines: sec.proseLines,
        label: sec.heading,
      });
    }
  }

  // Candidate headingRefs
  const headingRefCandidates = generateCandidateHeadingRefs(sections);

  return formatReport(
    sourcePath,
    totalLines,
    codeLines,
    sections,
    kindHints,
    deps,
    longSections,
    headingRefCandidates,
  );
}

// ============================================================
// Main
// ============================================================

function main() {
  const { sourcePath } = parseArgumentsSafe(process.argv);
  let sourceLines;
  try {
    sourceLines = readSourceFile(sourcePath);
  } catch (e) {
    exitWithError(
      "ソースファイルが見つかりません。",
      e.message,
      "正しいファイルパスを指定してください。",
    );
  }
  const report = generateReport(sourcePath, sourceLines);
  console.log(report);
}

// Export public functions for loading via require
module.exports = {
  parseArguments,
  parseArgumentsSafe,
  readSourceFile,
  extractCodeBlocks,
  extractHeadingTree,
  estimateKind,
  collectBodyMatches,
  detectExternalDeps,
  extractHeadingTokens,
  generateCandidateHeadingRefs,
  formatReport,
  generateReport,
  KIND_PATTERNS,
  DEP_PATTERNS,
};

// Call main only when executed directly
if (require.main === module) {
  main();
}
