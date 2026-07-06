#!/usr/bin/env node

/**
 * analyze-source-structure.js — 3軸分割支援の機械的情報提供スクリプト
 *
 * graphify-rfc Step 1 で使用する。ソースMarkdown文書の構造情報（セクションツリー、
 * コードブロックを除外した実質行数、kind 候補、外部依存、100行超セクション）を
 * 機械的に抽出し、自然言語レポートとして標準出力に出力する。
 *
 * CLI: analyze-source-structure.js <source-path>
 *
 * 第1軸（セクション階層）は決定論的に確定する。
 * 第2軸（kind推定）と第3軸（外部依存検出）は機械的な候補提示であり、
 * AI が判断を上書き可能。出力にその旨の但し書きを含める。
 *
 * 出力契約:
 *   正常時 → 自然言語レポートを stdout に出力（終了コード0）
 *   異常時 → 3段テンプレートを stderr に出力（終了コード1）
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// kind 推定用キーワードテーブル（第2軸）
// 見出しトリガー（heading）と本文キーワード（body）で構成。
// 見出しマッチを優先し、本文キーワードは補助的に使用する。
// ============================================================
const KIND_PATTERNS = [
  {
    kind: 'requirement',
    heading: [/要件/, /要求/, /必須/, /条件/, /必要/, /機能要件/, /非機能要件/],
    body: [/must\b/, /\bshall\b/, /need to/, /必要がある/, /しなければならない/, /必須/, /〜する必要/, /〜できること/],
  },
  {
    kind: 'api_contract',
    heading: [/API/, /エンドポイント/, /インターフェース/, /I\/F/, /REST/, /Web API/, /インタフェース/],
    body: [/POST\b/, /GET\b/, /PUT\b/, /DELETE\b/, /PATCH\b/, /HTTP/, /\brequest\b/, /\bresponse\b/, /endpoint/, /\broute\b/, /\bhandler\b/, /fetch/, /api\//, /\/v1\//, /ステータスコード/, /status code/, /リクエストボディ/],
  },
  {
    kind: 'data_model',
    heading: [/データモデル/, /スキーマ/, /型定義/, /エンティティ/, /\bDB\b/, /データベース/, /テーブル/, /ストレージ/, /データ構造/, /モデル定義/, /\bentity/, /カラム/, /フィールド定義/],
    body: [/\bstruct\b/, /\btype\b/, /\bfield\b/, /\bcolumn\b/, /primary key/, /foreign key/, /\bindex\b/, /migration/, /CREATE TABLE/, /ALTER TABLE/, /\bSELECT\b/, /\bINSERT\b/, /\bWHERE\b/, /\bjoin\b/, /\bschema\b/],
  },
  {
    kind: 'state_machine',
    heading: [/状態機械/, /状態遷移/, /ステート/, /ステートマシン/, /状態/, /遷移/, /\bworkflow\b/, /ワークフロー/, /フェーズ/, /ライフサイクル/, /状態図/],
    body: [/\bstate\b/, /\btransition\b/, /\bevent\b/, /state_machine/, /\bstatus\b/, /\benum\b/, /\bmatch\b/, /遷移条件/, /ガード条件/, /\bguard\b/, /\btrigger\b/],
  },
  {
    kind: 'architecture',
    heading: [/アーキテクチャ/, /構成/, /コンポーネント/, /モジュール構成/, /システム構成/, /レイヤ/, /階層/, /全体図/, /コンポーネント図/, /システム設計/, /モジュール/, /サブシステム/],
    body: [/\bcomponent\b/, /\bmodule\b/, /\blayer\b/, /\barchitecture\b/, /\bdependency\b/, /依存関係/, /結合/, /\binterface\b/, /責務/, /\bresponsibility\b/],
  },
  {
    kind: 'security',
    heading: [/セキュリティ/, /認証/, /認可/, /暗号/, /脅威/, /プライバシー/, /セキュリティ対策/, /セキュリティモデル/, /アクセス制御/, /監査/, /コンプライアンス/],
    body: [/\bauth\b/, /\btoken\b/, /\bpassword\b/, /\bencrypt\b/, /\bdecrypt\b/, /\bhash\b/, /\bJWT\b/, /\bOAuth\b/, /\bSSL\b/, /\bTLS\b/, /\bcertificate\b/, /\bpermission\b/, /\brole\b/, /\bACL\b/, /\bCVE\b/, /\binjection\b/, /\bXSS\b/, /\bCSRF\b/, /攻撃/, /認証/, /認可/, /権限/, /\bsanitize\b/, /バリデーション/],
  },
  {
    kind: 'error_policy',
    heading: [/エラー/, /エラー処理/, /エラーハンドリング/, /例外/, /異常系/, /障害/, /リカバリ/, /回復/, /フォールバック/, /エラー戦略/, /障害対策/],
    body: [/\berror\b/, /\bexception\b/, /\bpanic\b/, /\bfail\b/, /\bfallback\b/, /\bretry\b/, /\btimeout\b/, /circuit breaker/, /\bgraceful\b/, /\bshutdown\b/, /グレースフル/, /リトライ/, /タイムアウト/, /\bcatch\b/, /\bResult\b/, /\bOption\b/, /\bunwrap\b/],
  },
  {
    kind: 'config',
    heading: [/設定/, /コンフィグ/, /環境変数/, /設定値/, /構成管理/, /\bconfiguration\b/, /\bconfig\b/, /設定ファイル/, /パラメータ/],
    body: [/\benv\b/, /\.env/, /\bconfig\b/, /environment variable/, /\bsetting\b/, /\bYAML\b/, /\bTOML\b/, /\bINI\b/, /設定ファイル/, /\bconf\b/, /\bcfg\b/, /\bvar\b/, /既定値/, /\bdefault\b/, /初期化/, /\binit\b/],
  },
  {
    kind: 'test_policy',
    heading: [/テスト/, /テスト計画/, /テスト戦略/, /品質/, /単体テスト/, /結合テスト/, /\bE2E\b/, /テスト手法/, /品質保証/],
    body: [/\btest\b/, /\bspec\b/, /\bassert\b/, /\bmock\b/, /\bcoverage\b/, /\bjest\b/, /\bvitest\b/, /\bplaywright\b/, /\bdescribe\b/, /\bit\b/, /\bshould\b/, /\bexpect\b/, /\bspy\b/, /\bstub\b/, /\bfixture\b/, /\bCI\b/],
  },
  {
    kind: 'build_ci',
    heading: [/ビルド/, /\bCI\b/, /\bCD\b/, /デプロイ/, /リリース/, /パッケージ/, /CI\/CD/, /デプロイ戦略/, /ビルド設定/, /継続的インテグレーション/],
    body: [/\bMakefile\b/, /\bcargo\b/, /\bnpm\b/, /\byarn\b/, /\bpnpm\b/, /\bdocker\b/, /\bbuild\b/, /\bpublish\b/, /\brelease\b/, /\bpipeline\b/, /github actions/, /\bworkflow\b/, /\bartifact\b/, /\bdist\b/, /コンパイル/, /\bcompile\b/],
  },
  {
    kind: 'rationale',
    heading: [/根拠/, /設計判断/, /判断根拠/, /なぜ/, /意思決定/, /選択理由/, /代替案/, /トレードオフ/, /背景/, /設計選択/, /比較/],
    body: [/\btherefore\b/, /\bbecause\b/, /\breason\b/, /trade-off/, /pros\/cons/, /理由/, /〜のため/, /なぜなら/, /したがって/, /一方/, /比較/, /検討/, /優位性/, /デメリット/],
  },
  {
    kind: 'glossary',
    heading: [/用語/, /用語集/, /定義/, /用語定義/, /語彙/, /辞書/, /用語解説/],
    body: [/用語/, /定義/, /略語/, /\bacronym\b/, /略称/, /正式名称/, /意味/, /説明/, /すなわち/, /\bi\.e\./, /\be\.g\./, /曖昧さ回避/],
  },
];

// ============================================================
// 外部依存検出テーブル（第3軸）
// ============================================================
const DEP_PATTERNS = [
  { label: 'ファイルI/O', patterns: [/fs\./, /readFile/, /writeFile/, /openFile/, /mkdir/, /rmdir/, /chmod/, /\baccess\b/, /\bstat\b/, /\bpath\b/, /\bFile\b/, /ファイル読み込み/, /ファイル書き込み/, /\bfsync\b/, /\brename\b/, /\bunlink\b/] },
  { label: 'ネットワーク', patterns: [/http:\/\//, /https:\/\//, /\breqwest\b/, /\baxios\b/, /fetch\(/, /websocket/i, /\bWebSocket\b/, /\bTCP\b/, /\bUDP\b/, /\bsocket\b/, /\bconnect\b/, /\blisten\b/, /\bport\b/, /ネットワーク/, /\bcurl\b/, /通信/, /リモート/] },
  { label: 'データベース', patterns: [/\bDB\b/, /\bdatabase\b/, /\bquery\b/, /\bSQL\b/, /\bSELECT\b/, /\bINSERT\b/, /\bUPDATE\b/, /\bDELETE\b/, /migration/, /connection pool/, /\borm\b/, /\bprisma\b/, /\bdiesel\b/, /\bseaorm\b/, /\bsqlx\b/, /コネクション/, /\bpostgresql\b/, /\bmysql\b/, /\bsqlite\b/, /\bredis\b/, /\bmongo\b/] },
  { label: 'LLM/API', patterns: [/\bLLM\b/, /\bGPT\b/, /\bClaude\b/, /API key/, /\bopenai\b/, /\banthropic\b/, /\bcompletion\b/, /\bembedding\b/, /言語モデル/, /\btoken\b/, /\bprompt\b/, /推論/] },
  { label: '非同期ランタイム', patterns: [/\btokio\b/, /\basync\b/, /\bawait\b/, /\bFuture\b/, /\bPromise\b/, /\bthread\b/, /\bspawn\b/, /\bjoin\b/, /async fn/, /非同期/, /async\/await/, /\bconcurrent\b/, /\bparallel\b/] },
  { label: '乱数生成', patterns: [/\brandom\b/, /\brand\b/, /暗号論的乱数/, /crypto\.random/, /Math\.random/, /乱数/, /ランダム/, /\bUUID\b/, /\buuid\b/, /\bnonce\b/] },
  { label: 'システム時間', patterns: [/\bclock\b/, /\btime\b/, /\bnow\b/, /\bSystemTime\b/, /\bchrono\b/, /\bduration\b/, /\btimestamp\b/, /\bdate\b/, /日時/, /時刻/, /タイマー/, /経過時間/] },
  { label: 'プロセス管理', patterns: [/\bprocess\b/, /\bexit\b/, /\bsignal\b/, /child_process/, /\bexec\b/, /\bspawn\b/, /\bkill\b/, /プロセス/, /シグナル/, /デーモン/, /\bdaemon\b/] },
  { label: '外部モジュール読込', patterns: [/require\(/, /\bimport\b/, /use `/, /extern crate/, /from '/, /from "/, /\bmod\b/, /依存関係/, /\bdependency\b/, /\bcrate\b/, /\bpackage\b/, /ライブラリ/] },
  { label: '標準入出力', patterns: [/\bstdin\b/, /\bstdout\b/, /\bstderr\b/, /\bprint\b/, /\bprintln\b/, /console\.log/, /console\.error/, /\boutput\b/, /標準出力/, /標準エラー/, /入出力/] },
  { label: '設定ファイル読込', patterns: [/\.env/, /\bconfig\b/, /\bYAML\b/, /\bTOML\b/, /\bJSON\b/, /設定ファイル/, /\bconf\b/, /\bini\b/, /読み込み/, /\bload\b/, /\bparse\b/] },
];

// ============================================================
// 定数
// ============================================================

/** 強制分割判定のしきい値（この行数を超えるセクションは必ず複数ノードに分割する） */
const LONG_SECTION_THRESHOLD = 100;

