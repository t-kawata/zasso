// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * R3 — the semantic material, extracted in two separated stages.
 *
 * Stage one is deterministic and states only what is in the text: a conditional,
 * a dominating branch, an early return, a `throw`, a `panic`, an `assert`, an
 * `unwrap`/`expect`, a returned error variant, a read or a write of an argument,
 * a field, a global or an I/O handle, a loop condition, a state field or its
 * assignment, and the boundary values and expected exceptions a test declares.
 *
 * Stage two is the stage that may mean something, and its output is candidates —
 * never facts. The separation is the point of the whole module. A guard, an
 * `assert` and an error path are conditions that *exist in the implementation*;
 * none of them establishes whether it is a precondition, a postcondition or an
 * invariant, because defensive checks, performance shortcuts and temporary
 * workarounds wear the same shape. So stage two hands a human a
 * source-falsifiable proposition and the question it could not settle, and the
 * extractor never promotes one.
 *
 * The syntax layer is tree-sitter and it is syntactic (docs/P22-ANALYSIS-TECH.md
 * §7). A name that resolved, a type that checked or a trait implementation that
 * was found is a layer-C claim, and layer C is not built here — so every fact
 * carries `source_static`, and the channels that would be needed to observe
 * anything else are recorded per run as channels this run did not use.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EVIDENCE_MODES,
  assertAdapterResult,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { compareText } from './holdout-ledger.mjs';
import { parseSourceFile, syntaxLanguageOf } from './structure.mjs';
import { CANDIDATE_APPROVAL_KEY, CANDIDATE_CLASSIFICATION, EXTRACTOR_CLASSES } from './provenance.mjs';

/**
 * The eight families R3 must enumerate, named in the order the design names
 * them. A family that stayed empty while its siblings filled would be an
 * untested claim rather than a finding, so they are enumerated rather than
 * discovered.
 */
export const SEMANTIC_FAMILIES = Object.freeze([
  'public_surface',
  'types',
  'error_types',
  'guards',
  'invariants',
  'state_machines',
  'side_effects',
  'tests',
]);

/**
 * The closed vocabulary of fact kinds — what stage one may say.
 *
 * A kind outside this list would be a meaning smuggled into stage one, so the
 * list is closed and a fact carrying anything else is a defect. The list is the
 * design's own enumeration from ABOUT-REVERSE 6.2's R3 row, item by item.
 */
export const FACT_KINDS = Object.freeze([
  // declarations
  'public_item',
  'type_declaration',
  'error_type',
  // control flow
  'conditional',
  'dominating_branch',
  'early_return',
  'loop_condition',
  // failure surfaces
  'throw',
  'panic',
  'assert',
  'unwrap_expect',
  'error_return',
  'error_variant',
  // data movement
  'argument_read',
  'field_read',
  'field_write',
  'global_read',
  'global_write',
  'io_read',
  'io_write',
  // state
  'state_field',
  'state_assignment',
  // tests
  'test_boundary_value',
  'test_expected_exception',
]);

/** The family each fact kind belongs to. Declared, so the grouping is testable. */
export const FAMILY_OF_KIND = Object.freeze({
  public_item: 'public_surface',
  type_declaration: 'types',
  error_type: 'error_types',
  error_return: 'error_types',
  error_variant: 'error_types',
  conditional: 'guards',
  dominating_branch: 'guards',
  early_return: 'guards',
  loop_condition: 'guards',
  argument_read: 'guards',
  assert: 'invariants',
  unwrap_expect: 'invariants',
  throw: 'side_effects',
  panic: 'side_effects',
  io_read: 'side_effects',
  io_write: 'side_effects',
  field_read: 'side_effects',
  field_write: 'side_effects',
  global_read: 'side_effects',
  global_write: 'side_effects',
  state_field: 'state_machines',
  state_assignment: 'state_machines',
  test_boundary_value: 'tests',
  test_expected_exception: 'tests',
});

// ---------------------------------------------------------------------------
// The per-language node vocabulary
// ---------------------------------------------------------------------------

/**
 * The node types each fact kind is read from, per language.
 *
 * Six languages, not one. The design is explicit that an instrument tuned to
 * the first target is an implementation tuned to that target, and it forbids it
 * — two sessions choosing differently would produce mutually unreadable output
 * and no test would catch it, because each session's tests would pass against
 * its own choice. The tables below are the declaration; which of them a given
 * run actually exercised is a fact about the run, recorded in `limitations`.
 */
