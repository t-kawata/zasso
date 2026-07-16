#!/usr/bin/env node

/**
 * resolve-ticket-context.js — Mechanical ticket context determination (JSON output)
 *
 * Requires --ticket-key to mechanically determine the following and output as JSON.
 * This was formerly /make-ticket Step 1, but is now replaced by show-ticket-context.js
 * which outputs Markdown as Step 1. This script is maintained for compatibility.
 *
 * - Checks existence of Tickets.json
 * - Checks ticket existence
 * - Checks spec file existence
 * - Checks pipeline info (resolvedPaths / metadata.source) availability
 * - Determines the next AI action (instruction)
 *
 * Note: auto-creation (create-spec.js / add-ticket.js auto-execution) has been
 * delegated to ensure-ticket.js. This script does not create anything.
 *
 * CLI: resolve-ticket-context.js --ticket-key=<P{id}-{id}|PX-{id}>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * Parses command line arguments.
 * --ticket-key is required. --tickets defaults to Tickets.json in CWD.
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
 * Validates that ticketKey matches P{phaseId}-{ticketId} or PX-{ticketId} format
 */
function isValidTicketKey(ticketKey) {
  return /^P([Xx]|-?\d+)-(\d+)$/.test(ticketKey);
}

/**
 * Runs ensure-tickets-json.js as a child process
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
 * Checks whether the specified ticket exists in Tickets.json
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
 * Parses ticketKey into phaseId / ticketId.
 * Supports P{phaseId}-{ticketId} format (e.g., P0-1) and PX-{ticketId} format (e.g., PX-53)
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
 * Resolves RFC_PATH from Tickets.json metadata.
 *
 * Priority order:
 *   1. metadata.resolvedPaths exists and all files exist on disk → no guessing needed
 *   2. metadata.source is a .md file → derive via derivePaths
 *   3. metadata.source is a .json file → -GRAPH.json → .md replacement
 *   4. None of the above → no RFC_PATH
 *
 * @param {string} rawSource — raw value of Tickets.json metadata.source
 * @param {string} ticketsDir — absolute path to the directory containing Tickets.json
 * @param {Object} [resolvedPaths] — Tickets.json metadata.resolvedPaths (optional)
 * @returns {{ rfcPath: string, graphPath: string, dirsTreePath: string, rfcPathSource: string }}
 */
function resolveRfcPaths(rawSource, ticketsDir, resolvedPaths) {
  // Priority 1: check if resolvedPaths exists and all files are present on disk
  if (resolvedPaths && resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    const rfcPath = path.resolve(ticketsDir, resolvedPaths.rfcPath);
    const graphPath = path.resolve(ticketsDir, resolvedPaths.graphPath);
    const dirsTreePath = path.resolve(ticketsDir, resolvedPaths.dirsTreePath);
    if (fs.existsSync(rfcPath) && fs.existsSync(graphPath) && fs.existsSync(dirsTreePath)) {
      return { rfcPath, graphPath, dirsTreePath, rfcPathSource: 'resolvedPaths' };
    }
  }

  // Fallback: guess from metadata.source
  if (!rawSource) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'none' };
  }

  const resolved = path.resolve(ticketsDir, rawSource);

  if (!fs.existsSync(resolved)) {
    return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'not_found' };
  }

  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.md') {
    // metadata.source is a .md file (formulate-tickets path)
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
    // Case b: metadata.source is a .json file (GRAPH.json)
    // Replace -GRAPH.json with .md to derive the RFC document path
    const dir = path.dirname(resolved);
    const basename = path.basename(resolved, '.json');
    // If basename ends with "-GRAPH", strip the suffix
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

  // Case c: unknown extension → treat as spot mode
  return { rfcPath: '', graphPath: '', dirsTreePath: '', rfcPathSource: 'unknown' };
}

/**
 * Derives GRAPH_PATH and DIRS_TREE_PATH from RFC_PATH (conventional derivation)
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
 * Generates instruction mechanically via conditional branches
 */
function generateInstruction(ticketKey, ticketExistsFlag, specExistsFlag, rfcPath, rfcPathSource, rfcExists, graphExists, dirsExists) {
  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    return '/make-ticket の引数が指定されていないか、形式が正しくありません。P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。';
  }
  // Note: auto-creation has been delegated to ensure-ticket.js.
  // The two branches below are defensive guards maintained for unit test compatibility.
  if (!ticketExistsFlag) {
    return 'チケットが存在しません。ensure-ticket.js を実行して作成してください。';
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
 * Main entry point
 */
function main() {
  const { ticketsPath, ticketKey } = parseArguments();

  // Validate --ticket-key
  if (!ticketKey || !isValidTicketKey(ticketKey)) {
    console.log(JSON.stringify({
      success: false,
      error: 'チケットキーの形式が不正です。P{phaseId}-{ticketId} 形式（例: P0-1, PX-53）で指定してください。',
      instruction: 'チケットキーを確認して再実行してください。',
    }));
    process.exit(EXIT_FAILURE);
  }

  // Check Tickets.json existence
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

  // Resolve all paths from metadata (resolvedPaths priority → metadata.source fallback)
  const rawSource = (tickets.metadata && tickets.metadata.source) || '';
  const resolvedPaths = (tickets.metadata && tickets.metadata.resolvedPaths) || null;
  const {
    rfcPath,
    graphPath,
    dirsTreePath,
    rfcPathSource,
  } = resolveRfcPaths(rawSource, ticketsDir, resolvedPaths);

  // Check each file's existence
  const rfcExists = rfcPath ? fs.existsSync(rfcPath) : false;
  const graphExists = graphPath ? fs.existsSync(graphPath) : false;
  const dirsExists = dirsTreePath ? fs.existsSync(dirsTreePath) : false;

  // pipelineAvailable requires rfcPath to be an existing .md file
  const pipelineAvailable = !!(
    exists &&
    rfcPath &&
    rfcExists &&
    rfcPath.toLowerCase().endsWith('.md') &&
    graphExists &&
    dirsExists
  );

  // Collect available / missing flags
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
    autoCreated: false,
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
