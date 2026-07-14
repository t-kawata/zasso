#!/usr/bin/env node

/**
 * resolve-ticket-context.js — チケットコンテキストの機械的判定（JSON 出力）
 *
 * --ticket-key を必須引数とし、以下の情報を機械的に判定して JSON 出力する。
 * 旧 /make-ticket の Step 1 だったが、現在は show-ticket-context.js が
 * Markdown 出力の Step 1 として置き換えた。本スクリプトは互換性のために維持する。
 *
 * - Tickets.json の存在確認
 * - チケットの存在有無
 * - spec ファイルの存在有無
 * - パイプライン情報（resolvedPaths / metadata.source）の有無
 * - AI が次に行うべきアクション（instruction）
 *
 * 注: auto-creation（create-spec.js / add-ticket.js の自動実行）は
 * ensure-ticket-and-spec.js に移譲した。本スクリプトは作成を行わない。
 *
 * CLI: resolve-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * コマンドライン引数をパースする
 * --ticket-key は必須。--tickets は省略時は CWD の Tickets.json。
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    }
  }

  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }

  return { ticketsPath, ticketKey };
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
  // 注意: auto-creation は ensure-ticket-and-spec.js に移譲した。
  // 以下の2つの分岐は単体テスト用の防御的ガードとして維持する。
  if (!ticketExistsFlag) {
    return 'チケットが存在しません。ensure-ticket-and-spec.js を実行して作成してください。';
  }
  if (!specExistsFlag) {
    return 'spec ファイルが存在しません（異常状態）。create-spec.js を手動実行して作成してください。';
  }
  if (!rfcPath) {
    if (rfcPathSource === 'none') {
      return 'パイプライン情報がありません（metadata.source 未設定、スポットチケット）。Step 6 はスキップしてください。Step 3 はスポット調査のみで構いません。';
    }
    if (rfcPathSource === 'not_found') {
      return 'metadata.source に指定されたファイルが存在しません。パスを確認してください。Step 6 はスキップします。';
    }
    return 'metadata.source の形式が不明です（.md でも .json でもありません）。Step 6 はスキップします。';
  }
  if (!rfcExists) {
    return 'metadata.source から導出した設計書ファイルが存在しません。パスを確認してください。Step 6 はスキップします。';
  }
  if (!graphExists || !dirsExists) {
    return 'パイプライン情報が不完全です（GRAPH.json または Dirs-Tree.json が不足）。Step 6 はスキップしてください。';
  }
  return 'パイプライン情報が全て揃っています。Step 6 で機械的書き込みを実行できます。Step 3 ではグラフのノード情報を活用した調査を行ってください。';
}

/**
 * メイン処理
 */
function main() {
  const { ticketsPath, ticketKey } = parseArguments();

  // --ticket-key の検証
  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    console.log(JSON.stringify({
      success: false,
      error: 'チケットキーの形式が不正です。P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。',
      instruction: 'チケットキーを確認して再実行してください。',
    }));
    process.exit(EXIT_FAILURE);
  }

  // Tickets.json の存在確認
  const ticketsDir = path.dirname(ticketsPath);
  if (!fs.existsSync(ticketsPath)) {
    console.log(JSON.stringify({
      success: false,
      error: `Tickets.json が見つかりません: ${ticketsPath}`,
      instruction: 'ensure-tickets-json.js で Tickets.json を作成してから再実行してください。',
    }));
    process.exit(EXIT_FAILURE);
  }

  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const parsed = parseTicketKey(ticketKey);
  const exists = parsed ? ticketExists(tickets, parsed.phaseId, parsed.ticketId) : false;
  let specPath = '', specExists = false;
  if (exists && parsed) {
    const phases = tickets.phases || [];
    for (const phase of phases) {
      if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
      const ticket = (phase.tickets || []).find(t => t.id === parsed.ticketId);
      if (ticket && ticket.specPath) {
        specPath = path.resolve(ticketsDir, ticket.specPath);
        specExists = fs.existsSync(specPath);
      }
      break;
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

module.exports = { parseArguments, resolveRfcPaths, derivePaths, generateInstruction, main, isValidTicketKey, parseTicketKey, ticketExists, runEnsureTicketsJson };