export const FACT_VOCABULARY = Object.freeze({
  rust: Object.freeze({
    public_item: ['function_item', 'struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item', 'const_item', 'static_item', 'mod_item'],
    type_declaration: ['struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item'],
    error_type: ['enum_item', 'struct_item'],
    conditional: ['if_expression', 'match_expression'],
    dominating_branch: ['match_arm'],
    early_return: ['return_expression'],
    loop_condition: ['while_expression', 'loop_expression', 'for_expression'],
    throw: [],
    panic: ['macro_invocation'],
    assert: ['macro_invocation'],
    unwrap_expect: ['call_expression'],
    error_return: ['call_expression'],
    error_variant: ['scoped_identifier'],
    argument_read: ['identifier'],
    field_read: ['field_expression'],
    field_write: ['assignment_expression'],
    global_read: ['scoped_identifier'],
    global_write: ['assignment_expression'],
    io_read: ['call_expression'],
    io_write: ['macro_invocation', 'call_expression'],
    state_field: ['field_declaration'],
    state_assignment: ['assignment_expression'],
    test_boundary_value: ['string_literal', 'integer_literal', 'boolean_literal', 'float_literal'],
    test_expected_exception: ['macro_invocation'],
  }),
  typescript: Object.freeze({
    public_item: ['export_statement', 'function_declaration', 'class_declaration', 'interface_declaration', 'lexical_declaration'],
    type_declaration: ['interface_declaration', 'type_alias_declaration', 'enum_declaration', 'class_declaration'],
    error_type: ['class_declaration', 'interface_declaration'],
    conditional: ['if_statement', 'switch_statement', 'ternary_expression'],
    dominating_branch: ['switch_case'],
    early_return: ['return_statement'],
    loop_condition: ['while_statement', 'for_statement', 'for_in_statement', 'do_statement'],
    throw: ['throw_statement'],
    panic: [],
    assert: ['call_expression'],
    unwrap_expect: ['call_expression'],
    error_return: ['throw_statement', 'return_statement'],
    error_variant: ['member_expression'],
    argument_read: ['identifier'],
    field_read: ['member_expression'],
    field_write: ['assignment_expression'],
    global_read: ['identifier'],
    global_write: ['assignment_expression'],
    io_read: ['call_expression'],
    io_write: ['call_expression'],
    state_field: ['public_field_definition', 'property_signature'],
    state_assignment: ['assignment_expression'],
    test_boundary_value: ['string', 'number', 'true', 'false'],
    test_expected_exception: ['call_expression'],
  }),
  javascript: Object.freeze({
    public_item: ['export_statement', 'function_declaration', 'class_declaration', 'lexical_declaration'],
    type_declaration: ['class_declaration'],
    error_type: ['class_declaration'],
    conditional: ['if_statement', 'switch_statement', 'ternary_expression'],
    dominating_branch: ['switch_case'],
    early_return: ['return_statement'],
    loop_condition: ['while_statement', 'for_statement', 'for_in_statement', 'do_statement'],
    throw: ['throw_statement'],
    panic: [],
    assert: ['call_expression'],
    unwrap_expect: ['call_expression'],
    error_return: ['throw_statement', 'return_statement'],
    error_variant: ['member_expression'],
    argument_read: ['identifier'],
    field_read: ['member_expression'],
    field_write: ['assignment_expression'],
    global_read: ['identifier'],
    global_write: ['assignment_expression'],
    io_read: ['call_expression'],
    io_write: ['call_expression'],
    state_field: ['field_definition'],
    state_assignment: ['assignment_expression'],
    test_boundary_value: ['string', 'number', 'true', 'false'],
    test_expected_exception: ['call_expression'],
  }),
  go: Object.freeze({
    public_item: ['function_declaration', 'type_declaration', 'method_declaration', 'const_declaration'],
    type_declaration: ['type_declaration'],
    error_type: ['type_declaration'],
    conditional: ['if_statement', 'expression_switch_statement', 'type_switch_statement'],
    dominating_branch: ['expression_case', 'type_case'],
    early_return: ['return_statement'],
    loop_condition: ['for_statement'],
    throw: [],
    panic: ['call_expression'],
    assert: ['call_expression'],
    unwrap_expect: ['call_expression'],
    error_return: ['return_statement'],
    error_variant: ['selector_expression'],
    argument_read: ['identifier'],
    field_read: ['selector_expression'],
    field_write: ['assignment_statement'],
    global_read: ['identifier'],
    global_write: ['assignment_statement'],
    io_read: ['call_expression'],
    io_write: ['call_expression'],
    state_field: ['field_declaration'],
    state_assignment: ['assignment_statement'],
    test_boundary_value: ['interpreted_string_literal', 'int_literal', 'true', 'false'],
    test_expected_exception: ['call_expression'],
  }),
  python: Object.freeze({
    public_item: ['function_definition', 'class_definition'],
    type_declaration: ['class_definition'],
    error_type: ['class_definition'],
    conditional: ['if_statement', 'match_statement', 'conditional_expression'],
    dominating_branch: ['case_clause'],
    early_return: ['return_statement'],
    loop_condition: ['while_statement', 'for_statement'],
    throw: ['raise_statement'],
    panic: [],
    assert: ['assert_statement'],
    unwrap_expect: ['call'],
    error_return: ['raise_statement'],
    error_variant: ['attribute'],
    argument_read: ['identifier'],
    field_read: ['attribute'],
    field_write: ['assignment'],
    global_read: ['identifier'],
    global_write: ['assignment'],
    io_read: ['call'],
    io_write: ['call'],
    state_field: ['assignment'],
    state_assignment: ['assignment'],
    test_boundary_value: ['string', 'integer', 'true', 'false'],
    test_expected_exception: ['call'],
  }),
  c_cpp: Object.freeze({
    public_item: ['function_definition', 'declaration', 'struct_specifier', 'enum_specifier', 'class_specifier'],
    type_declaration: ['struct_specifier', 'enum_specifier', 'union_specifier', 'class_specifier'],
    error_type: ['struct_specifier', 'class_specifier'],
    conditional: ['if_statement', 'switch_statement', 'conditional_expression'],
    dominating_branch: ['case_statement'],
    early_return: ['return_statement'],
    loop_condition: ['while_statement', 'for_statement', 'do_statement'],
    throw: ['throw_statement'],
    panic: [],
    assert: ['call_expression'],
    unwrap_expect: [],
    error_return: ['return_statement'],
    error_variant: ['field_expression'],
    argument_read: ['identifier'],
    field_read: ['field_expression'],
    field_write: ['assignment_expression'],
    global_read: ['identifier'],
    global_write: ['assignment_expression'],
    io_read: ['call_expression'],
    io_write: ['call_expression'],
    state_field: ['field_declaration'],
    state_assignment: ['assignment_expression'],
    test_boundary_value: ['string_literal', 'number_literal', 'true', 'false'],
    test_expected_exception: ['call_expression'],
  }),
});

/**
 * The name a node must carry to count, for the kinds read out of shared node
 * types. An absent entry means every node of the listed types counts.
 */
