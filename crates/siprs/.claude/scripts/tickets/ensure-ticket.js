#!/usr/bin/env node

/**
 * ensure-ticket.js — チケット不在時にチケットを作成する（spec ファイルは作成しない）
 *
 * /make-ticket の Step 2（判断分岐）で、事前会話からチケット化を依頼された
 * 場合に AI が手動実行する。内部で add-ticket.js を呼び出して Tickets.json に
 * チケットを追加し、最後に show-ticket-context.js を実行して結果を表示する。
 *
 * spec ファイルは作成しない。チケットの specPath は命名規則から決定し、
 * 実際の spec ファイル内容は Step 6（show-ticket-context.js --for-spec）
 * で書き出される。
 *
 * 必須引数: --ticket-key, --title
 * オプション（会話から得た情報をチケットに反映する）:
 *   --background="..."         背景・目的（文字列）
 *   --scope='["item1","..."]'  実装範囲（JSON 配列）
 *   --test-unit='["..."]'        テスト計画: 単体テスト UT:（JSON 配列）
 *   --test-integration='["..."]' テスト計画: 結合テスト IT:（JSON 配列）
 *   --test-exceptions='["..."]'  テスト計画: テスト不可能な項目（JSON 配列）
 *   --default-files='["..."]'  実装対象ファイル（JSON 配列）
 *   --acceptance-criteria='["..."]'  完了条件（JSON 配列）
 *   --notes="..."              補足情報（文字列）
 *
 * CLI: ensure-ticket.js --ticket-key=<PX-{id}> --title="..." [options] [--tickets=<Tickets.json>]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** タイトルから slug（kebab-case）を生成する */
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

/** チケットキーから数値 ID を抽出する */
function extractTicketId(ticketKey) {
  const match = ticketKey.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/** チケットキーとタイトルから spec ファイルのパスを導出する */
function resolveSpecPath(ticketKey, title) {
  const ticketId = extractTicketId(ticketKey);
  if (!ticketId) return null;
  const slug = generateSlug(title);
  const prefix = String(ticketId).padStart(4, '0');
  const filename = slug ? `${prefix}-${slug}.md` : `${prefix}-untitled.md`;
  return path.resolve('tickets', 'specs', filename);
}

/** コマンドライン引数をパースする */
function parseArgs(testArgs) {
  const args = testArgs || process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  let title = '';
  let background = '';
  let scope = null;
  let testUnit = null;
  let testIntegration = null;
  let testExceptions = null;
  let default_files = null;
  let acceptanceCriteria = null;
  let notes = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (arg.startsWith('--title=')) {
      title = arg.slice('--title='.length);
    } else if (arg.startsWith('--background=')) {
      background = arg.slice('--background='.length);
    } else if (arg.startsWith('--scope=')) {
      scope = JSON.parse(arg.slice('--scope='.length));
    } else if (arg.startsWith('--test-unit=')) {
      testUnit = JSON.parse(arg.slice('--test-unit='.length));
    } else if (arg.startsWith('--test-integration=')) {
      testIntegration = JSON.parse(arg.slice('--test-integration='.length));
    } else if (arg.startsWith('--test-exceptions=')) {
      testExceptions = JSON.parse(arg.slice('--test-exceptions='.length));
    } else if (arg.startsWith('--default-files=')) {
      default_files = JSON.parse(arg.slice('--default-files='.length));
    } else if (arg.startsWith('--acceptance-criteria=')) {
      acceptanceCriteria = JSON.parse(arg.slice('--acceptance-criteria='.length));
    } else if (arg.startsWith('--notes=')) {
      notes = arg.slice('--notes='.length);
    }
  }
  if (!ticketsPath) {
    ticketsPath = path.resolve('Tickets.json');
  } else {
    ticketsPath = path.resolve(ticketsPath);
  }
  return { ticketsPath, ticketKey, title, background, scope, testUnit, testIntegration, testExceptions, default_files, acceptanceCriteria, notes };
}

function main() {
  const { ticketsPath, ticketKey, title, background, scope, testUnit, testIntegration, testExceptions, default_files, acceptanceCriteria, notes } = parseArgs();

  if (!ticketKey) {
    console.error('Error: --ticket-key は必須です。');
    process.exit(EXIT_FAILURE);
  }
  if (!title) {
    console.error('Error: --title は必須です。');
    process.exit(EXIT_FAILURE);
  }

  // spec パスを導出（ファイルは作成しない）
  const specPath = resolveSpecPath(ticketKey, title);

  // add-ticket.js で PX フェーズにチケットを追加
  const addTicketScript = path.join(__dirname, 'add-ticket.js');
  if (!fs.existsSync(addTicketScript)) {
    console.error('Error: add-ticket.js が見つかりません。');
    process.exit(EXIT_FAILURE);
  }
  let addResult;
  try {
    const ticketData = { title };
    if (specPath) ticketData.specPath = specPath;
    if (background) ticketData.background = background;
    if (scope) ticketData.scope = scope;
    if (testUnit) ticketData.testUnit = testUnit;
    if (testIntegration) ticketData.testIntegration = testIntegration;
    if (testExceptions) ticketData.testExceptions = testExceptions;
    if (default_files) ticketData.default_files = default_files;
    if (acceptanceCriteria) ticketData.acceptanceCriteria = acceptanceCriteria;
    if (notes) ticketData.notes = notes;
    const input = JSON.stringify(ticketData);
    const stdout = execFileSync(process.execPath, [addTicketScript, ticketsPath, 'PX'], {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    addResult = JSON.parse(stdout);
  } catch (e) {
    console.error(`add-ticket.js の実行に失敗しました: ${e.message}`);
    process.exit(EXIT_FAILURE);
  }
  if (!addResult.success) {
    console.error(`add-ticket.js 失敗: ${addResult.error || '不明'}`);
    process.exit(EXIT_FAILURE);
  }
  const actualTicketKey = addResult.ticketKey || ticketKey;

  // show-ticket-context.js を実行して結果を表示
  const showScript = path.join(__dirname, 'show-ticket-context.js');
  if (!fs.existsSync(showScript)) {
    console.error('Error: show-ticket-context.js が見つかりません。');
    process.exit(EXIT_FAILURE);
  }
  try {
    execFileSync(process.execPath, [showScript, `--ticket-key=${actualTicketKey}`, `--tickets=${ticketsPath}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'pipe'],
    });
  } catch (e) {
    console.error(`show-ticket-context.js の実行に失敗しました: ${e.message}`);
    process.exit(EXIT_FAILURE);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, main, resolveSpecPath, generateSlug, extractTicketId };
