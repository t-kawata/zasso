#!/usr/bin/env node

/**
 * sync-ticket-to-spec.js — チケットJSONのフィールドを spec ファイルに転記する
 *
 * Step 6 で実行。ticketKey で指定されたチケットの background / scope / testUnit /
 * testIntegration / testExceptions / default_files / notes を spec ファイルの
 * 該当セクションに書き込む。既存セクションはスキップする（冪等）。
 *
 * CLI: sync-ticket-to-spec.js --tickets=<Tickets.json> --ticket-key=<P{id}-{id}>
 */

const fs = require('fs');
const path = require('path');
const { appendToSpec } = require('../rfc-graph/dump-node-context-to-spec');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--ticket-key=')) ticketKey = arg.slice('--ticket-key='.length);
  }
  if (!ticketsPath) ticketsPath = path.resolve('Tickets.json');
  else ticketsPath = path.resolve(ticketsPath);
  return { ticketsPath, ticketKey };
}

function parseTicketKey(key) {
  const px = key.match(/^PX-(\d+)$/i);
  if (px) return { phaseId: -1, ticketId: parseInt(px[1], 10) };
  const p = key.match(/^P(-?\d+)-(\d+)$/);
  if (p) return { phaseId: parseInt(p[1], 10), ticketId: parseInt(p[2], 10) };
  return null;
}

function findTicket(tickets, parsed) {
  if (!parsed) return null;
  for (const phase of tickets.phases || []) {
    if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
    return (phase.tickets || []).find(t => t.id === parsed.ticketId) || null;
  }
  return null;
}

/**
 * チケットフィールドを spec のセクションとして書き込む
 * appendToSpec は既存セクション見出しを検出してスキップするため冪等
 */
function writeFieldsToSpec(specPath, ticket) {
  // 各フィールド → spec セクションのマッピング
  const fields = [];

  if (ticket.background) {
    fields.push({ heading: '## Background', text: ticket.background });
  }

  if (ticket.scope && ticket.scope.length > 0) {
    const items = ticket.scope.map(s => `- ${s}`).join('\n');
    fields.push({ heading: '## Scope', text: items });
  }

  if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
    const items = ticket.acceptanceCriteria.map(a => `- ${a}`).join('\n');
    fields.push({ heading: '## Acceptance Criteria', text: items });
  }

  if (ticket.default_files && ticket.default_files.length > 0) {
    const items = ticket.default_files.map(f => `- \`${f}\``).join('\n');
    fields.push({ heading: '## Implementation Target Files', text: items });
  }

  if (ticket.testUnit && ticket.testUnit.length > 0) {
    const items = ticket.testUnit.map(u => `- ${u}`).join('\n');
    fields.push({ heading: '### Unit Tests', text: items });
  }

  if (ticket.testIntegration && ticket.testIntegration.length > 0) {
    const items = ticket.testIntegration.map(i => `- ${i}`).join('\n');
    fields.push({ heading: '### Integration Tests', text: items });
  }

  if (ticket.testExceptions && ticket.testExceptions.length > 0) {
    const items = ticket.testExceptions.map(e => `- ${e}`).join('\n');
    fields.push({ heading: '### Exceptions', text: items });
  }

  if (ticket.investigation) {
    fields.push({ heading: '## Investigation', text: ticket.investigation });
  }

  if (ticket.notes) {
    fields.push({ heading: '## Notes', text: ticket.notes });
  }

  // appendToSpec に渡す完全なセクション文字列を構築して書き込み
  for (const f of fields) {
    const section = f.heading + '\n\n' + f.text;
    try {
      appendToSpec(specPath, section);
    } catch (e) {
      console.error(`Warning: ${f.heading} の書き込みに失敗: ${e.message}`);
    }
  }
}

function main() {
  const { ticketsPath, ticketKey } = parseArgs();

  if (!ticketKey || !parseTicketKey(ticketKey)) {
    console.error('Usage: sync-ticket-to-spec.js --ticket-key=<P{id}-{id}> [--tickets=<path>]');
    process.exit(EXIT_FAILURE);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error(`Tickets.json が見つかりません: ${ticketsPath}`);
    process.exit(EXIT_FAILURE);
  }

  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const parsed = parseTicketKey(ticketKey);
  const ticket = findTicket(tickets, parsed);

  if (!ticket) {
    console.error(`チケット ${ticketKey} が見つかりません`);
    process.exit(EXIT_FAILURE);
  }

  // specPath から spec ファイルのパスを解決
  if (!ticket.specPath) {
    console.error(`チケット ${ticketKey} に specPath（spec ファイルのパス）がありません`);
    process.exit(EXIT_FAILURE);
  }
  const ticketsDir = path.dirname(ticketsPath);
  const specPath = path.resolve(ticketsDir, ticket.specPath);

  if (!fs.existsSync(specPath)) {
    console.error(`spec ファイルが見つかりません: ${specPath}`);
    process.exit(EXIT_FAILURE);
  }

  writeFieldsToSpec(specPath, ticket);
  console.log(`synced ${ticketKey} → ${specPath}`);
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) main();
module.exports = { parseArgs, writeFieldsToSpec, main };
