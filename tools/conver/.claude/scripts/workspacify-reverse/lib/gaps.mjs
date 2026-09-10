// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
/**
 * R5 — the gaps and the contradictions.
 *
 * This stage enumerates what is not there: untested surfaces, unreferenced
 * code, tests that agree with the implementation by construction, comments that
 * have drifted, incomplete implementations, and regions never observed. It
 * finds; `classifyGaps` decides. Keeping the two apart means the decision logic
 * can be read as prose and tested on its own, and it means a detector can be
 * added without touching classification.
 *
 * **Zero gaps is the finding that needs the most scrutiny, not the least.** A
 * detector that finds nothing is either measuring nothing or measuring the wrong
 * population, and a run that reports "no gaps" without saying so is the failure
 * the design calls F1. The interpretation is therefore a field the code emits,
 * not a sentence a report author remembers to write.
 *
 * Nothing here claims a region is *absent*. A construct the instrument never
 * looked at is `unobserved`, and the two words are kept apart mechanically
 * because collapsing them is failure F12.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPORT_LIST_LIMIT } from './analysis-tech.mjs';
import { compareText } from './holdout-ledger.mjs';
import { parseSourceText, syntaxLanguageOf } from './structure.mjs';

/**
 * The gap kinds the contract names, declared once.
 *
 * P22-7 and P22-16 classify against this vocabulary rather than re-spelling it.
 * Two sessions re-declaring it would drift on spelling, and the drift would be
 * silent: each session's tests would pass against its own copy.
 */
export const GAP_KINDS = Object.freeze([
  'dead_code',
  'absent_red',
  'circular_reasoning',
  'comment_code_drift',
  'stub',
  'unobserved_surface',
]);

/** Plain English for each kind, so a report can be read without a decoder. */
export const GAP_KIND_MEANINGS = Object.freeze({
  dead_code: 'nothing in the analysed population references it',
  absent_red: 'a public surface with no test that could fail for it',
  circular_reasoning: 'a test written from the design, so it agrees with the implementation by construction',
  comment_code_drift: 'a comment and the code beneath it disagree',
  stub: 'an incomplete implementation: a stub marker, a deferred-work note, a panic, or an empty body',
  unobserved_surface: 'a construct, path or boundary never observed — which is not the same as absent',
});

/** The value a gap outside the vocabulary is recorded under, so nothing is dropped. */
export const UNCLASSIFIED_GAP_KIND = 'unclassified';

/**
 * The standing limitation of measuring gaps.
 *
 * It is a constant rather than a per-run sentence because a caveat that varies
 * with the data invites reading it as a finding rather than as the property of
 * the method.
 */
export const GAPS_CAVEAT =
  'A gap list measures the detector and its population, not the project. A small number of gaps is '
  + 'never read as quality or success: gaps are the measurement itself, and a run that found none has '
  + 'more to explain than one that found several. Nothing below claims a region is absent — a region '
  + 'this instrument did not look at is unobserved, and the two are not the same word.';

/**
 * The reading a zero-gap result carries.
 *
 * F1 is a ratification document that found nothing to disagree with, and it is
 * the failure that looks most like success. A run with no gaps has to say which
 * of the two it is.
 */
export const ZERO_GAPS_INTERPRETATION =
  'Zero gaps is a finding that requires scrutiny, not a pass. It is the signature of F1 — a '
  + 'ratification document that found nothing to disagree with — rather than a statement of quality. '
  + 'Examine the detector, the population it ran over, and the coverage denominator before reading '
  + 'this as a clean result.';

/**
 * The markers that make an implementation incomplete, with what each one means.
 *
 * Each marker names the locus it can appear in. A word marker is an authoring
 * note and only counts inside a comment; finding it in a string
 * literal would report the word, not the intent. A macro like `panic!` is code
 * and only counts outside a comment, because a commented-out `panic!` is not
 * one. Matching the wrong locus is how a detector reports finished files as
 * unfinished and unfinished files as finished.
 *
 * `empty-body` is a tree check rather than a pattern: `fn handle() {}` is an
 * incomplete implementation that names none of the usual words, and a pattern
 * over lines cannot tell it from an empty body spread over two lines.
 */
