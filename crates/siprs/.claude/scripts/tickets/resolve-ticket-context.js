#!/usr/bin/env node

/**
 * resolve-ticket-context.js — make-ticket の中央判断エンジン
 *
 * /make-ticket スラッシュコマンドの最初に実行される。--ticket-key を必須引数とし、
 * 以下の情報を機械的に判定して JSON 出力する:
 *
 * - Tickets.json の存在（なければ自動生成）
 * - チケットの存在有無（新規 or 深掘り）
 * - spec ファイルの存在有無（なければ --title があれば自動作成）
 * - パイプライン情報（resolvedPaths / metadata.source）の有無
 * - AI が次に行うべきアクション（instruction）
 *
 * --title を指定すると、チケットや spec が存在しない場合に自動作成する。
 *
 * CLI: resolve-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}> [--title="タイトル"]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * コマンドライン引数をパースする
 * --ticket-key は必須。--title はオプション（指定時は spec を自動作成）。
 * --tickets は省略時は CWD の Tickets.json。
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let title = '';

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg.startsWith('--title=')) {
      title = arg.slice('--title='.length);
    }
  }

  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }

  return { ticketsPath, ticketKey, title };
}

/**
 * ticketKey が P{phaseId}-{ticketId} または PX-{ticketId} 形式か検証する
 */
function isValidTicketKey(ticketKey) {
  return /^P([Xx]|-?\d+)-(\d+)$/.test(ticketKey);
}

/**
 * 子プロセスで ensure-tickets-json.js を実行する
 */
function runEnsureTicketsJson(ticketsDir) {
  const scriptPath = path.join(__dirname, 'ensure-tickets-json.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error('ensure-tickets-json.js が見つかりません');
  }
  execFileSync(process.execPath, [scriptPath, `--dir=${ticketsDir}`], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * 子プロセスで create-spec.js を実行し、出力をパースする
 * @returns {{ ticketId: number, specPath: string }}
 */
function runCreateSpec(title) {
  const scriptPath = path.join(__dirname, 'create-spec.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error('create-spec.js が見つかりません');
  }
  const stdout = execFileSync(process.execPath, [scriptPath, '', title], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const result = JSON.parse(stdout);
  if (!result.success) {
    throw new Error(`create-spec.js 失敗: ${result.error || '不明'}`);
  }
  return { ticketId: result.ticketId, specPath: result.specPath };
}

/**
 * 子プロセスで add-ticket.js を実行する
 * @returns {{ ticketKey: string }}
 */
function runAddTicket(ticketsPath, title, specPath) {
  const scriptPath = path.join(__dirname, 'add-ticket.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error('add-ticket.js が見つかりません');
  }
  const input = JSON.stringify({ title, referenceSection: specPath });
  const stdout = execFileSync(process.execPath, [scriptPath, ticketsPath, 'PX'], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const result = JSON.parse(stdout);
  if (!result.success) {
    throw new Error(`add-ticket.js 失敗: ${result.error || '不明'}`);
  }
  return { ticketKey: result.ticketKey || '' };
}

/**
 * Tickets.json から該当チケットが存在するか確認する
 */
function ticketExists(tickets, phaseId, ticketId) {
  const phases = tickets.phases || [];
  for (const phase of phases) {
    if (phase.id !== phaseId && phase.phaseId !== phaseId) continue;
    return (phase.tickets || []).some(t => t.id === ticketId);
  }
  return false;
}

/**
 * ticketKey をパースして phaseId / ticketId を返す
 * P{phaseId}-{ticketId} 形式（例: P0-1）と PX-{ticketId} 形式（例: PX-53）に対応
 */
function parseTicketKey(ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/i);
  if (pxMatch) {
    return { phaseId: -1, ticketId: parseInt(pxMatch[1], 10) };
  }
  const pMatch = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (pMatch) {
    return { phaseId: parseInt(pMatch[1], 10), ticketId: parseInt(pMatch[2], 10) };
  }
  return null;
}

/**
 * Tickets.json の metadata から RFC_PATH を解決する
 *
 * 優先順位:
 *   1. metadata.resolvedPaths が存在し全ファイル実在 → 推測不要
 *   2. metadata.source が .md ファイル → derivePaths で導出
 *   3. metadata.source が .json ファイル → -GRAPH.json→.md 置換
 *   4. いずれも該当なし → RFC_PATH なし
 *
 * @param {string} rawSource — Tickets.json の metadata.source の生の値
 * @param {string} ticketsDir — Tickets.json があるディレクトリの絶対パス
 * @param {Object} [resolvedPaths] — Tickets.json の metadata.resolvedPaths（省略可）
 * @returns {{ rfcPath: string, graphPath: string, dirsTreePath: string, rfcPathSource: string }}
 */
function resolveRfcPaths(rawSource, ticketsDir, resolvedPaths) {
  // 最優先: resolvedPaths が存在し全ファイルが実在するか確認
  if (resolvedPaths && resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    const rfcPath = path.resolve(ticketsDir, resolvedPaths.rfcPath);
    const graphPath = path.resolve(ticketsDir, resolvedPaths.graphPath);
    const dirsTreePath = path.resolve(ticketsDir, resolvedPaths.dirsTreePath);
    if (fs.existsSync(rfcPath) && fs.existsSync(graphPath) && fs.existsSync(dirsTreePath)) {
      return { rfcPath, graphPath, dirsTreePath, rfcPathSource: 'resolvedPaths' };
    }
  }

  // フォールバック: metadata.source からの推測
  if (!rawSource) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'none' };
  }

  const resolved = path.resolve(ticketsDir, rawSource);

  if (!fs.existsSync(resolved)) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'not_found' };
  }

  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.md') {
    // metadata.source が .md ファイル（formulate-tickets 経路）
    const dir = path.dirname(resolved);
    const basename = path.basename(resolved, '.md');
    return {
      rfcPath: resolved,
      graphPath: path.join(dir, `${basename}-GRAPH.json`),
      dirsTreePath: path.join(dir, `${basename}-Dirs-Tree.json`),
      rfcPathSource: 'metadata.source.md',
    };
  }

  if (ext === '.json') {
    // ケース b: metadata.source が .json ファイル（GRAPH.json）
    // -GRAPH.json を .md に置換して RFC 文書パスを導出
    const dir = path.dirname(resolved);
    const basename = path.basename(resolved, '.json');
    // basename が "-GRAPH" で終わる場合、それを除去
    const rfcBasename = basename.endsWith('-GRAPH')
      ? basename.slice(0, -6)
      : basename;
    const rfcPath = path.join(dir, `${rfcBasename}.md`);

    return {
      rfcPath,
      graphPath: resolved,
      dirsTreePath: path.join(dir, `${rfcBasename}-Dirs-Tree.json`),
      rfcPathSource: 'metadata.source.json',
    };
  }

  // ケース c: 未知の拡張子 → スポットモード扱い
  return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'unknown' };
}