// ============================================================
// ユーティリティ
// ============================================================

/**
 * 3段テンプレートでエラーを stderr に出力し、終了コード1でプロセスを終了する
 *
 * @param {string} summary — 何が起きたか
 * @param {string} cause — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
 */
function exitWithError(summary, cause, action) {
  process.stderr.write(
    `[ERROR] ${summary}\n` +
    `原因: ${cause}\n` +
    `対応: ${action}\n`
  );
  process.exit(1);
}

// ============================================================
// 引数パース
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
    throw new Error('ソースファイルのパスを指定してください。\n使用法: analyze-source-structure.js <source-path>');
  }
  if (argv[2] === '--help' || argv[2] === '-h') {
    console.log('使用法: analyze-source-structure.js <source-path>');
    console.log('');
    console.log('Markdownファイルの構造情報（セクションツリー、行数、kind候補、外部依存）を');
    console.log('自然言語レポートとして標準出力に出力します。');
    process.exit(0);
  }
  if (argv.length > 3) {
    throw new Error(`余剰な引数があります: ${argv.slice(3).join(' ')}\n使用法: analyze-source-structure.js <source-path>`);
  }
  return { sourcePath: argv[2] };
}

/**
 * 引数をパースし、エラー時に exitWithError で終了する（main 用）
 *
 * @param {string[]} argv — process.argv 相当の配列
 * @returns {{ sourcePath: string }}
 */
