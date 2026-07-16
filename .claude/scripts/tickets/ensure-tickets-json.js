#!/usr/bin/env node

/**
 * ensure-tickets-json.js — Tickets.json 存在保証スクリプト
 *
 * Tickets.json の存在を確認し、存在しない場合はテンプレートと PX phase を自動作成する。
 * 出力は機械的に解析可能な JSON（instruction フィールド付き）。
 *
 * CLI: ensure-tickets-json.js --dir=<path>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/**
 * コマンドライン引数をパースする
 */
function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const dirFlag = args.find(a => a.startsWith('--dir='));
  const dir = dirFlag ? dirFlag.slice('--dir='.length) : '.';
  return path.resolve(dir);
}

/**
 * 子プロセスでスクリプトを実行する
 */
function runScript(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`${scriptName} が見つかりません: ${scriptPath}`);
  }
  return execFileSync(process.execPath, [scriptPath, ...scriptArgs], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * メイン処理
 */
function main() {
  const dir = parseArguments();
  const ticketsPath = path.join(dir, 'Tickets.json');
  const existed = fs.existsSync(ticketsPath);

  if (existed) {
    console.log(JSON.stringify({
      success: true,
      path: ticketsPath,
      existed: true,
      instruction: 'Tickets.json は既に存在します。add-ticket.js でチケットを追加し、resolve-ticket-context.js を実行してください。',
    }));
    process.exit(EXIT_SUCCESS);
  }

  // Tickets.json が存在しない場合: テンプレート作成 + PX phase 作成
  try {
    runScript('write-tickets-json-template.js', [
      ticketsPath,
      JSON.stringify({
        title: 'Tickets',
        source: '',
        generatedAt: new Date().toISOString().slice(0, 10),
      }),
    ]);
  } catch (e) {
    process.stderr.write(`[ERROR] write-tickets-json-template.js の実行に失敗しました。\n原因: ${e.message}\n`);
    process.exit(EXIT_FAILURE);
  }

  try {
    runScript('add-px-phase.js', [ticketsPath]);
  } catch (e) {
    process.stderr.write(`[ERROR] add-px-phase.js の実行に失敗しました。\n原因: ${e.message}\n`);
    process.exit(EXIT_FAILURE);
  }

  console.log(JSON.stringify({
    success: true,
    path: ticketsPath,
    existed: false,
    instruction: 'Tickets.json を作成しました。add-ticket.js でチケットを追加した後、resolve-ticket-context.js を実行してください。',
  }));
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) {
  main();
}

module.exports = { parseArguments, main };