const NAME_FILTERS = Object.freeze({
  rust: Object.freeze({
    panic: /^(?:panic|unreachable|todo|unimplemented)$/,
    assert: /^(?:debug_)?assert(?:_eq|_ne)?$/,
    unwrap_expect: /^(?:unwrap|expect)$/,
    error_return: /^Err$/,
    io_read: /^(?:read_to_string|read_to_end|read_line|read|recv|recv_from|recv_timeout)$/,
    io_write: /^(?:print|println|eprint|eprintln|write|writeln|send|send_to|flush)$/,
    test_expected_exception: /^(?:assert|assert_eq|assert_ne|expect|unwrap)$/,
  }),
  typescript: Object.freeze({
    assert: /^(?:assert|expect|should|chai)$/,
    unwrap_expect: /^(?:unwrap|expect)$/,
    error_return: /^(?:Error|TypeError|RangeError)$/,
    io_read: /^(?:readFile|readFileSync|fetch|request|get)$/,
    io_write: /^(?:writeFile|writeFileSync|console)$/,
    state_field: /state|status|phase|mode/i,
    state_assignment: /state|status|phase|mode/i,
  }),
  javascript: Object.freeze({
    assert: /^(?:assert|expect|should|chai)$/,
    unwrap_expect: /^(?:unwrap|expect)$/,
    error_return: /^(?:Error|TypeError|RangeError)$/,
    io_read: /^(?:readFile|readFileSync|fetch|request|get)$/,
    io_write: /^(?:writeFile|writeFileSync|console)$/,
    state_field: /state|status|phase|mode/i,
    state_assignment: /state|status|phase|mode/i,
  }),
  go: Object.freeze({
    panic: /^panic$/,
    assert: /^(?:Fatal|Fatalf|Error|Errorf|Assert)$/,
    unwrap_expect: /^(?:Must|Expect)$/,
    error_return: /^(?:Errorf|New)$/,
    io_read: /^(?:ReadFile|Read|ReadAll|Get|Do)$/,
    io_write: /^(?:WriteFile|Write|Println|Printf|Fprint)$/,
    state_field: /state|status|phase|mode/i,
    state_assignment: /state|status|phase|mode/i,
  }),
  python: Object.freeze({
    assert: /^assert_/,
    unwrap_expect: /^(?:unwrap|expect)$/,
    error_return: /^(?:Error|Exception|ValueError|RuntimeError)$/,
    io_read: /^(?:open|read|readlines|get|urlopen)$/,
    io_write: /^(?:open|write|writelines|print)$/,
    state_field: /state|status|phase|mode/i,
    state_assignment: /state|status|phase|mode/i,
  }),
  c_cpp: Object.freeze({
    assert: /^assert$/,
    error_return: /^(?:errno|perror)$/,
    io_read: /^(?:fread|read|fgets|recv|recvfrom)$/,
    io_write: /^(?:fwrite|write|printf|fprintf|puts|send|sendto)$/,
    state_field: /state|status|phase|mode/i,
    state_assignment: /state|status|phase|mode/i,
  }),
});

/** The word a state field's name must contain, for every language. */
const STATE_NAME = /state|status|phase|mode/i;

/** The node type a Rust declaration's field is written with. */
const RUST_FIELD_DECLARATION = 'field_declaration';

/** The attribute that marks a Rust function as a test. */
const RUST_TEST_ATTRIBUTE = /#\[\s*test\s*\]/;

/** The tests a language declares in a path outside the source tree. */
const TEST_PATH = /(?:^|\/)tests?\//;

/** The suffix every assertion macro in a test carries when it expects failure. */
const EXPECTED_FAILURE = /is_err\(\)|is_none\(\)|should_panic|panics!|to_throw|raises\(/;

/**
 * The shape of a written value the text settles as a state.
 *
 * A path or a literal names a state; a call or an expression computes one, and
 * what it computes is not readable from the assignment site alone.
 */
const STATIC_STATE_VALUE = /^(?:[A-Za-z_][A-Za-z0-9_]*::)*[A-Za-z_][A-Za-z0-9_]*$|^-?\d+(?:\.\d+)?$|^(?:true|false)$|^"[^"]*"$/;

// ---------------------------------------------------------------------------
// The evidence locator
// ---------------------------------------------------------------------------

/**
 * Whether a fact's span names a location that exists.
 *
 * `false` means the artefact is not in this tree — the fact is simply not from
 * here. A **throw** means the extractor reported a line the file does not have,
 * which is not a fact about the tree but a defect in the extraction: the parser
 * produced a position that cannot exist, and storing it would put an
 * unverifiable citation into the ledger.
 */
