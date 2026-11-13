// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
const BLANK = /^\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*```/;
const FENCE_LANGUAGE = /^\s*```([A-Za-z0-9_+-]*)/;
const TABLE = /^\s*\|/;
const LIST = /^\s*(?:[-*+]|\d+\.)\s+/;
const LIST_CONTINUATION = /^\s{2,}\S/;

export function splitLines(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function parseBlocks(text) {
  const lines = splitLines(text);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const start = index;

    if (BLANK.test(lines[index])) {
      while (index < lines.length && BLANK.test(lines[index])) index++;
      blocks.push(makeBlock('blank', lines, start, index));
      continue;
    }

    const heading = lines[index].match(HEADING);
    if (heading) {
      index++;
      blocks.push({
        ...makeBlock('heading', lines, start, index),
        level: heading[1].length,
        heading: heading[2].trim(),
      });
      continue;
    }

    if (FENCE.test(lines[index])) {
      const language = (lines[index].match(FENCE_LANGUAGE) ?? [])[1] ?? '';
      index++;
      while (index < lines.length && !FENCE.test(lines[index])) index++;
      if (index < lines.length) index++;
      blocks.push({ ...makeBlock('code', lines, start, index), language });
      continue;
    }

    if (TABLE.test(lines[index])) {
      while (index < lines.length && TABLE.test(lines[index])) index++;
      const rows = lines.slice(start, index);
      blocks.push({
        ...makeBlock('table', lines, start, index),
        headers: splitRow(rows[0]),
        rows,
      });
      continue;
    }

    if (LIST.test(lines[index])) {
      while (index < lines.length && (LIST.test(lines[index]) || LIST_CONTINUATION.test(lines[index]))) index++;
      blocks.push(makeBlock('list', lines, start, index));
      continue;
    }

    while (
      index < lines.length
      && !BLANK.test(lines[index])
      && !HEADING.test(lines[index])
      && !FENCE.test(lines[index])
      && !TABLE.test(lines[index])
      && !LIST.test(lines[index])
    ) {
      index++;
    }
    blocks.push(makeBlock('paragraph', lines, start, index));
  }

  return blocks;
}

export function splitRow(line) {
  const cells = String(line).split('|').map((cell) => cell.trim());
  if (cells.length > 0 && cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function makeBlock(kind, lines, start, end) {
  return {
    kind,
    start_line: start + 1,
    end_line: end,
    text: lines.slice(start, end).join('\n'),
  };
}