function parseArgumentsSafe(argv) {
  try {
    return parseArguments(argv);
  } catch (e) {
    exitWithError(
      '引数のパースに失敗しました。',
      e.message,
      '正しい引数で再実行してください。'
    );
    // unreachable
    process.exit(1);
  }
}

/**
 * ソースファイルを行配列として読み込む
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function readSourceFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ソースファイルが見つかりません: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n');
}

// ============================================================
// コードブロック検出
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
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (!inBlock) {
        inBlock = true;
        blockStart = i;
      } else {
        inBlock = false;
        blocks.push({ start: blockStart, end: i });
      }
    }
  }
  // 閉じていないコードブロックは無視（最終行までがコードブロック扱いにはしない）
  return blocks;
}

// ============================================================
// セクションツリー抽出（第1軸）
// ============================================================

/**
 * コードブロック外の Markdown 見出しを抽出する
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

    // コードブロック内の行はスキップ（見出しも無視）
    if (codeBlockSet.has(i)) continue;

    // 見出し行を検出
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // 直前のセクションをクローズ
      if (currentSection) {
        currentSection.endLine = lineNum - 1;
        // コードブロック行を除いた実質記述行数を再計算（後でやる）
      }

      currentSection = {
        level: headingMatch[1].length,
        heading: headingMatch[2].trim(),
        startLine: lineNum,
        endLine: sourceLines.length, // 暫定
        proseLines: 0,
        codeBlockCount: 0,
        bodyText: '',
      };
      sections.push(currentSection);
    }
  }

  // 見出しが1つもない場合、ファイル全体を1セクションとする
  if (sections.length === 0) {
    sections.push({
      level: 0,
      heading: '(全体)',
      startLine: 1,
      endLine: sourceLines.length,
      proseLines: 0,
      codeBlockCount: 0,
      bodyText: '',
    });
  }

  // 各セクションの範囲を確定
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (i < sections.length - 1) {
      sec.endLine = sections[i + 1].startLine - 1;
    } else {
      sec.endLine = sourceLines.length;
    }

    // セクション内の記述行数とコードブロック件数を計算
    let proseCount = 0;
    let codeBlockCount = 0;
    const bodyParts = [];
    for (let j = sec.startLine - 1; j < sec.endLine; j++) {
      if (codeBlockSet.has(j)) continue;
      const text = sourceLines[j];
      // 空行はカウントしない
      if (text.trim() !== '') {
        proseCount++;
        // 見出し行自体は本文には含めない（タイトル行）
        const isHeading = /^#{1,6}\s+/.test(text);
        if (!isHeading) {
          bodyParts.push(text);
        }
      }
    }
    sec.proseLines = proseCount;
    sec.codeBlockCount = codeBlocks.filter(
      b => (b.start >= sec.startLine - 1 && b.end <= sec.endLine - 1)
    ).length;
    sec.bodyText = bodyParts.join('\n');
  }

  return sections;
}

// ============================================================
// kind 推定（第2軸支援）
// ============================================================

/**
 * 見出しと本文テキストから kind 候補を推定する
 *
 * @param {string} heading — セクション見出し
 * @param {string} bodyText — セクション本文
 * @returns {string[]} 推定された kind の配列（0〜複数）
 */