export function assertSpanResolves(root, span) {
  if (span === null || typeof span !== 'object' || typeof span.file !== 'string' || span.file.length === 0) {
    throw new Error('a fact must name the file it was read from');
  }
  if (!Number.isInteger(span.line) || span.line < 1) {
    throw new Error(`a fact at ${span.file} must name a line, one or greater; it named ${span.line}`);
  }

  let text;
  try {
    text = readFileSync(join(root, span.file), 'utf8');
  } catch {
    return false;
  }

  const lineCount = text.split('\n').length;
  if (span.line > lineCount) {
    throw new Error(
      `the extractor reported ${span.file}:${span.line}, which does not resolve: the file has ${lineCount} lines`,
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Stage one — the deterministic enumeration
// ---------------------------------------------------------------------------

/** The kinds a given language's vocabulary reaches for a node type, memoised. */
const KIND_INDEX = new Map();

// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function kindIndexFor(language) {
  if (KIND_INDEX.has(language)) return KIND_INDEX.get(language);
  const vocabulary = FACT_VOCABULARY[language] ?? {};
  const index = new Map();
  for (const kind of FACT_KINDS) {
    for (const nodeType of vocabulary[kind] ?? []) {
      if (!index.has(nodeType)) index.set(nodeType, []);
      index.get(nodeType).push(kind);
    }
  }
  KIND_INDEX.set(language, index);
  return index;
}

/** The text a name filter is tested against, which differs by node type. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function nameOf(node) {
  if (node.type === 'call_expression') {
    const callee = node.childForFieldName?.('function');
    if (callee === null || callee === undefined) return null;
    if (callee.type === 'field_expression') return callee.childForFieldName?.('field')?.text ?? null;
    return callee.text ?? null;
  }
  if (node.type === 'macro_invocation') {
    return node.childForFieldName?.('macro')?.text ?? null;
  }
  if (node.type === 'assignment_expression' || node.type === 'assignment' || node.type === 'assignment_statement') {
    const left = node.childForFieldName?.('left');
    if (left === null || left === undefined) return null;
    if (left.type === 'field_expression' || left.type === 'member_expression' || left.type === 'selector_expression' || left.type === 'attribute') {
      return left.childForFieldName?.('field')?.text ?? left.text ?? null;
    }
    return left.text ?? null;
  }
  return node.childForFieldName?.('name')?.text ?? null;
}

/** The name a declaration carries, for the declaration-shaped kinds. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function declaredNameOf(node) {
  return node.childForFieldName?.('name')?.text ?? null;
}

/** Whether a declaration's text carries a visibility modifier. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function isPublicDeclaration(node, language) {
  if (language === 'rust') {
    return node.namedChildren.some((child) => child.type === 'visibility_modifier');
  }
  if (language === 'go' || language === 'python') {
    const name = declaredNameOf(node);
    if (name === null) return false;
    return language === 'go' ? /^[A-Z]/.test(name) : !/^_/.test(name);
  }
  return node.type === 'export_statement'
    || node.namedChildren.some((child) => child.type === 'export_statement' || child.text === 'export');
}

/**
 * The call a node is an argument of, or null.
 *
 * The argument list is its own node, so an expression inside a call is a
 * grandchild rather than a child. A check that looked only one level up would
 * find `arguments` and conclude the expression is not in a call at all.
 */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function enclosingCallOf(node) {
  let current = node.parent;
  while (current !== null && current !== undefined) {
    if (current.type === 'call_expression' || current.type === 'call') return current;
    if (current.type === 'arguments' || current.type === 'argument_list') {
      current = current.parent;
      continue;
    }
    return null;
  }
  return null;
}

/** Whether a node sits on the left of an assignment, where it is written rather than read. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function isAssignmentTarget(node) {
  let current = node.parent;
  while (current !== null && current !== undefined) {
    if (current.type === 'assignment_expression' || current.type === 'assignment' || current.type === 'assignment_statement') {
      return current.childForFieldName?.('left') === node;
    }
    if (current.type.endsWith('_statement') || current.type.endsWith('_item')) return false;
    current = current.parent;
  }
  return false;
}

/** The `#[cfg(...)]` gates a declaration carries. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function isCfgGated(node) {
  let current = node;
  while (current !== null && current !== undefined) {
    const siblings = current.parent?.namedChildren ?? [];
    const index = siblings.indexOf(current);
    for (let before = index - 1; before >= 0; before -= 1) {
      const previous = siblings[before];
      if (previous.type !== 'attribute_item') break;
      if (previous.text.includes('cfg')) return true;
    }
    current = current.parent;
  }
  return false;
}

/** The names a function declares as parameters, with the binding syntax stripped. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function parametersOf(functionNode) {
  const parameterList = functionNode.childForFieldName?.('parameters')
    ?? functionNode.namedChildren.find((child) => child.type.endsWith('parameter_list'));
  const declared = [];
  for (const parameter of parameterList?.namedChildren ?? []) {
    const name = parameter.childForFieldName?.('pattern')?.text
      ?? parameter.childForFieldName?.('name')?.text
      ?? parameter.namedChildren?.[0]?.text;
    if (name) declared.push(name.replace(/^&?\s*(?:mut\s+)?/, '').trim());
  }
  return declared;
}

/**
 * Walk a file's syntax tree once, emitting every fact the language's vocabulary
 * reaches, with the enclosing declaration and the test context attached.
 */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function factsInFile({ root, relativePath, language, tree, text }) {
  const index = kindIndexFor(language);
  const filters = NAME_FILTERS[language] ?? {};
  const lines = text.split('\n');
  const facts = [];

  const emit = (node, kind, extra = {}) => {
    facts.push({
      fact_id: `fact-${relativePath.split('/').join('_')}-${kind}-${node.startPosition.row + 1}-${facts.length}`,
      kind,
      family: FAMILY_OF_KIND[kind],
      file: relativePath,
      source_span: { file: relativePath, line: node.startPosition.row + 1 },
      // Every fact is read from the text or its syntax tree, and saying so on
      // the record is what stops a later reader treating one as if it had come
      // from a build or a trace.
      evidence_mode: 'source_static',
      text: (node.text ?? '').split('\n')[0].trim().slice(0, 160),
      gated: isCfgGated(node),
      ...extra,
    });
  };

  const visit = (node, enclosing) => {
    const isFunction = /(?:function|method|fn|func)_(?:item|definition|declaration)/.test(node.type)
      || node.type === 'function_item';
    const attributeText = node.parent?.namedChildren
      ?.slice(Math.max(0, node.parent.namedChildren.indexOf(node) - 3), node.parent.namedChildren.indexOf(node))
      .filter((sibling) => sibling.type === 'attribute_item')
      .map((sibling) => sibling.text)
      .join('\n') ?? '';
    const isTestFunction = isFunction
      && (RUST_TEST_ATTRIBUTE.test(attributeText) || TEST_PATH.test(relativePath) || /^test_/.test(declaredNameOf(node) ?? ''));

    // The parameters travel with the scope rather than in a file-wide set. A
    // set collected across the file would make any identifier matching any
    // definition's parameter read as an argument — so `target` bound as a local
    // in one definition would be reported as an argument read because a
    // different definition happens to take a parameter of that name.
    const declaredParameters = isFunction
      ? parametersOf(node)
      : (enclosing?.parameters ?? []);
    const scope = isFunction
      ? {
          name: declaredNameOf(node) ?? '(anonymous)',
          line: node.startPosition.row + 1,
          test: isTestFunction,
          parameters: declaredParameters,
        }
      : enclosing;

    for (const kind of index.get(node.type) ?? []) {
      const filter = filters[kind];
      if (filter !== undefined) {
        const name = nameOf(node);
        if (name === null || !filter.test(name)) continue;
      }

      // A declaration kind states which family it fills and nothing more.
      if (kind === 'public_item' && !isPublicDeclaration(node, language)) continue;
      if (kind === 'type_declaration') {
        emit(node, kind, { declaredName: declaredNameOf(node) });
        continue;
      }
      if (kind === 'error_type') {
        const name = declaredNameOf(node) ?? '';
        const inErrorPosition = /Result\s*</.test(lines[node.startPosition.row] ?? '')
          || /error|err|fail/i.test(name);
        if (!inErrorPosition) continue;
        emit(node, kind, { declaredName: name, signal: /error|err|fail/i.test(name) ? 'name_matches_error' : 'appears_as_result_error_type' });
        continue;
      }
      if (kind === 'state_field') {
        const name = nameOf(node) ?? '';
        if (!STATE_NAME.test(name)) continue;
        emit(node, kind, { fieldName: name });
        continue;
      }
      if (kind === 'state_assignment') {
        const name = nameOf(node) ?? '';
        if (!STATE_NAME.test(name)) continue;
        const right = node.childForFieldName?.('right') ?? node.childForFieldName?.('value');
        emit(node, kind, {
          fieldName: name,
          scope: scope?.name ?? null,
          assignedText: right ? right.text.split('\n')[0].trim() : null,
        });
        continue;
      }

      // Reads and writes of arguments, fields and globals: the vocabulary names
      // the node type, and the position in the expression decides the direction.
      if (['field_read', 'global_read', 'argument_read'].includes(kind)) {
        if (isAssignmentTarget(node)) continue;
      }
      if (['field_write', 'global_write'].includes(kind)) {
        const left = node.childForFieldName?.('left');
        if (left === null || left === undefined) continue;
        const written = ['field_expression', 'member_expression', 'selector_expression', 'attribute'].includes(left.type)
          ? 'field_write'
          : 'global_write';
        if (written !== kind) continue;
      }
      if (kind === 'argument_read') {
        const declared = scope?.parameters ?? [];
        if (!declared.includes((node.text ?? '').trim())) continue;
      }

      if (kind === 'error_variant') {
        const call = enclosingCallOf(node);
        if (call === null || !/^Err$/.test(call.childForFieldName?.('function')?.text ?? '')) continue;
        emit(node, kind, { variant: node.text });
        continue;
      }

      if (kind === 'test_boundary_value') {
        if (scope?.test !== true) continue;
        emit(node, kind, { scope: scope.name, value: node.text });
        continue;
      }
      if (kind === 'test_expected_exception') {
        if (scope?.test !== true || !EXPECTED_FAILURE.test(node.text ?? '')) continue;
        emit(node, kind, { scope: scope.name });
        continue;
      }

      if (kind === 'conditional') {
        const body = node.namedChildren.find((child) => child.type.endsWith('block') || child.type === 'consequence');
        const branches = body?.namedChildren ?? node.namedChildren;
        const containsEarlyReturn = branches.some(
          (child) => child.type === 'return_expression' || child.type === 'return_statement',
        );
        const condition = node.childForFieldName?.('condition');
        emit(node, kind, {
          scope: scope?.name ?? null,
          condition: condition ? condition.text : null,
          containsEarlyReturn,
        });
        continue;
      }

      emit(node, kind, { scope: scope?.name ?? null });
    }

    for (const child of node.namedChildren) visit(child, scope);
  };

  if (tree?.rootNode) visit(tree.rootNode, null);
  return facts;
}

/** The files a population names: the seeds when given, otherwise the whole tree. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function populationOf(root, { seeds = null, excludedPaths = [] } = {}) {
  if (Array.isArray(seeds) && seeds.length > 0) {
    return [...seeds].sort(compareText);
  }
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .filter((artefact) => syntaxLanguageOf(artefact.path) !== 'unknown')
    .map((artefact) => artefact.path)
    .sort(compareText);
}

/**
 * Stage one — enumerate the source facts a population contains.
 *
 * Nothing here decides what a fact means. The one place a name is interpreted is
 * the state-field vocabulary, and that is declared as a naming heuristic because
 * a syntax tree carries no other signal that a field is a state: the design asks
 * for "state fields and their assignments", and the honest instrument says the
 * name is all it had to go on.
 */
export function enumerateSourceFacts(population) {
  const { root, seeds = null, excludedPaths = [] } = population ?? {};
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('stage one needs the population root it is to enumerate; it was given none');
  }

  const files = populationOf(root, { seeds, excludedPaths });
  const facts = [];
  const attempts = [];
  const coverage = emptyCoverage();
  const limitations = [];
  const exercised = new Map();

  coverage.files_discovered = files.length;

  for (const relativePath of files) {
    const language = syntaxLanguageOf(relativePath);
    const parsed = parseSourceFile(root, relativePath);
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: relativePath,
        configuration: 'syntax_only',
        tool: 'tree-sitter',
        outcome: { phase: 'parse', status: 'failed', reason: parsed.message, extractedCount: 0 },
      }));
      limitations.push({
        code: 'file_not_parsed',
        scope: relativePath,
        effect: `no fact was read from ${relativePath}, so its absence below is a property of the instrument and not of the file`,
      });
      continue;
    }

    coverage.files_parsed += 1;

    const inFile = factsInFile({ root, relativePath, language, tree: parsed.tree, text: parsed.text });
    exercised.set(language, (exercised.get(language) ?? 0) + inFile.length);
    facts.push(...inFile);

    // The count is recorded after the file has been read, because
    // `extracted_count: 0` on a successful parse is the ledger's one job to keep
    // honest: reporting zero for a file that yielded four thousand facts would
    // make "analysed and found nothing" indistinguishable from "analysed and
    // found a great deal", which is the confusion the ledger exists to end.
    if (parsed.errorNodes) {
      coverage.files_with_error_nodes += 1;
      attempts.push(recordAttempt({
        target: relativePath,
        configuration: 'syntax_only',
        tool: 'tree-sitter',
        outcome: {
          phase: 'parse',
          status: 'partial',
          diagnostics: [{ severity: 'warning', message: 'the grammar recovered from a syntax error while parsing this file' }],
          extractedCount: inFile.length,
        },
      }));
    } else {
      attempts.push(recordAttempt({
        target: relativePath,
        configuration: 'syntax_only',
        tool: 'tree-sitter',
        outcome: { phase: 'parse', status: 'success', extractedCount: inFile.length },
      }));
    }
  }

  facts.sort((left, right) => compareText(
    `${left.source_span.file}:${String(left.source_span.line).padStart(8, '0')}:${left.kind}`,
    `${right.source_span.file}:${String(right.source_span.line).padStart(8, '0')}:${right.kind}`,
  ));

  const populationLanguages = new Set(files.map((file) => syntaxLanguageOf(file)));
  for (const language of Object.keys(FACT_VOCABULARY)) {
    if (populationLanguages.has(language)) continue;
    limitations.push({
      code: 'language_absent_from_population',
      scope: language,
      effect: `the ${language} vocabulary was declared and not exercised by this run; its correctness is unverified here`,
    });
  }
  limitations.push({
    code: 'state_field_by_name',
    scope: 'all languages',
    effect: 'a state field is recognised by its name, so a state carried under a name outside the vocabulary is not enumerated',
  });

  return {
    root,
    files,
    facts,
    attempts,
    coverage,
    limitations,
    analysis_mode: 'syntax_only',
    exercisedLanguages: Object.fromEntries([...exercised.entries()].sort()),
  };
}

