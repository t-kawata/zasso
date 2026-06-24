/**
 * get-ticket-as-markdown.js — Tickets.json のチケット情報を Markdown で出力する
 *
 * get-ticket.js の findTicket() でチケットを取得し、結果を Markdown に整形して
 * 標準出力に書き出す。AI が読みやすい形式でチケットの全フィールドを表示する。
 *
 * 使用法:
 *   node get-ticket-as-markdown.js <PATH of Tickets.json> <P{phaseID}-{ticketID}>
 *   node get-ticket-as-markdown.js <PATH of Tickets.json> PX-{ticketID}
 *
 * 成功時: Markdown 形式で出力、exit 0
 * エラー時: "## Error" + 説明、exit 1
 */

const { findTicket } = require('./get-ticket');

function fmtStatus(status) {
  var m = { todo: 'todo', done: 'done', reviewed: 'reviewed' };
  return m[status] || status;
}

function renderTicket(ticketKey, phaseName, ticket) {
  var lines = [];
  lines.push('## Ticket: ' + ticketKey);
  lines.push('');
  lines.push('- **Phase:** ' + (phaseName || ''));
  lines.push('- **Status:** ' + fmtStatus(ticket.status));

  if (ticket.startedAt) lines.push('- **startedAt:** ' + ticket.startedAt);
  if (ticket.completedAt) lines.push('- **completedAt:** ' + ticket.completedAt);

  var strFields = ['title', 'background', 'referenceSection', 'relatedTicketIds', 'invariants', 'instrumentation', 'notes'];
  for (var i = 0; i < strFields.length; i++) {
    var f = strFields[i];
    if (ticket[f] !== undefined && ticket[f] !== null && ticket[f] !== '') {
      lines.push('');
      lines.push('### ' + f);
      lines.push('');
      lines.push(ticket[f]);
    }
  }

  var arrFields = ['scope', 'testVerification', 'testExceptions', 'referenceUrls', 'sourcePaths', 'rfcDiscrepancies'];
  for (var j = 0; j < arrFields.length; j++) {
    var af = arrFields[j];
    if (Array.isArray(ticket[af]) && ticket[af].length > 0) {
      lines.push('');
      lines.push('### ' + af);
      lines.push('');
      for (var k = 0; k < ticket[af].length; k++) {
        lines.push('- ' + ticket[af][k]);
      }
    }
  }

  if (Array.isArray(ticket.changes) && ticket.changes.length > 0) {
    lines.push('');
    lines.push('### changes');
    lines.push('');
    for (var ci = 0; ci < ticket.changes.length; ci++) {
      var c = ticket.changes[ci];
      lines.push('- **before:** ' + (c.before || ''));
      lines.push('  **after:** ' + (c.after || ''));
      if (c.description) lines.push('  **description:** ' + c.description);
    }
  }

  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

function main() {
  var jp = process.argv[2];
  var key = process.argv[3];

  if (!jp || !key) {
    console.log('## Error\n\nUsage: `node get-ticket-as-markdown.js <PATH of Tickets.json> <P{phaseID}-{ticketID}>`');
    process.exit(1);
  }

  try {
    var result = findTicket(jp, key);
    console.log(renderTicket(result.ticketKey, result.phase, result.ticket));
  } catch (e) {
    console.log('## Error\n\n' + e.message);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { main };