/**
 * RFC_PATH から GRAPH_PATH と DIRS_TREE_PATH を導出する（従来の派生用）
 */
function derivePaths(rfcPath) {
  const dir = path.dirname(rfcPath);
  const basename = path.basename(rfcPath, '.md');
  return {
    graphPath: path.join(dir, `${basename}-GRAPH.json`),
    dirsTreePath: path.join(dir, `${basename}-Dirs-Tree.json`),
  };
}

/**
 * instruction を条件分岐で機械的に生成する
 */
function generateInstruction(ticketKey, ticketExistsFlag, specExistsFlag, rfcPath, rfcPathSource, rfcExists, graphExists, dirsExists) {
  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    return '/make-ticket の引数が指定されていないか、形式が正しくありません。P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。';
  }
  if (!ticketExistsFlag) {
    return 'チケットが存在しません。--title を指定して再実行すると spec 作成＋チケット追加を自動で行います。';
  }
  if (!specExistsFlag) {
    return 'spec ファイルが見つかりません。--title を指定して再実行すると spec を自動作成します。';
  }
  if (!rfcPath) {
    if (rfcPathSource === 'none') {
      return 'パイプライン情報がありません（metadata.source 未設定、スポットチケット）。Step 7 はスキップしてください。Step 4 はスポット調査のみで構いません。';
    }
    if (rfcPathSource === 'not_found') {
      return 'metadata.source に指定されたファイルが存在しません。パスを確認してください。Step 7 はスキップします。';
    }
    return 'metadata.source の形式が不明です（.md でも .json でもありません）。Step 7 はスキップします。';
  }
  if (!rfcExists) {
    return 'metadata.source から導出した設計書ファイルが存在しません。パスを確認してください。Step 7 はスキップします。';
  }
  if (!graphExists || !dirsExists) {
    return 'パイプライン情報が不完全です（GRAPH.json または Dirs-Tree.json が不足）。Step 7 はスキップしてください。';
  }
  return 'パイプライン情報が全て揃っています。Step 7 で機械的書き込みを実行できます。Step 4 ではグラフのノード情報を活用した調査を行ってください。';
}

/**
 * メイン処理
 */