// ---------------------------------------------------------------------------
// Stage two — the stage that may mean something
// ---------------------------------------------------------------------------

/**
 * The shapes a proposition may not take, because they restate an intention
 * instead of naming a source fact.
 *
 * The design's own example is the test: "the body of the send path contains a
 * branch that returns the not-connected error when the carrier state is not
 * connected, and whether that is a caller obligation or an internal defence is
 * undecided" is a proposition about the text; "the precondition is that the
 * connection is established" is a conclusion the text cannot support, wearing
 * the same font.
 */
const INTENT_RESTATEMENT_PATTERNS = Object.freeze([
  /\bthe (?:pre|post)condition (?:is|must|shall)\b/i,
  /\bthe invariant (?:is|must|shall)\b/i,
  /\bthe design (?:is|requires|intends|says)\b/i,
  /\bthe (?:intent|requirement|specification) (?:is|requires)\b/i,
  /\b(?:must|shall) (?:always )?(?:be|hold|remain)\b/i,
]);

/**
 * Whether a value is a decided fact rather than a candidate.
 *
 * This is the type-level half of the separation the design insists on. A
 * candidate read as a settled fact is silent — it reads as success — so the
 * distinction has to be checkable rather than conventional.
 */
export function isDecidedFact(value) {
  return value !== null
    && typeof value === 'object'
    && value.classification !== CANDIDATE_CLASSIFICATION;
}

