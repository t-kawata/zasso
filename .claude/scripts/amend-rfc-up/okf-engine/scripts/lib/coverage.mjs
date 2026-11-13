// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
const STRUCTURAL = new Set(['Heading', 'Blank', 'TableHeader']);

export function attributeCoverage(atoms, lineCount) {
  const owners = new Map();
  const overlaps = [];

  for (const atom of atoms) {
    for (let line = atom.span.start_line; line <= atom.span.end_line; line++) {
      if (owners.has(line)) {
        overlaps.push({ line, first: owners.get(line), second: atom.id ?? null });
      } else {
        owners.set(line, atom.id ?? null);
      }
    }
  }

  const gaps = [];
  for (let line = 1; line <= lineCount; line++) {
    if (!owners.has(line)) gaps.push(line);
  }

  const excluded = atoms
    .filter((atom) => STRUCTURAL.has(atom.type))
    .reduce((total, atom) => total + atom.span.end_line - atom.span.start_line + 1, 0);

  return { attributed: owners.size, excluded, gaps, overlaps };
}