function main() {
  const { ticketsPath, ticketKey, title } = parseArguments();

  // --ticket-key の検証
  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    console.log(JSON.stringify({
      success: false,
      error: '/make-ticket の引数が不正です。P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。',
      instruction: '/make-ticket コマンドの第1引数にチケットキーを指定してください。',
    }));
    process.exit(EXIT_FAILURE);
  }

  // --title の検証（必須）
  if (!title) {
    console.log(JSON.stringify({
      success: false,
      error: '--title が指定されていません。',
      instruction: '--title="タイトル" を指定して再実行してください。',
    }));
    process.exit(EXIT_FAILURE);
  }

  // Tickets.json が存在しなければ内部で ensure-tickets-json.js を呼び出して作成
  const ticketsDir = path.dirname(ticketsPath);
  if (!fs.existsSync(ticketsPath)) {
    try {
      runEnsureTicketsJson(ticketsDir);
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: `Tickets.json の作成に失敗しました: ${e.message}`,
        instruction: 'ensure-tickets-json.js のエラーを確認してください。',
      }));
      process.exit(EXIT_FAILURE);
    }
  }

  /**
   * Tickets.json を読み込み直す内部関数
   */
  function reloadTickets() {
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  }

  /**
   * 現在の Tickets.json の状態から exists / specPath / specExists を再計算する
   */
  function resolveTicketState(tickets, parsed) {
    const ex = parsed ? ticketExists(tickets, parsed.phaseId, parsed.ticketId) : false;
    let sp = '', sEx = false;
    if (ex && parsed) {
      const phases = tickets.phases || [];
      for (const phase of phases) {
        if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
        const ticket = (phase.tickets || []).find(t => t.id === parsed.ticketId);
        if (ticket && ticket.referenceSection) {
          sp = path.resolve(ticketsDir, ticket.referenceSection);
          sEx = fs.existsSync(sp);
        }
        break;
      }
    }
    return { exists: ex, specPath: sp, specExists: sEx };
  }

  let tickets = reloadTickets();
  const parsed = parseTicketKey(ticketKey);
  let { exists, specPath, specExists } = resolveTicketState(tickets, parsed);

  // --title が指定されている場合、不足を自動で作成する
  let autoCreated = false;
  if (title && parsed) {
    if (!exists) {
      // チケットも spec も存在しない → create-spec → add-ticket
      const spec = runCreateSpec(title);
      specPath = spec.specPath;
      runAddTicket(ticketsPath, title, specPath);
      tickets = reloadTickets();
      const state = resolveTicketState(tickets, parsed);
      exists = state.exists;
      specPath = state.specPath;
      specExists = state.specExists;
      autoCreated = true;
    } else if (exists && !specExists) {
      // チケットはあるが spec がない → create-spec のみ
      const spec = runCreateSpec(title);
      specPath = spec.specPath;
      // referenceSection を新しい spec パスに更新
      const phases = tickets.phases || [];
      for (const phase of phases) {
        if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
        const ticket = (phase.tickets || []).find(t => t.id === parsed.ticketId);
        if (ticket) {
          ticket.referenceSection = specPath;
          break;
        }
        break;
      }
      fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2) + '\n', 'utf8');
      specExists = true;
      autoCreated = true;
    }
  }

  // metadata から全パスを解決（resolvedPaths 最優先→metadata.source フォールバック）
  const rawSource = (tickets.metadata && tickets.metadata.source) || '';
  const resolvedPaths = (tickets.metadata && tickets.metadata.resolvedPaths) || null;
  const {
    rfcPath,
    graphPath,
    dirsTreePath,
    rfcPathSource,
  } = resolveRfcPaths(rawSource, ticketsDir, resolvedPaths);

  // 各ファイルの実在確認
  const rfcExists = rfcPath ? fs.existsSync(rfcPath) : false;
  const graphExists = graphPath ? fs.existsSync(graphPath) : false;
  const dirsExists = dirsTreePath ? fs.existsSync(dirsTreePath) : false;

  // pipelineAvailable は rfcPath が実在する .md ファイルであることが前提
  const pipelineAvailable = !!(
    exists &&
    rfcPath &&
    rfcExists &&
    rfcPath.toLowerCase().endsWith('.md') &&
    graphExists &&
    dirsExists
  );

  // available / missing を収集
  const available = [];
  const missing = [];
  if (ticketKey) available.push('ticketKey'); else missing.push('ticketKey');
  if (exists) available.push('exists'); else missing.push('exists');
  if (specExists) available.push('specExists'); else if (exists) missing.push('specExists');
  if (rfcPath && rfcExists) available.push('rfcPath'); else missing.push('rfcPath');
  if (graphExists) available.push('graphPath'); else missing.push('graphPath');
  if (dirsExists) available.push('dirsTreePath'); else missing.push('dirsTreePath');

  const instruction = generateInstruction(ticketKey, exists, specExists, rfcPath, rfcPathSource, rfcExists, graphExists, dirsExists);

  console.log(JSON.stringify({
    success: true,
    ticketKey,
    exists,
    specPath,
    specExists,
    autoCreated,
    rfcPath,
    rfcPathSource,
    graphPath,
    dirsTreePath,
    pipelineAvailable,
    available,
    missing,
    instruction,
  }));
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArguments, resolveRfcPaths, derivePaths, generateInstruction, main, isValidTicketKey, parseTicketKey, ticketExists, runEnsureTicketsJson, runCreateSpec, runAddTicket };