/** Refuse a candidate where a decided fact is required. */
export function assertDecidedFact(value) {
  if (!isDecidedFact(value)) {
    throw new Error(
      `${value?.candidate_id ?? 'a candidate'} is a candidate and cannot be used where a decided fact is required: `
      + 'it carries no recorded human decision, so treating it as settled would invent one',
    );
  }
  return value;
}

/**
 * Refuse a candidate that restates an intention, or that cannot be pointed at.
 *
 * A proposition nobody can go and look at is an assertion rather than evidence,
 * and a proposition that already names its own classification has decided the
 * thing the extractor is forbidden to decide.
 */
export function assertCandidateIsSourceFalsifiable(candidate, { root = null } = {}) {
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error('a candidate must be an object carrying a proposition and the span it was read from');
  }
  if (candidate.classification !== CANDIDATE_CLASSIFICATION) {
    throw new Error(
      `${candidate.candidate_id ?? 'a proposition'} is not marked as a candidate: a stage-two finding that `
      + 'presents itself as settled has decided what only a human may decide',
    );
  }
  if (typeof candidate.proposition !== 'string' || candidate.proposition.trim().length === 0) {
    throw new Error(`${candidate.candidate_id} states no proposition`);
  }
  // Only the proposition's own words are judged. A candidate quotes the code it
  // cites, and source text routinely carries the same vocabulary — an assertion
  // message reading `"last sample must be preserved"` is the project talking,
  // not the analysis. Testing the quotation would refuse a faithful candidate
  // for reporting what the file says.
  const prose = candidate.proposition.replace(/`[^`]*`/g, ' ');
  const restating = INTENT_RESTATEMENT_PATTERNS.find((pattern) => pattern.test(prose));
  if (restating !== undefined) {
    throw new Error(
      `${candidate.candidate_id} restates intent rather than naming a source fact: `
      + `"${candidate.proposition}". A candidate must describe the condition the text contains and leave its `
      + 'classification to the counterexamples and the human grill',
    );
  }
  if (candidate.claim_type === 'normative') {
    throw new Error(`${candidate.candidate_id} is normative: the extractor may not record a human's decision`);
  }
  if (!EXTRACTOR_CLASSES.includes(candidate.claim_type)) {
    throw new Error(
      `${candidate.candidate_id} carries ${candidate.claim_type}; the extractor emits ${EXTRACTOR_CLASSES.join(' or ')}`,
    );
  }
  if (root !== null && root !== undefined && assertSpanResolves(root, candidate.source_span) !== true) {
    throw new Error(
      `${candidate.candidate_id} names ${candidate.source_span.file}:${candidate.source_span.line}, which does not `
      + 'resolve; a proposition a reader cannot go and look at is not evidence',
    );
  }
  return true;
}