export const STUB_MARKERS = Object.freeze([
  Object.freeze({ marker: '[::STUB::]', locus: 'comment', pattern: /\[::STUB::\]/, meaning: 'an incomplete implementation that names the ticket which will resolve it' }),
  Object.freeze({ marker: 'TODO', locus: 'comment', pattern: /\bTODO\b/, meaning: 'a task the author left for later' }),
  Object.freeze({ marker: 'FIXME', locus: 'comment', pattern: /\bFIXME\b/, meaning: 'a known defect the author did not fix' }),
  Object.freeze({ marker: 'HACK', locus: 'comment', pattern: /\bHACK\b/, meaning: 'a workaround the author did not want' }),
  Object.freeze({ marker: 'XXX', locus: 'comment', pattern: /\bXXX\b/, meaning: 'a point the author flagged as questionable' }),
  Object.freeze({ marker: 'todo!()', locus: 'code', pattern: /\btodo!\s*\(/, meaning: 'a Rust macro that panics at runtime' }),
  Object.freeze({ marker: 'unimplemented!()', locus: 'code', pattern: /\bunimplemented!\s*\(/, meaning: 'a Rust macro that panics at runtime' }),
  Object.freeze({ marker: 'panic!()', locus: 'code', pattern: /\bpanic!\s*\(/, meaning: 'a Rust macro that aborts the process' }),
  Object.freeze({ marker: 'empty-body', locus: 'tree', pattern: null, meaning: 'a function whose body holds no statement at all' }),
]);

/** The node types that carry a comment, per language. */
const COMMENT_NODE_TYPES = new Set(['line_comment', 'block_comment', 'comment', 'doc_comment']);

/** The node types that declare a function, whose body may be empty. */
const FUNCTION_NODE_TYPES = new Set([
  'function_item', 'function_definition', 'function_declaration', 'method_definition', 'constructor_declaration',
]);

/** The node types that carry a function body. */
const BODY_NODE_TYPES = new Set(['block', 'statement_block', 'compound_statement', 'declaration_list', 'class_body']);

/**
 * How a test file is recognised as a test file.
 *
 * The population matters more than the pattern: R5's most important finding is
 * a public surface with no test that could fail for it, and that number is only
 * meaningful if the set of test files is not a guess.
 */
export const TEST_PATH_PATTERNS = Object.freeze([
  /(^|\/)tests?\//,
  /(^|\/)test_[^/]*\.(rs|py|go)$/,
  /_test\.(rs|go|py)$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
]);

/**
 * A name in a comment that is shaped like code rather than like English.
 *
 * Backticked names, `snake_case` and `CamelCase` are the three ways a comment
 * refers to a symbol; prose words are not, which is what keeps the detector from
 * reporting every noun in every doc comment as drift.
 */
const CODE_SHAPED_NAME = /`([A-Za-z_][A-Za-z0-9_:]*)`|\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b|\b([A-Z][A-Za-z0-9]*[A-Z][a-z0-9]+)\b/g;

/** A line that is a comment in one of the six target languages. */
const COMMENT_LINE = /^\s*(\/\/|\/\/!|\/\*|\*|#|"""|''')/;

/** A test file named after the ticket or the contract that generated it. */
const TICKET_KEYED_TEST_NAME = /(?:^|\/)(?:verify_spec|verify_contract)[_-]/;

/**
 * The byte that marks a file as binary. Named rather than written literally so
 * that a NUL character cannot make this source file binary to grep and to `file`.
 */
const NUL_BYTE = String.fromCharCode(0);

const NO_TESTS_IN_POPULATION =
  'no test file was found in the analysed population, so every public surface above is untested by '
  + 'construction rather than by defect; the denominator here is zero and a ratio against it would '
  + 'say nothing';

/** A gap record, with the fields every consumer reads. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function gapOf(kind, file, line, provenance, extra = {}) {
  return {
    gap_id: `gap-${file}-${kind}-${line}`,
    kind,
    file,
    line,
    provenance,
    evidence: [],
    ...extra,
  };
}

/** Read a file, reporting the failure rather than raising it. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function readOrNull(root, relativePath, readFile) {
  try {
    return readFile(join(root, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Parse a file through the declared instrument, or report that it could not be.
 *
 * The gaps below are claims about where an incomplete implementation, a stale
 * comment or an untested symbol lives, and a claim about location needs the
 * syntax tree: a line scan cannot tell an authoring marker inside a comment from
 * the same word inside a string literal, nor an empty body from one spread over
 * two lines. When the instrument cannot read a file the textual reading is still
 * offered, and each gap says which reading produced it so a consumer can weigh it.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function parseOrNull(root, relativePath, readFile) {
  const language = syntaxLanguageOf(relativePath);
  if (language === 'unknown') return null;
  const text = readOrNull(root, relativePath, readFile);
  if (text === null) return null;
  const parsed = parseSourceText(text, language);
  if (!parsed.ok) return null;
  return { tree: parsed.tree, text, language };
}

/** Visit every node of a tree, parents before children, comments included. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function walkAll(node, visit) {
  visit(node);
  for (const child of node.children) walkAll(child, visit);
}

/**
 * Every comment node in a tree, in source order, outermost only.
 *
 * The walk stops at a comment rather than descending into it. Rust nests a
 * `doc_comment` inside the `line_comment` that carries its `///`, and a walk
 * that visited both would report one comment's drift twice, under one gap id.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function commentNodesOf(tree) {
  const comments = [];
  const visit = (node) => {
    if (COMMENT_NODE_TYPES.has(node.type)) {
      comments.push(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(tree.rootNode);
  return comments;
}

/**
 * The source with every comment's characters replaced by spaces.
 *
 * Newlines are kept so a line number found in this view is the line number in
 * the file, and characters are replaced rather than removed so an offset in this
 * view is the offset in the file.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function codeViewOf(text, comments) {
  const characters = text.split('');
  for (const node of comments) {
    for (let index = node.startIndex; index < node.endIndex; index += 1) {
      if (characters[index] !== '\n') characters[index] = ' ';
    }
  }
  return characters.join('');
}

/** The identifier-shaped names a piece of text contains. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function identifiersIn(text) {
  const names = new Set();
  for (const match of text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) names.add(match[0]);
  return names;
}

/** The line a character offset falls on, one-based. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function lineAtOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1;
  }
  return line;
}

/**
 * The functions whose body holds no statement.
 *
 * This is a tree check because the line-based version is wrong in both
 * directions: it reports `let s = "fn quoted() {}";` and `// fn documented() {}`
 * as empty implementations, and it misses a body spread over two lines — which
 * is the shape a real empty body takes once an attribute or a comment sits
 * inside it.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function emptyFunctionsOf(tree) {
  const empty = [];
  walkAll(tree.rootNode, (node) => {
    if (!FUNCTION_NODE_TYPES.has(node.type)) return;
    const body = node.namedChildren.find((child) => BODY_NODE_TYPES.has(child.type));
    if (body === undefined) return;
    const statements = body.namedChildren.filter((child) => !COMMENT_NODE_TYPES.has(child.type));
    if (statements.length > 0) return;
    empty.push({
      line: node.startPosition.row + 1,
      name: node.childForFieldName('name')?.text ?? null,
    });
  });
  return empty;
}

/** Whether a path is one a test could live in. */
export function isTestPath(relativePath) {
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

/**
 * Every incomplete implementation in the population, one gap per marker per line.
 *
 * A line carrying two markers yields two gaps rather than one: they are two
 * different things to resolve, and collapsing them would let one be resolved
 * while the other disappeared from the list.
 */
export function findStubs(root, paths, { readFile = readFileSync } = {}) {
  const gaps = [];
  for (const relativePath of [...paths].sort(compareText)) {
    const raw = readOrNull(root, relativePath, readFile);
    if (raw === null) continue;
    // A marker inside a binary file is not a marker, and reporting one would
    // name a line nobody can open.
    if (raw.includes(NUL_BYTE)) continue;

    const parsed = parseOrNull(root, relativePath, readFile);
    if (parsed === null) {
      gaps.push(...stubsInText(raw, relativePath));
      continue;
    }
    gaps.push(...stubsInTree(parsed, relativePath));
  }
  return gaps;
}

/**
 * The incomplete implementations a syntax tree shows.
 *
 * A word marker is looked for only inside comments and a macro only outside
 * them, because the locus is what decides whether the marker is an authoring
 * note or a real instruction. The tree also yields the empty bodies a line scan
 * cannot identify, including ones whose braces are on separate lines.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function stubsInTree(parsed, relativePath) {
  const gaps = [];
  const comments = commentNodesOf(parsed.tree);
  const code = codeViewOf(parsed.text, comments);

  for (const node of comments) {
    for (const marker of STUB_MARKERS) {
      if (marker.locus !== 'comment' || !marker.pattern.test(node.text)) continue;
      gaps.push(gapOf('stub', relativePath, node.startPosition.row + 1, 'observed', {
        marker: marker.marker,
        meaning: marker.meaning,
        reading: 'syntax_tree',
        evidence: [`the comment at ${relativePath}:${node.startPosition.row + 1} reads: ${node.text.trim()}`],
      }));
    }
  }

  code.split('\n').forEach((lineText, index) => {
    for (const marker of STUB_MARKERS) {
      if (marker.locus !== 'code' || !marker.pattern.test(lineText)) continue;
      gaps.push(gapOf('stub', relativePath, index + 1, 'observed', {
        marker: marker.marker,
        meaning: marker.meaning,
        reading: 'syntax_tree',
        evidence: [`the code at ${relativePath}:${index + 1} reads: ${lineText.trim()}`],
      }));
    }
  });

  for (const empty of emptyFunctionsOf(parsed.tree)) {
    gaps.push(gapOf('stub', relativePath, empty.line, 'observed', {
      marker: 'empty-body',
      meaning: STUB_MARKERS.find((marker) => marker.marker === 'empty-body').meaning,
      reading: 'syntax_tree',
      function_name: empty.name,
      evidence: [`the function at ${relativePath}:${empty.line} has a body with no statement in it`],
    }));
  }
  return gaps;
}

/**
 * The incomplete implementations a plain text reading shows.
 *
 * This runs only for a file the instrument cannot parse — a manifest, a script
 * in an undeclared language, a file the grammar rejected. Every gap it produces
 * is recorded as `inferred` and says its reading was `textual`, because a word
 * in this reading may be prose in a string or a comment rather than a marker.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function stubsInText(text, relativePath) {
  const gaps = [];
  text.split('\n').forEach((lineText, index) => {
    for (const marker of STUB_MARKERS) {
      if (marker.pattern === null || !marker.pattern.test(lineText)) continue;
      gaps.push(gapOf('stub', relativePath, index + 1, 'inferred', {
        marker: marker.marker,
        meaning: marker.meaning,
        reading: 'textual',
        evidence: [`the line reads: ${lineText.trim()}`],
      }));
    }
  });
  return gaps;
}

/**
 * The packages nothing in the population references.
 *
 * The reading is `inferred` rather than `observed`: the syntax layer resolves no
 * names, so "no import edge leads here" is evidence about the import graph, not
 * proof that nothing reaches the code at runtime. A test or a macro could reach
 * it in a way this instrument cannot see, and the provenance says so.
 */
export function findDeadCode(dependencies, paths) {
  const packages = dependencies?.packages ?? [];
  const edges = dependencies?.edges ?? [];
  const referenced = new Set();
  for (const edge of edges) {
    // An edge with no location is a declaration the instrument observed nowhere,
    // which is not a reference: counting it would report dead code as live.
    if ((edge.locations ?? []).length === 0) continue;
    referenced.add(edge.to);
  }

  // A package is in the population when it is one of the paths, or when any of
  // the paths lives inside it: the boundary names files, the dependency graph
  // names directories, and comparing the two by equality would put every package
  // outside the population and report no dead code at all — a silent zero.
  const inPopulation = (packageName) => paths.length === 0
    || paths.some((relativePath) => relativePath === packageName || relativePath.startsWith(`${packageName}/`));

  return packages
    .filter(inPopulation)
    .filter((packageName) => !referenced.has(packageName))
    .sort(compareText)
    .map((packageName) => gapOf('dead_code', packageName, 1, 'inferred', {
      evidence: [
        `no inbound import edge with an observed location points at ${packageName}`,
        'the syntax layer resolves no names, so a runtime or macro reference would not appear here',
      ],
    }));
}

/**
 * The public surface no test could fail for.
 *
 * A symbol counts as covered when a test file names it. That is a weaker test
 * than running the suite, and deliberately so: this is a syntax reading, and the
 * claim it supports is "no test appears to exercise this", never "this is
 * untested".
 */
export function findAbsentRed(structure, paths, { root = '', readFile = readFileSync } = {}) {
  const testPaths = [...paths].filter(isTestPath).sort(compareText);
  // The names are collected whole rather than searched for as substrings: a
  // substring test reports `id` as covered because a test says `valid`, and
  // `get` because one says `forget`. Short public names — `id`, `new`, `get`,
  // `run` — would then be permanently invisible, which is the opposite of what
  // this stage exists to find.
  const namedInTests = new Set();
  for (const relativePath of testPaths) {
    const text = readOrNull(root, relativePath, readFile);
    if (text === null) continue;
    for (const name of identifiersIn(text)) namedInTests.add(name);
  }

  const gaps = [];
  for (const item of structure?.publicItems ?? []) {
    if (namedInTests.has(item.symbol)) continue;
    gaps.push(gapOf('absent_red', item.file, item.line, 'inferred', {
      symbol: item.symbol,
      visibility: item.visibility,
      test_population: testPaths.length,
      evidence: testPaths.length === 0
        ? [NO_TESTS_IN_POPULATION]
        : [`no test file in the population names \`${item.symbol}\``],
      ...(testPaths.length === 0 ? { undecided: NO_TESTS_IN_POPULATION } : {}),
    }));
  }
  return gaps;
}

/**
 * Tests that were written from the design rather than from the behaviour.
 *
 * A test named after the ticket that generated it, or carrying an `@verifies`
 * annotation pointing at a contract id, was derived from the same design the
 * implementation came from. It agrees with the implementation by construction,
 * so it cannot detect a divergence between the two — which is precisely the
 * co-conspirator oracle R5.5 exists to expose, caught here at its source.
 */
export function findCircularReasoning(root, paths, { readFile = readFileSync } = {}) {
  const gaps = [];
  for (const relativePath of paths.filter(isTestPath).sort(compareText)) {
    const text = readOrNull(root, relativePath, readFile);
    if (text === null) continue;

    const signals = [];
    if (TICKET_KEYED_TEST_NAME.test(relativePath)) {
      signals.push('the file is named after the ticket or contract that generated it');
    }
    const annotated = text.split('\n')
      .map((lineText, index) => ({ lineText, index }))
      .filter(({ lineText }) => /@verifies\b/.test(lineText));
    if (annotated.length > 0) {
      signals.push(`it carries ${annotated.length} @verifies annotation(s) pointing at a contract id`);
    }
    if (signals.length === 0) continue;

    gaps.push(gapOf('circular_reasoning', relativePath, (annotated[0]?.index ?? 0) + 1, 'inferred', {
      signals,
      evidence: [
        ...signals,
        'a test derived from the design agrees with the implementation by construction, so it cannot '
        + 'detect a divergence between the two',
      ],
    }));
  }
  return gaps;
}

/**
 * Comments that refer to a symbol the code no longer has.
 *
 * Only code-shaped names are checked, and only comment text is searched: a word
 * like "caller" in an English sentence is not a reference to a symbol, and a
 * name that survives only inside a trailing inline comment is not code. Reading
 * the comment nodes and the code names from the syntax tree keeps both
 * boundaries exact, which a line scan cannot do — it would call a whole line of
 * code a comment because it starts with `#`, and would find the symbol it is
 * looking for inside the comment that says the symbol is gone.
 *
 * A file the instrument cannot read yields no drift claim. Silence here is a
 * gap in the evidence, not a finding that the file agrees with itself.
 */
export function findCommentCodeDrift(root, paths, { readFile = readFileSync } = {}) {
  const gaps = [];
  for (const relativePath of [...paths].sort(compareText)) {
    const parsed = parseOrNull(root, relativePath, readFile);
    if (parsed === null) continue;

    const comments = commentNodesOf(parsed.tree);
    if (comments.length === 0) continue;
    const codeNames = identifiersIn(codeViewOf(parsed.text, comments));

    for (const node of comments) {
      const named = new Map();
      for (const match of node.text.matchAll(CODE_SHAPED_NAME)) {
        const name = match[1] ?? match[2] ?? match[3];
        if (name === undefined || codeNames.has(name) || named.has(name)) continue;
        named.set(name, lineAtOffset(parsed.text, node.startIndex + match.index));
      }
      if (named.size === 0) continue;

      const names = [...named.keys()].sort(compareText);
      gaps.push(gapOf('comment_code_drift', relativePath, [...named.values()][0], 'inferred', {
        names,
        reading: 'syntax_tree',
        evidence: [
          `the comment names ${names.map((name) => `\`${name}\``).join(', ')}, which appear nowhere in `
          + 'the code of this file',
        ],
      }));
    }
  }
  return gaps;
}

/**
 * The regions, boundaries and channels this analysis never observed.
 *
 * Each of these is recorded as `unresolved`, and none of them is called absent.
 * The whole point of the detector is F12: a flag, a tenant, a failure path or a
 * language nobody looked at is not missing from the project, it is missing from
 * the evidence — and a consumer who conflated the two would delete working code.
 */
export function findUnobservedSurface(surface, boundary, ledger) {
  const gaps = [];

  for (const artefact of boundary?.artefacts ?? []) {
    if (artefact.coverage !== 'out_of_scope') continue;
    gaps.push(gapOf('unobserved_surface', artefact.path, 1, 'unresolved', {
      region: artefact.path,
      evidence: [
        `${artefact.path} is out of scope for this analysis, so it was not examined`,
        'not examined is not the same as not there: nothing here says the region is empty',
      ],
    }));
  }

  for (const limitation of surface?.limitations ?? []) {
    gaps.push(gapOf('unobserved_surface', limitation.scope ?? '**', 1, 'unresolved', {
      region: limitation.scope ?? '**',
      code: limitation.code,
      evidence: [limitation.effect ?? 'the instrument reported a limitation with no stated effect'],
    }));
  }

  for (const channel of ledger?.unavailable_channels ?? []) {
    if (channel.used === true) continue;
    gaps.push(gapOf('unobserved_surface', channel.channel, 1, 'unresolved', {
      region: channel.channel,
      evidence: [
        `the ${channel.channel} channel was never consulted: ${channel.reason}`,
        'a proposition resting on this channel is not observed, and its absence is a property of the '
        + 'instrument rather than of the project',
      ],
    }));
  }

  return gaps;
}

/**
 * Every gap the completed analysis supports, with no classification applied.
 *
 * A run whose structure, dependencies, surface or boundary is missing has not
 * completed, and enumerating gaps from a partial analysis would report the
 * unmeasured as unobserved and the unobserved as missing. The refusal is
 * deliberate rather than a convenience.
 */
export function enumerateGaps(source) {
  const {
    root,
    paths = [],
    boundary = null,
    structure = null,
    dependencies = null,
    surface = null,
    ledger = null,
    readFile = readFileSync,
  } = source ?? {};

  const parts = { boundary, structure, dependencies, surface };
  const missing = Object.keys(parts).filter((name) => parts[name] === null);
  if (missing.length > 0) {
    throw new Error(
      'the analysis must have completed before gaps can be enumerated: this run has no '
      + `${missing.join(', ')}, so it has measured nothing for a gap to be missing from`,
    );
  }

  return [
    ...findStubs(root, paths, { readFile }),
    ...findDeadCode(dependencies, paths),
    ...findAbsentRed(structure, paths, { root, readFile }),
    ...findCircularReasoning(root, paths, { readFile }),
    ...findCommentCodeDrift(root, paths, { readFile }),
    ...findUnobservedSurface(surface, boundary, ledger),
  ].sort((left, right) => compareText(
    `${left.file}:${String(left.line).padStart(6, '0')}:${left.kind}`,
    `${right.file}:${String(right.line).padStart(6, '0')}:${right.kind}`,
  ));
}

/**
 * Decide what each discovered gap is, and say what could not be decided.
 *
 * A gap whose kind is outside the declared vocabulary is recorded as
 * `unclassified` with the kind it claimed, rather than dropped. Dropping it
 * would make an unknown category invisible in the one list whose job is to make
 * the unknown visible.
 */
export function classifyGaps(gaps) {
  const classified = gaps.map((gap) => {
    if (GAP_KINDS.includes(gap.kind)) return { ...gap };
    return {
      ...gap,
      kind: UNCLASSIFIED_GAP_KIND,
      declared_kind: gap.kind,
      unclassified_reason:
        `the kind "${gap.kind}" is not one of the six the contract names (${GAP_KINDS.join(', ')}), `
        + 'so it is kept here under `unclassified` rather than dropped',
    };
  });

  const by_kind = {};
  for (const gap of classified) by_kind[gap.kind] = (by_kind[gap.kind] ?? 0) + 1;

  const known = classified.filter((gap) => gap.kind !== UNCLASSIFIED_GAP_KIND);
  return {
    gap_count: classified.length,
    gaps: classified,
    by_kind,
    known_count: known.length,
    unclassifiedCount: classified.length - known.length,
    // Present whether or not the list is empty, so a consumer cannot read an
    // empty list as a pass by finding no field to disagree with.
    requires_scrutiny: true,
    interpretation: ZERO_GAPS_INTERPRETATION,
    caveat: GAPS_CAVEAT,
    kind_meanings: GAP_KIND_MEANINGS,
  };
}

/**
 * The gap output a stage comparison consumes.
 *
 * The `unobserved` entry is not decoration. The answer key exposes omission file
 * *names*; the omissions recorded inside those files are not what this
 * comparison reads, so a result that stayed silent about the distinction would
 * be read as a measurement of gap recall when it is a measurement of file
 * naming.
 */
export function buildGapCandidate(classified, { language = 'unknown' } = {}) {
  return {
    stage: 'r5',
    corpus: { language },
    entries: classified.gaps.map((gap) => ({ name: gap.gap_id, value: null })),
    unobserved: [
      {
        region: "the oracle's omission file contents",
        stoppedAtPhase: 'R5',
        reason:
          'the frozen answer key exposes the eight omission file names and not the omissions recorded '
          + 'inside them, so a name that does not match an omission file name measures naming rather '
          + 'than whether the gap was found',
      },
    ],
  };
}

/**
 * The gaps as the Markdown a human or an AI reads before deciding anything.
 *
 * The list is capped and the report says how many it did not print, because a
 * report that printed every gap would be thousands of bullets nobody reads, and
 * a silent cap would read as the whole of the evidence. The JSON beside it
 * carries every entry.
 */
export function renderGapsReport(classified, limit = REPORT_LIST_LIMIT) {
  const lines = [
    '## Gaps and contradictions',
    '',
    `> ${GAPS_CAVEAT}`,
    '',
    `**${classified.gap_count} gap(s)** across ${Object.keys(classified.by_kind).length} kind(s).`,
    '',
    '| Kind | Count | Meaning |',
    '|---|---|---|',
  ];

  for (const kind of Object.keys(classified.by_kind).sort(compareText)) {
    lines.push(`| \`${kind}\` | ${classified.by_kind[kind]} | ${GAP_KIND_MEANINGS[kind] ?? 'not one of the declared kinds'} |`);
  }
  lines.push('');

  if (classified.gap_count === 0) {
    lines.push(`**Zero gaps.** ${ZERO_GAPS_INTERPRETATION}`, '');
  } else {
    const shown = classified.gaps.slice(0, limit);
    lines.push('| Gap | File | Line | Kind |', '|---|---|---|---|');
    for (const gap of shown) {
      lines.push(`| \`${gap.gap_id}\` | \`${gap.file}\` | ${gap.line} | \`${gap.kind}\` |`);
    }
    lines.push('');
    if (classified.gap_count > shown.length) {
      lines.push(
        `**${classified.gap_count - shown.length} gap(s) were not printed.** `
        + 'The list above is capped so that it can be read; the JSON beside this report carries every entry.',
        '',
      );
    }
  }

  if (classified.unclassifiedCount > 0) {
    lines.push(
      `**${classified.unclassifiedCount} gap(s) could not be classified** into the declared kinds. `
      + 'They are listed above as `unclassified` rather than dropped.',
      '',
    );
  }
  return lines.join('\n');
}
