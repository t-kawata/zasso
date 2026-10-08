
/**
 * S27 — a step is stated by PROSE, not by a table.
 *
 * S26 asks whether the steps form an ordered bijection with the operations the sequence names.
 * That is a shape, and a shape can be produced without reading. The first version of
 * sequence-steps.jsonl was built by matching each operation to whichever line of the entry's
 * window mentioned its result object, and then writing a plausible subject and predicate around
 * the match. A-525 — citation issuance, section 3.1 — carried twenty-five steps instructing the
 * Payment-Service to accept receipts, settle payments, create maturity bonds and allocate seed
 * budgets. Twenty-one of them cited rows of the "objects other than ordinary certificates" table
 * at lines 539-549, each row naming the object that operation produces. Every step cited a line
 * inside the entry's span. Every step carried a subject, a predicate, an object and a contract.
 * Both directions of the bijection held. The sequence was fiction.
 *
 * No shape check can see that, because the defect is not in the shape: it is in WHERE the cited
 * line sits. A procedure step is stated by a sentence an implementer executes. A table row is a
 * cell of an inventory; it states what a thing IS, never what anyone DOES, so a step citing one
 * has taken its operation from the entry's index rather than from its text. The same holds for a
 * step citing a line inside a section the census adjudicates as an object inventory or a type
 * table, which is the same claim for the tables this file cannot see as Markdown.
 *
 * Measured against the twenty-five fabricated steps of A-525 and the 222 steps re-read from the
 * specification for the same entries, the rule fires 21 times on the former and zero on the
 * latter. A rule that failed correct work would be a defect in the rule; this one does not.
 */
const TABLEISH_SECTIONS = new Set(['object_inventory', 'type_table']);
const isTableRow = (line) => /^\s*\|/.test(line);

function checkS27(manifest, lines) {
  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{3,5}) /);
    if (m) headings.push({ line: i + 1, level: m[1].length });
  });
  const category = new Map(readJsonl(SECTION_ADJUDICATIONS).map((r) => [r.section, r.category]));
  const sectionOf = new Array(lines.length + 2).fill(null);
  headings.forEach((h, k) => {
    let end = lines.length;
    for (let j = k + 1; j < headings.length; j += 1) {
      if (headings[j].level <= h.level) { end = headings[j].line - 1; break; }
    }
    const c = category.get(h.line) ?? null;
    for (let i = h.line; i <= end; i += 1) sectionOf[i] = c;
  });

  let examined = 0;
  let quoted = 0;
  for (const s of readJsonl(SEQUENCE_STEPS)) {
    const m = manifest.find((x) => x.id === s.seq);
    if (!m || !/^(S|R|M|P|I|A)-/.test(m.id)) continue;
    examined += 1;

    const span = spanPairs(m.spec_lines)[0] ?? null;
    if (span && (s.spec_line < span[0] || s.spec_line > span[1])) {
      report('S27', s.seq, `step ${s.step} cites line ${s.spec_line}, outside the entry's span ` +
        `[${span[0]},${span[1]}]: the entry does not state this step`);
      continue;
    }
    if (isTableRow(lines[s.spec_line - 1] ?? '')) {
      report('S27', s.seq, `step ${s.step} cites line ${s.spec_line}, which is a table row: ` +
        'an inventory states what a thing is, never what anyone does');
      continue;
    }
    if (TABLEISH_SECTIONS.has(sectionOf[s.spec_line])) {
      report('S27', s.seq, `step ${s.step} cites line ${s.spec_line}, inside a section the census ` +
        `adjudicates "${sectionOf[s.spec_line]}": a procedure step is stated by prose`);
      continue;
    }
    const q = String(s.quote ?? '');
    if (!q.trim()) { report('S27', s.seq, `step ${s.step} carries no quote from line ${s.spec_line}`); continue; }
    if (!lines[s.spec_line - 1].includes(q)) {
      report('S27', s.seq, `step ${s.step} quotes text that line ${s.spec_line} does not contain`);
      continue;
    }
    quoted += 1;
  }
  return { examined, quoted };
}