/**
 * A state machine, as a candidate graph rather than a determined machine.
 *
 * `missing` is required rather than optional. A machine that silently omits the
 * transitions it could not follow is worse than one that declares them, because
 * the omission is invisible and the graph reads as complete.
 */
export function buildStateMachineCandidate({ carrier, states_seen, transitions_seen, missing }) {
  if (typeof carrier !== 'string' || carrier.length === 0) {
    throw new Error('a state machine candidate must name the carrier whose states were seen');
  }
  if (!Array.isArray(states_seen) || !Array.isArray(transitions_seen)) {
    throw new Error(`the state machine candidate for ${carrier} must carry states_seen and transitions_seen as lists`);
  }
  if (!Array.isArray(missing)) {
    throw new Error(
      `the state machine candidate for ${carrier} must declare what it could not follow; an absent list is not an `
      + 'empty one, and a machine with no declared gap reads as complete',
    );
  }

  return {
    kind: 'state_machine',
    carrier,
    states_seen: [...states_seen],
    transitions_seen: transitions_seen.map((transition) => ({ ...transition })),
    missing: missing.map((gap) => ({ ...gap })),
    // The states and transitions that were seen are read from the text, so this
    // is `observed`. What is *not* claimed is completeness — that is what
    // `missing` declares, and it is why the graph is a candidate rather than a
    // determined machine.
    claim_type: 'observed',
    evidence_mode: 'source_static',
    classification: CANDIDATE_CLASSIFICATION,
    [CANDIDATE_APPROVAL_KEY]: true,
  };
}

/** The undecided question each contract-shaped fact raises. */
const UNDECIDED_BY_KIND = Object.freeze({
  conditional: 'whether the branch is a caller obligation or an internal defence',
  assert: 'whether the condition is an invariant of the type or a defensive check',
  error_return: 'whether a caller may rely on the failure or it is an internal guard',
});

/** The question the grill is asked about a candidate the extractor could not settle. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function grillQuestionFor(candidate) {
  return `Which configuration does the condition at ${candidate.source_span.file}:${candidate.source_span.line} hold `
    + `in, and is it ${candidate.undecided}? The fact sits behind a configuration gate, so what ships cannot be `
    + 'read from the text alone.';
}

/**
 * Stage two — state what the facts might mean, as candidates only.
 *
 * The propositions are built from the fact's own text and position, and each
 * carries the question it could not settle. Nothing here is stored as a
 * classification: a candidate leaves with `classification: "candidate"` and
 * `requires_human_approval`, and the fold into `observed` or `unresolved` is the
 * most the extractor is allowed to say.
 */
