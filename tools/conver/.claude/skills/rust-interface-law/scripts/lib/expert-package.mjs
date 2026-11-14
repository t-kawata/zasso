// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
/**
 * Parse the self-contained expert review package into parts, headings, and
 * rule table rows.
 *
 * The package is the primary source for the law bundle. It is not a uniform
 * document: rule tables have two, three, or five columns, and prose tables use
 * the same pipe syntax. The parser therefore keys on the table header names and
 * ignores fenced code.
 */

const PART_PREFIX = /^# (PART\s+[^\n]+)$/;
const HEADING = /^(##|###)\s+(.+)$/;
const TABLE_HEADER = /^\|\s*ID\s*\|/i;
const RULE_ID = /^[A-Z][A-Z0-9-]*-\d+$/;

export function parseExpertPackage(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const offsets = lineOffsets(lines);
  const parts = readParts(lines, offsets);
  const headings = readHeadings(lines, offsets, parts);
  const ruleRows = readRuleRows(lines, headings);
  return { parts, headings, ruleRows, lines, offsets };
}

export function sectionByPath(tree, path) {
  return tree.headings.find((heading) => heading.path === path) ?? null;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function readParts(lines, offsets) {
  const parts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(PART_PREFIX);
    if (!match) continue;
    const label = match[1];
    parts.push({
      id: slug(label.split('—')[0].trim()),
      title: label,
      line: index + 1,
      start: offsets[index],
      end: lines.length,
    });
  }
  for (let index = 0; index < parts.length; index += 1) {
    parts[index].end = index + 1 < parts.length ? parts[index + 1].start : Number.MAX_SAFE_INTEGER;
  }
  if (parts.length > 0 && parts[0].start > 0) {
    parts.unshift({ id: 'front', title: 'Front matter', line: 1, start: 0, end: parts[0].start });
  }
  return parts;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function readHeadings(lines, offsets, parts) {
  const headings = [];
  const seen = new Set();
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = line.match(HEADING);
    if (!match) continue;
    const owner = parts.find((entry) => offsets[index] >= entry.start && offsets[index] < entry.end);
    if (!owner) continue;
    const level = match[1].length;
    const title = match[2].trim();
    const base = `${owner.id}/${slug(title)}`;
    const path = uniquePath(base, seen);
    headings.push({
      path,
      level,
      title,
      line: index + 1,
      start: offsets[index],
      end: offsets[offsets.length - 1],
      part: owner.id,
    });
  }
  assignEnds(headings, offsets);
  assignText(headings, lines);
  return headings;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function assignEnds(headings, offsets) {
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    heading.end = index + 1 < headings.length ? offsets[headings[index + 1].line - 1] : offsets[offsets.length - 1];
  }
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function assignText(headings, lines) {
  for (const heading of headings) {
    const startLine = heading.line - 1;
    const endLine = lineForOffset(lines, heading.end) ?? lines.length;
    heading.text = lines.slice(startLine, endLine).join('\n').trim();
  }
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function readRuleRows(lines, headings) {
  const rows = [];
  const seen = new Set();
  let fenced = false;
  let columns = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      fenced = !fenced;
      columns = null;
      continue;
    }
    if (fenced) continue;
    if (TABLE_HEADER.test(line)) {
      columns = parseHeader(line);
      continue;
    }
    if (!columns) continue;
    if (!/^\|/.test(line)) {
      columns = null;
      continue;
    }
    const cells = splitCells(line);
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell) || cell.length === 0)) continue;
    const id = stripCode(cells[columns.id] ?? '').trim();
    if (!RULE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const heading = nearestHeading(headings, index + 1);
    rows.push({
      id,
      line: index + 1,
      sectionPath: heading?.path ?? null,
      statement: cells[columns.rule] ?? '',
      fixed: columns.fixed === undefined ? null : (cells[columns.fixed] ?? ''),
      open: columns.open === undefined ? null : (cells[columns.open] ?? ''),
      verification: columns.verification === undefined ? null : (cells[columns.verification] ?? ''),
    });
  }
  return rows;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function parseHeader(line) {
  const names = splitCells(line).map((cell) => cell.toLowerCase());
  const find = (...candidates) => {
    for (const candidate of candidates) {
      const index = names.findIndex((name) => name === candidate);
      if (index >= 0) return index;
    }
    return undefined;
  };
  return {
    id: find('id'),
    rule: find('rule', 'statement', 'invariant', 'requirement', 'guarantee'),
    fixed: find('fixed'),
    open: find('open'),
    verification: find('verification'),
  };
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function splitCells(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function stripCode(value) {
  return String(value ?? '').replace(/`/g, '');
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function nearestHeading(headings, line) {
  let found = null;
  for (const heading of headings) {
    if (heading.line <= line) found = heading;
    else break;
  }
  return found;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function uniquePath(base, seen) {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) suffix += 1;
  const path = `${base}-${suffix}`;
  seen.add(path);
  return path;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function lineForOffset(lines, offset) {
  let total = 0;
  for (let index = 0; index < lines.length; index += 1) {
    total += lines[index].length + 1;
    if (total > offset) return index + 1;
  }
  return lines.length;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function lineOffsets(lines) {
  const offsets = [];
  let total = 0;
  for (const line of lines) {
    offsets.push(total);
    total += line.length + 1;
  }
  return offsets;
}

// [::TICKET::] PX-428, PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-428|PX-427) --for-spec --no-implementation-order`.
function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';
}
