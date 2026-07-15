#!/usr/bin/env node

/**
 * create-spec.js — 実装仕様 (spec) ファイル作成
 *
 * 新しい命名規則: {ticketsDir}/specs/{ticketKey}.md
 * ticketsDir は Tickets.json のディレクトリ、ticketKey は "P0-1" 形式。
 *
 * CLI: create-spec.js <ticketKey> [title] [status] [--tickets=<path>]
 *
 * 引数:
 *   ticketKey   — 必須。チケットキー（例: "P0-1", "PX-5"）
 *   title       — オプション。チケットタイトル（省略時は stdin JSON の title）
 *   status      — オプション。初期ステータス（デフォルト: "draft"）
 *   --tickets=  — オプション。Tickets.json のパス（デフォルト: "Tickets.json"）
 *
 * stdin から JSON { title, status } を受け付ける（CLI引数より優先度低）。
 */

const fs = require('fs');
const path = require('path');
const { resolveTicketSpecPath, generateSlug, makeUniqueSlug, collectSlugs } = require('../lib/tickets');

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey = '';
  let title = '';
  let status = 'draft';
  let ticketsPath = 'Tickets.json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (!ticketKey && !arg.startsWith('-')) {
      ticketKey = arg;
    } else if (ticketKey && !title && !arg.startsWith('-')) {
      title = arg;
    } else if (ticketKey && title && !status && !arg.startsWith('-')) {
      status = arg;
    }
  }

  return { ticketKey, title, status, ticketsPath };
}

function main() {
  const { ticketKey, title: cliTitle, status: cliStatus, ticketsPath: rawTicketsPath } = parseArgs();

  // ticketKey は必須
  if (!ticketKey) {
    console.log(JSON.stringify({
      success: false,
      error: 'Usage: create-spec.js <ticketKey> [title] [status] [--tickets=<path>]',
    }));
    process.exit(1);
  }

  // stdin から title/status を読み取り（CLI引数より優先度低）
  let input = {};
  try {
    const stdin = fs.readFileSync(process.stdin.fd, 'utf8').trim();
    if (stdin) input = JSON.parse(stdin);
  } catch (e) { /* ignore */ }

  const title = cliTitle || input.title;
  if (!title) {
    console.log(JSON.stringify({ success: false, error: 'Title is required. Pass as 2nd arg or via stdin JSON.' }));
    process.exit(1);
  }

  const status = cliStatus || input.status || 'draft';
  const ticketsPath = path.resolve(rawTicketsPath);
  const ticketsDir = path.dirname(ticketsPath);

  // 新しい命名規則: {ticketsDir}/specs/{ticketKey}.md
  const specPath = resolveTicketSpecPath(ticketsDir, ticketKey);
  const specsDir = path.dirname(specPath);

  // specs ディレクトリがなければ作成
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  // 既存ファイルの上書きを防止
  if (fs.existsSync(specPath)) {
    console.log(JSON.stringify({ success: false, error: `Spec already exists at ${specPath}` }));
    process.exit(1);
  }

  // slug は frontmatter 用（ファイル名には使用しない）
  const slug = makeUniqueSlug(generateSlug(title), collectSlugs(specsDir));

  // spec ファイル作成
  const now = new Date().toISOString().slice(0, 10);
  const frontmatter = {
    ticket_id: ticketKey,
    title,
    slug,
    status,
    created_at: now,
    updated_at: now,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = `# ${title}\n\n## Summary\n\n<!-- このチケットで達成することの簡潔な説明 -->\n\n## Background\n\n<!-- なぜこのチケットが必要か -->\n\n## Scope\n\n<!-- 何をするか -->\n\n## Notes\n\n`;
  const content = `---\n${yaml}\n---\n\n${body}`;

  fs.writeFileSync(specPath, content, 'utf8');
  console.log(JSON.stringify({
    success: true,
    ticketKey,
    title,
    slug,
    status,
    specPath,
  }));
}

if (require.main === module) main();
module.exports = { main };