export function generateCandidates(factsBundle) {
  const facts = factsBundle?.facts;
  if (!Array.isArray(facts)) {
    throw new Error('stage two consumes the facts stage one enumerated; it was given no facts list');
  }

  const candidates = [];
  const carrierStates = new Map();

  for (const fact of facts) {
    // Only the contract-shaped facts raise a question. A field read is not a
    // contract candidate, and proposing one would bury the candidates that are.
    if (!['conditional', 'assert', 'error_return'].includes(fact.kind)) {
      if (fact.kind === 'state_field' || fact.kind === 'state_assignment') {
        const carrier = fact.file;
        if (!carrierStates.has(carrier)) carrierStates.set(carrier, { fields: new Set(), assignments: [] });
        const entry = carrierStates.get(carrier);
        if (fact.kind === 'state_field') entry.fields.add(fact.fieldName);
        else entry.assignments.push(fact);
      }
      continue;
    }
    if (fact.kind === 'conditional' && fact.containsEarlyReturn !== true) continue;

    const anchor = `${fact.source_span.file}:${fact.source_span.line}`;
    const proposition = fact.kind === 'conditional'
      ? `the body of \`${fact.scope ?? '(anonymous)'}\` contains a branch at ${anchor} that returns early when `
        + `\`${fact.condition ?? 'its condition'}\` holds`
      : fact.kind === 'assert'
        ? `the body of \`${fact.scope ?? '(anonymous)'}\` contains a condition check at ${anchor} asserting `
          + `\`${fact.text}\``
        : `the body of \`${fact.scope ?? '(anonymous)'}\` returns \`${fact.text}\` at ${anchor}`;

    const candidate = {
      candidate_id: `cand-${fact.fact_id}`,
      kind: fact.kind,
      claim_type: fact.gated ? 'unresolved' : 'observed',
      scope: fact.file.includes('/') ? fact.file.slice(0, fact.file.lastIndexOf('/')) : '.',
      source_span: { ...fact.source_span },
      evidence_mode: 'source_static',
      proposition,
      undecided: UNDECIDED_BY_KIND[fact.kind] ?? 'what the fact obliges a caller to do',
      falsification: `mutate the condition at ${anchor} and observe whether any test fails`,
      classification: CANDIDATE_CLASSIFICATION,
      [CANDIDATE_APPROVAL_KEY]: true,
    };
    if (candidate.claim_type === 'unresolved') candidate.grill_question = grillQuestionFor(candidate);
    candidates.push(candidate);
  }

  for (const [carrier, entry] of carrierStates.entries()) {
    // A transition is from one state to another, and a single assignment site
    // shows only the target. Reading the enclosing definition as the source
    // state would put a definition's name where a state belongs, so the source
    // is recorded as not statically knowable instead — once per carrier, and
    // declared among the gaps rather than silently assumed.
    const transitions = entry.assignments.map((fact) => ({
      from: null,
      to: STATIC_STATE_VALUE.test(fact.assignedText ?? '') ? fact.assignedText : null,
      at: `${fact.source_span.file}:${fact.source_span.line}`,
      field: fact.fieldName,
    }));

    const missing = [{
      reason: 'from_state_requires_dataflow',
      detail:
        'the state a transition leaves is not readable from an assignment site, so R3 records the target and '
        + 'the position and defers the source; completing the machine needs the dataflow R6.5 runs',
    }];
    if (entry.fields.size === 0) {
      missing.push({
        reason: 'no_state_field_seen',
        detail: `a state-like name is assigned in ${carrier} and no field declaration in that file declares one`,
      });
    }
    for (const transition of transitions) {
      if (transition.to === null) {
        missing.push({
          reason: 'assigned_value_not_statically_known',
          at: transition.at,
          detail: `the value written to ${transition.field} at ${transition.at} is not a state name the text settles`,
        });
      }
    }

    candidates.push(buildStateMachineCandidate({
      carrier,
      states_seen: [...entry.fields].sort(compareText),
      transitions_seen: transitions,
      missing,
    }));
  }

  for (const candidate of candidates) {
    if (candidate.kind === 'state_machine') continue;
    assertCandidateIsSourceFalsifiable(candidate);
  }

  return {
    ...factsBundle,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/**
 * The observation channels a syntax-only run did not use, and why.
 *
 * Recording them is the difference between "the analysis looked and found no
 * dynamic mechanism" and "the analysis never looked" — two states a consumer
 * cannot tell apart from a result alone, and the conflation of which is failure
 * F12.
 */
export function unavailableChannels() {
  return [
    {
      channel: 'build_semantic',
      used: false,
      reason:
        'layer C is not built here (docs/P22-ANALYSIS-TECH.md §7): name resolution, type checking and cfg '
        + 'evaluation need a semantic adapter, so a proposition resting on any of them is not observed',
    },
    {
      channel: 'runtime_dynamic',
      used: false,
      reason:
        'no execution, build or trace evidence was collected, so dynamic dispatch targets, generated code and '
        + 'post-preprocessing composition are not observable in this run',
    },
  ];
}

/**
 * R3 — the semantic material, from the boundary R2 measured.
 *
 * The R2 graph is a precondition and not a decoration. R3 enumerates within the
 * population the dependency measurement scoped, and an extractor that silently
 * walked the whole tree when it was handed no boundary would be measuring a
 * different project from the one the run declared.
 */
export function extractSemantics({ root, dependencies, excludedPaths = [], seeds = null } = {}) {
  if (dependencies === null || dependencies === undefined) {
    throw new Error(
      'R3 reads its population from the R2 dependency graph, and no graph was supplied; an extractor that walked '
      + 'the tree anyway would be measuring a boundary nobody declared',
    );
  }
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('R3 must be given the root it enumerates');
  }

  const stageOne = enumerateSourceFacts({ root, seeds, excludedPaths });
  const stageTwo = generateCandidates(stageOne);

  const families = Object.fromEntries(SEMANTIC_FAMILIES.map((family) => [family, []]));
  for (const fact of stageTwo.facts) {
    const family = FAMILY_OF_KIND[fact.kind];
    if (family === undefined) {
      throw new Error(`fact ${fact.fact_id} carries ${fact.kind}, which belongs to no family`);
    }
    families[family].push(fact);
  }

  const result = {
    root,
    analysis_mode: stageTwo.analysis_mode,
    coverage: stageTwo.coverage,
    limitations: stageTwo.limitations,
    attempts: stageTwo.attempts,
    exercisedLanguages: stageTwo.exercisedLanguages,
    families,
    facts: stageTwo.facts,
    candidates: stageTwo.candidates,
    unavailable_channels: unavailableChannels(),
  };
  assertAdapterResult(result);
  return result;
}

/** The channels an evidence mode may name, re-exported so consumers need one import. */
export { EVIDENCE_MODES };

/** The semantic material as the Markdown a human or an AI reads before deciding anything. */
export function renderSemanticsReport(semantics) {
  const lines = [
    '# R3 — the semantic material',
    '',
    `${semantics.facts.length} fact(s) enumerated, ${semantics.candidates.length} candidate(s) raised. `
      + 'A candidate is a proposition the source text supports and cannot settle; none of them is a contract.',
    '',
    '## Families',
    '',
    '| family | facts | what it holds |',
    '|---|---|---|',
  ];

  const WHICH = Object.freeze({
    public_surface: 'declarations the text marks public',
    types: 'structs, enums, unions, traits and aliases',
    error_types: 'declared types carrying an error signal',
    guards: 'branches, early returns and loop conditions',
    invariants: 'assertions and unwrapping calls',
    state_machines: 'state-like fields and the assignments to them',
    side_effects: 'I/O, panics and writes beyond the local frame',
    tests: 'boundary values and expected failures a test declares',
  });
  for (const family of SEMANTIC_FAMILIES) {
    lines.push(`| ${family} | ${semantics.families[family].length} | ${WHICH[family]} |`);
  }

  lines.push('', '## Language coverage', '');
  for (const [language, count] of Object.entries(semantics.exercisedLanguages)) {
    lines.push(`- \`${language}\` — ${count} fact(s)`);
  }
  const absent = semantics.limitations.filter((item) => item.code === 'language_absent_from_population');
  if (absent.length > 0) {
    lines.push(
      '',
      `Not exercised by this population: ${absent.map((item) => `\`${item.scope}\``).join(', ')}. The vocabulary `
        + 'for these is declared and its correctness is unverified here — an untested table, not an absence of '
        + 'the material in the project.',
    );
  }

  lines.push('', '## What this run could not look at', '');
  for (const channel of semantics.unavailable_channels) {
    lines.push(`- \`${channel.channel}\` — ${channel.reason}`);
  }

  lines.push('', '## Limitations of the instrument', '');
  for (const limitation of semantics.limitations) {
    lines.push(`- \`${limitation.code}\` (${limitation.scope}) — ${limitation.effect}`);
  }
  lines.push('');
  return lines.join('\n');
}