function estimateKind(heading, bodyText) {
  const matches = [];

  for (const pattern of KIND_PATTERNS) {
    // 見出しマッチ（優先）
    const headingMatch = pattern.heading.some(re => re.test(heading));
    if (headingMatch) {
      matches.push(pattern.kind);
      continue; // 見出しマッチしたら本文はチェックしない（重複防止）
    }
    // 本文キーワードマッチ（補助）
    const bodyMatch = pattern.body.some(re => re.test(bodyText));
    if (bodyMatch) {
      matches.push(pattern.kind);
    }
  }

  return matches;
}

// ============================================================
// 外部依存検出（第3軸支援）
// ============================================================

/**
 * 本文テキストから外部依存パターンを検出する
 *
 * @param {string} bodyText
 * @returns {string[]} 検出された依存ラベルの配列
 */
function detectExternalDeps(bodyText) {
  const found = [];
  for (const dep of DEP_PATTERNS) {
    if (dep.patterns.some(re => re.test(bodyText))) {
      found.push(dep.label);
    }
  }
  return found;
}

// ============================================================
// レポート整形
// ============================================================

/**
 * 自然言語レポートとして整形する
 *
 * 第2軸・第3軸の出力には「機械的な候補でありAIが判断を上書き可能」の但し書きを含める。
 *
 * @param {string} sourcePath — 解析対象ファイルパス
 * @param {number} totalLines — 総行数
 * @param {number} codeLines — コードブロック行数
 * @param {Array} sections — セクション配列
 * @param {Array} kindHints — { lineRange, kind, reason }[]
 * @param {Array} deps — { lineRange, labels }[]
 * @param {Array} longSections — { lineRange, label, proseLines }[]
 * @returns {string}
 */
function formatReport(sourcePath, totalLines, codeLines, sections, kindHints, deps, longSections) {
  const proseLines = totalLines - codeLines;
  const lines = [];

  const basename = path.basename(sourcePath);

  lines.push(`# ${basename} 構造分析レポート`);
  lines.push('');
  lines.push(`## 基本情報`);
  lines.push(`総行数: ${totalLines}行（うちコードブロック: ${codeLines}行、実質記述: ${proseLines}行）`);
  lines.push('');

  // セクション一覧
  lines.push(`## セクション一覧`);
  for (const sec of sections) {
    const hTag = `<h${sec.level}>`;
    const codeInfo = sec.codeBlockCount > 0 ? `(${sec.codeBlockCount})` : '';
    const proseStr = sec.proseLines > 0 ? `${sec.proseLines}行${codeInfo}` : '';
    const indent = sec.level > 0 ? '  '.repeat(sec.level - 1) : '';
    const sep = sec.proseLines > 0 ? '  ' : '';
    lines.push(`${indent}${hTag}: L${sec.startLine}-L${sec.endLine}${sep}${proseStr}  ${sec.heading}`);
  }
  lines.push('');

  // kind 候補（第2軸）
  lines.push(`## kind 候補（機械的推定。AI が判断を上書き可能）`);
  if (kindHints.length === 0) {
    lines.push('該当なし（キーワード未マッチのため kind を推定できませんでした）');
  } else {
    for (const hint of kindHints) {
      lines.push(`${hint.lineRange}  ${hint.kind}  ← ${hint.reason}`);
    }
  }
  lines.push('');

  // 外部依存（第3軸）
  lines.push(`## 外部依存ありセクション（機械的検出。AI が強度と影響範囲を判断）`);
  if (deps.length === 0) {
    lines.push('検出なし');
  } else {
    for (const dep of deps) {
      lines.push(`${dep.lineRange}  ${dep.labels.join('、')}`);
    }
  }
  lines.push('');

  // 100行超セクション
  lines.push(`## 100行超セクション（コードブロック除く実質記述行数 — 強制分割候補）`);
  if (longSections.length === 0) {
    lines.push('なし（全セクションが100行未満）');
  } else {
    for (const sec of longSections) {
      lines.push(`${sec.lineRange}  実質${sec.proseLines}行  ${sec.label}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// レポート生成（全情報の統合）
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

  // コードブロック検出
  const codeBlocks = extractCodeBlocks(sourceLines);
  const codeBlockLines = new Set();
  for (const block of codeBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      codeBlockLines.add(i);
    }
  }
  const codeLines = codeBlockLines.size;

  // セクションツリー抽出
  const sections = extractHeadingTree(sourceLines, codeBlocks);

  // kind 候補（第2軸）
  const kindHints = [];
  for (const sec of sections) {
    // 見出し行は bodyText に含まれないので、heading も合わせて渡す
    const matches = estimateKind(sec.heading, sec.bodyText);
    if (matches.length > 0) {
      const reasons = [];
      // 理由を構築するため、マッチしたパターンを探す
      for (const kind of matches) {
        const pattern = KIND_PATTERNS.find(p => p.kind === kind);
        if (!pattern) continue;
        const headingMatch = pattern.heading.some(re => re.test(sec.heading));
        if (headingMatch) {
          const matched = pattern.heading.find(re => re.test(sec.heading));
          reasons.push(`見出しに "${sec.heading.match(/[^ ]+$/) || sec.heading}"`);
        } else {
          reasons.push(`本文キーワード`);
        }
      }
      kindHints.push({
        lineRange: `L${sec.startLine}-L${sec.endLine}`,
        kind: matches.join(', '),
        reason: reasons.join('; '),
      });
    }
  }

  // 外部依存（第3軸）
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

  // 100行超セクション
  const longSections = [];
  for (const sec of sections) {
    if (sec.proseLines > LONG_SECTION_THRESHOLD) {
      longSections.push({
        lineRange: `L${sec.startLine}-L${sec.endLine}`,
        proseLines: sec.proseLines,
        label: sec.heading,
      });
    }
  }

  return formatReport(sourcePath, totalLines, codeLines, sections, kindHints, deps, longSections);
}

// ============================================================
// メイン
// ============================================================

function main() {
  const { sourcePath } = parseArgumentsSafe(process.argv);
  let sourceLines;
  try {
    sourceLines = readSourceFile(sourcePath);
  } catch (e) {
    exitWithError(
      'ソースファイルが見つかりません。',
      e.message,
      '正しいファイルパスを指定してください。'
    );
  }
  const report = generateReport(sourcePath, sourceLines);
  console.log(report);
}

// `require` で読み込めるように公開関数をエクスポート
module.exports = {
  parseArguments,
  parseArgumentsSafe,
  readSourceFile,
  extractCodeBlocks,
  extractHeadingTree,
  estimateKind,
  detectExternalDeps,
  formatReport,
  generateReport,
  KIND_PATTERNS,
  DEP_PATTERNS,
};

// 直接実行時のみ main を呼ぶ
if (require.main === module) {
  main();
}
