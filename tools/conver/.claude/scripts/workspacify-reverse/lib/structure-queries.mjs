/**
 * The query set each target language's structure extractor reads its grammar with.
 *
 * One frozen row per language, so `measureStructure` holds no branch on the
 * language and adding a seventh language is adding a row rather than editing a
 * function. The rows are written against the grammars' own node names rather
 * than the languages' specifications, because the two disagree in ways that are
 * silent: TypeScript's `export *` has no node of its own — it is an
 * `export_statement` with a `source` and no clause — and C's declaration name
 * sits at the centre of a declarator chain rather than in a field.
 *
 * Every reader here is shared. A language supplies descriptors and nothing
 * else; the walk, the record shape and the `file:line` grounding are the same
 * for all six, which is what lets a consumer read E1-E4 without asking which
 * language produced them.
 *
 * Nothing here resolves a name. A row states what the grammar puts in the tree,
 * and the reason each cell is `partial` names the constructs the language
 * itself puts beyond a syntax tree.
 */
/**
 * The four structure items, in the order the design names them.
 *
 * Named constants read by the declaration, the collectors and the tests, so the
 * count a test asserts and the count the measurement produces cannot drift.
 */
export const STRUCTURE_FAMILIES = Object.freeze(['E1', 'E2', 'E3', 'E4']);

/**
 * The line a node starts on, one-based, because `file:line` is one-based.
 *
 * Defined here rather than in `structure.mjs` because the readers below are the
 * module that turns nodes into locations; `structure.mjs` re-exports both so a
 * consumer of the syntax layer finds them where it always did.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function lineOf(node) {
  return node.startPosition.row + 1;
}

/** Visit every named node of a tree, parents before children. */
export function walkNamed(node, visit) {
  visit(node);
  for (const child of node.namedChildren) walkNamed(child, visit);
}

/** The item kinds Rust declares, from the node types that declare them. */
const RUST_ITEM_KINDS = Object.freeze({
  function_item: 'function',
  struct_item: 'struct',
  enum_item: 'enum',
  union_item: 'union',
  trait_item: 'trait',
  type_item: 'alias',
  const_item: 'constant',
  static_item: 'static',
  macro_definition: 'macro',
});

/** The Rust item kinds that declare a type, as opposed to an item that has one. */
const RUST_TYPE_KINDS = Object.freeze(['struct', 'enum', 'union', 'trait', 'alias']);

/** The node types that carry an identifier, wherever a declarator chain puts them. */
const IDENTIFIER_NODE_TYPES = Object.freeze([
  'identifier',
  'field_identifier',
  'type_identifier',
  'property_identifier',
]);

/**
 * How each language spells "this is reachable from outside the file".
 *
 * `modifier` reads a node the language writes on the declaration; `wrapper`
 * reads a statement the declaration sits inside, which is where TypeScript and
 * JavaScript put it; `capitalisation` and `leading_underscore` read the name,
 * which is where Go and Python state it; `linkage` reads the storage class C
 * uses. Each is the language's own way of writing reachability, not a verdict
 * this layer is in a position to reach: deciding whether a `pub(crate)` item is
 * externally visible needs name resolution, and `pub(crate)` is recorded as
 * what was written.
 */
const VISIBILITY_BY_KIND = Object.freeze({
  modifier: ({ node, descriptor }) => {
    const modifier = node.namedChildren.find((child) => descriptor.nodeTypes.includes(child.type));
    return modifier ? modifier.text : null;
  },
  wrapper: ({ node, descriptor }) => {
    const parent = node.parent;
    if (parent === null) return null;
    const wrapped = parent.type === descriptor.wrapperNodeType;
    return wrapped ? descriptor.spelling : null;
  },
  capitalisation: ({ symbol }) => (/^[A-Z]/.test(symbol) ? 'exported' : null),
  leading_underscore: ({ symbol }) => (symbol.startsWith('_') ? null : 'public'),
  linkage: ({ node, descriptor }) => {
    const storage = node.namedChildren.find((child) => descriptor.nodeTypes.includes(child.type));
    return storage && storage.text === descriptor.internalSpelling ? null : descriptor.spelling;
  },
});

/**
 * How each language spells conditional compilation, or that it has none.
 *
 * Rust writes it as an attribute on the item; C as an enclosing preprocessor
 * branch; Go as a comment at the head of the file, which binds every
 * declaration in that file and is therefore the one kind that needs the root.
 */
const CONDITIONAL_BY_KIND = Object.freeze({
  none: () => false,
  attribute: ({ node, descriptor }) => {
    const siblings = node.parent ? node.parent.namedChildren : [node];
    for (let before = siblings.indexOf(node) - 1; before >= 0; before -= 1) {
      const previous = siblings[before];
      if (previous.type !== descriptor.nodeType) break;
      if (previous.text.includes(descriptor.marker)) return true;
    }
    return false;
  },
  ancestor: ({ node, descriptor }) => {
    for (let parent = node.parent; parent !== null; parent = parent.parent) {
      if (descriptor.nodeTypes.includes(parent.type)) return true;
    }
    return false;
  },
  leading_comment: ({ root, descriptor }) => {
    const [first] = root.namedChildren;
    return first !== undefined
      && first.type === descriptor.nodeType
      && descriptor.markers.some((marker) => first.text.includes(marker));
  },
});

/**
 * The read of each error signal a language's syntax can support.
 *
 * `name_matches_error` is the weakest and every language has it. The rest are
 * the language's own way of writing that a declaration carries an error:
 * a Rust trait whose name contains `Error`, a TypeScript or Python base type
 * named for one, a Go method named `Error`. None is a verdict — a type may
 * carry the name and mean a transport status — so R1 records the signals and
 * leaves the classification to a reader.
 */
const ERROR_SIGNAL_READERS = Object.freeze({
  name_matches_error: ({ symbol }) => /error|err|fail/i.test(symbol),
  implements_error_trait: ({ symbol, context }) =>
    context.implementations.some(
      (implementation) => implementation.traitName !== null
        && /error/i.test(implementation.traitName)
        && implementation.typeName === symbol,
    ),
  appears_as_result_error_type: ({ symbol, context }) => context.resultErrorTypes.has(symbol),
  extends_error_type: ({ node, descriptor }) => baseNamesOf(node, descriptor).some((name) => /error/i.test(name)),
  inherits_error_base: ({ node, descriptor }) => baseNamesOf(node, descriptor).some((name) => /error/i.test(name)),
  declares_error_method: ({ symbol, context }) => context.errorMethodTypes.has(symbol),
});

/** The names a type declaration's heritage names, whether written as a node or a field. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function baseNamesOf(node, descriptor) {
  const heritage = descriptor.nodeType
    ? node.namedChildren.find((child) => child.type === descriptor.nodeType)
    : node.childForFieldName?.(descriptor.field);
  return heritage ? heritage.namedChildren.map((child) => child.text) : [];
}

/**
 * The query set each language's extractor reads the grammar with.
 *
 * `E1.moduleNodeTypes` names the declarations that state a module's identity.
 * `E2.itemKinds` maps a node type to the item kind it declares;
 * `E2.typeNodeKinds` resolves a kind the node's `type` field decides, which is
 * how a Go `type_spec` is told from an interface; `E2.declaratorKinds` maps a
 * node type whose children are declarators to the kind each declares;
 * `E2.exportSyntax` names how the language publishes a name it does not declare.
 * `E2.scopeBoundaryTypes` lists the ancestors that put a declaration out of
 * module scope, and `E2.skipWhenParentTypes` the parents that already report it.
 * `E3.typeKinds` selects the type declarations out of E2's items, and
 * `E3.variantBodyNodeType` the body whose children are a type's variants.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export const QUERIES_BY_LANGUAGE = Object.freeze({
  rust: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze(['mod_item']) }),
    E2: Object.freeze({
      itemKinds: RUST_ITEM_KINDS,
      typeNodeKinds: Object.freeze({}),
      declaratorKinds: Object.freeze({}),
      declaratorNodeType: null,
      nameFields: Object.freeze(['name']),
      wrapperNodeTypes: Object.freeze([]),
      exportSyntax: 'none',
      scopeBoundaryTypes: Object.freeze([]),
      skipWhenParentTypes: Object.freeze([]),
      visibility: Object.freeze({ kind: 'modifier', nodeTypes: Object.freeze(['visibility_modifier']) }),
      conditional: Object.freeze({ kind: 'attribute', nodeType: 'attribute_item', marker: 'cfg' }),
    }),
    E3: Object.freeze({ typeKinds: RUST_TYPE_KINDS, variantBodyNodeType: 'enum_variant_list' }),
    E4: Object.freeze({
      signals: Object.freeze(['name_matches_error', 'implements_error_trait', 'appears_as_result_error_type']),
    }),
  }),
  typescript: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze([]) }),
    E2: Object.freeze({
      itemKinds: Object.freeze({
        function_declaration: 'function',
        class_declaration: 'class',
        interface_declaration: 'interface',
        enum_declaration: 'enum',
        type_alias_declaration: 'alias',
      }),
      typeNodeKinds: Object.freeze({}),
      declaratorKinds: Object.freeze({ lexical_declaration: 'constant', variable_declaration: 'constant' }),
      declaratorNodeType: 'variable_declarator',
      nameFields: Object.freeze(['name']),
      wrapperNodeTypes: Object.freeze(['export_statement']),
      exportSyntax: 'esm',
      scopeBoundaryTypes: Object.freeze(['statement_block', 'class_body']),
      skipWhenParentTypes: Object.freeze([]),
      visibility: Object.freeze({ kind: 'wrapper', wrapperNodeType: 'export_statement', spelling: 'export' }),
      conditional: Object.freeze({ kind: 'none' }),
    }),
    E3: Object.freeze({ typeKinds: Object.freeze(['interface', 'class', 'enum', 'alias']), variantBodyNodeType: 'enum_body' }),
    E4: Object.freeze({
      signals: Object.freeze(['name_matches_error', 'extends_error_type']),
      errorBase: Object.freeze({ nodeType: 'class_heritage' }),
    }),
  }),
  javascript: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze([]) }),
    E2: Object.freeze({
      itemKinds: Object.freeze({
        function_declaration: 'function',
        generator_function_declaration: 'function',
        class_declaration: 'class',
      }),
      typeNodeKinds: Object.freeze({}),
      declaratorKinds: Object.freeze({ lexical_declaration: 'constant', variable_declaration: 'constant' }),
      declaratorNodeType: 'variable_declarator',
      nameFields: Object.freeze(['name']),
      wrapperNodeTypes: Object.freeze(['export_statement']),
      exportSyntax: 'commonjs',
      scopeBoundaryTypes: Object.freeze(['statement_block', 'class_body']),
      skipWhenParentTypes: Object.freeze([]),
      visibility: Object.freeze({ kind: 'wrapper', wrapperNodeType: 'export_statement', spelling: 'export' }),
      conditional: Object.freeze({ kind: 'none' }),
    }),
    E3: Object.freeze({ typeKinds: Object.freeze(['class']), variantBodyNodeType: null }),
    E4: Object.freeze({
      signals: Object.freeze(['name_matches_error', 'extends_error_type']),
      errorBase: Object.freeze({ nodeType: 'class_heritage' }),
    }),
  }),
  go: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze(['package_clause']) }),
    E2: Object.freeze({
      itemKinds: Object.freeze({
        type_spec: 'struct',
        type_alias: 'alias',
        function_declaration: 'function',
        method_declaration: 'method',
        var_spec: 'constant',
        const_spec: 'constant',
      }),
      typeNodeKinds: Object.freeze({ struct_type: 'struct', interface_type: 'interface' }),
      declaratorKinds: Object.freeze({}),
      declaratorNodeType: null,
      nameFields: Object.freeze(['name']),
      wrapperNodeTypes: Object.freeze([]),
      exportSyntax: 'none',
      scopeBoundaryTypes: Object.freeze([]),
      skipWhenParentTypes: Object.freeze([]),
      visibility: Object.freeze({ kind: 'capitalisation' }),
      conditional: Object.freeze({ kind: 'leading_comment', nodeType: 'comment', markers: Object.freeze(['//go:build', '// +build']) }),
    }),
    E3: Object.freeze({ typeKinds: Object.freeze(['struct', 'interface', 'alias']), variantBodyNodeType: null }),
    E4: Object.freeze({
      signals: Object.freeze(['name_matches_error', 'declares_error_method']),
      errorMethod: Object.freeze({ nodeType: 'method_declaration', nameField: 'name', receiverField: 'receiver', spelling: 'Error' }),
    }),
  }),
  python: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze([]) }),
    E2: Object.freeze({
      itemKinds: Object.freeze({
        function_definition: 'function',
        class_definition: 'class',
        assignment: 'constant',
      }),
      typeNodeKinds: Object.freeze({}),
      declaratorKinds: Object.freeze({}),
      declaratorNodeType: null,
      nameFields: Object.freeze(['name', 'left']),
      wrapperNodeTypes: Object.freeze([]),
      exportSyntax: 'none',
      scopeBoundaryTypes: Object.freeze(['block']),
      skipWhenParentTypes: Object.freeze([]),
      visibility: Object.freeze({ kind: 'leading_underscore' }),
      conditional: Object.freeze({ kind: 'none' }),
    }),
    E3: Object.freeze({ typeKinds: Object.freeze(['class']), variantBodyNodeType: null }),
    E4: Object.freeze({
      signals: Object.freeze(['name_matches_error', 'inherits_error_base']),
      errorBase: Object.freeze({ field: 'superclasses' }),
    }),
  }),
  c_cpp: Object.freeze({
    E1: Object.freeze({ moduleNodeTypes: Object.freeze([]) }),
    E2: Object.freeze({
      itemKinds: Object.freeze({
        function_definition: 'function',
        declaration: 'declaration',
        preproc_def: 'macro',
        preproc_function_def: 'macro',
        struct_specifier: 'struct',
        union_specifier: 'union',
        enum_specifier: 'enum',
        class_specifier: 'class',
      }),
      typeNodeKinds: Object.freeze({
        struct_specifier: 'struct',
        union_specifier: 'union',
        enum_specifier: 'enum',
        class_specifier: 'class',
      }),
      functionDeclaratorNodeType: 'function_declarator',
      declaratorKinds: Object.freeze({ type_definition: 'alias' }),
      declaratorNodeType: 'type_identifier',
      nameFields: Object.freeze(['name']),
      wrapperNodeTypes: Object.freeze([]),
      exportSyntax: 'none',
      scopeBoundaryTypes: Object.freeze(['compound_statement', 'field_declaration_list']),
      // A typedef and a declaration already report the specifier inside them; a
      // specifier that stands alone is the declaration, and is reported by itself.
      skipWhenParentTypes: Object.freeze(['type_definition', 'declaration', 'field_declaration']),
      visibility: Object.freeze({
        kind: 'linkage',
        nodeTypes: Object.freeze(['storage_class_specifier']),
        internalSpelling: 'static',
        spelling: 'external',
      }),
      conditional: Object.freeze({
        kind: 'ancestor',
        nodeTypes: Object.freeze(['preproc_if', 'preproc_ifdef', 'preproc_ifndef']),
      }),
    }),
    E3: Object.freeze({
      typeKinds: Object.freeze(['struct', 'union', 'class', 'enum', 'alias']),
      variantBodyNodeType: 'enumerator_list',
    }),
    E4: Object.freeze({ signals: Object.freeze(['name_matches_error']) }),
  }),
});

/**
 * The name a declaration writes.
 *
 * Most grammars put it in a field. C and C++ put a declarator there instead — a
 * chain of pointer, array and function levels wrapped around the identifier —
 * so the chain is unwrapped to the identifier at its centre.
 */
export function declaredNameOf(node, nameFields = ['name']) {
  if (IDENTIFIER_NODE_TYPES.includes(node.type)) return node.text;
  for (const nameField of nameFields) {
    const named = node.childForFieldName?.(nameField);
    if (named) return named.text;
  }
  const declarator = node.childForFieldName?.('declarator');
  return declarator ? identifierWithin(declarator) : null;
}

/** The first identifier inside a declarator chain. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function identifierWithin(node) {
  if (IDENTIFIER_NODE_TYPES.includes(node.type)) return node.text;
  for (const child of node.namedChildren) {
    const found = identifierWithin(child);
    if (found !== null) return found;
  }
  return null;
}

/** The item kind a node declares, resolved through its `type` field where the node's own type cannot say. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function itemKindOf(node, descriptor) {
  const declared = descriptor.itemKinds[node.type];
  if (declared === undefined) return null;
  const typeNode = node.childForFieldName?.('type');
  const resolved = typeNode ? descriptor.typeNodeKinds[typeNode.type] : undefined;
  if (resolved !== undefined) return resolved;
  if (declared === 'declaration') {
    const declarator = node.childForFieldName?.('declarator');
    return declarator && containsNodeType(declarator, descriptor.functionDeclaratorNodeType)
      ? 'function'
      : 'constant';
  }
  return declared;
}

/** True when a declarator chain wraps a node of this type, which is how C tells a prototype from a variable. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function containsNodeType(node, type) {
  if (node.type === type) return true;
  return node.namedChildren.some((child) => containsNodeType(child, type));
}

/** The visibility a declaration writes, or null when it writes none. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function visibilityOf(node, symbol, descriptor) {
  return VISIBILITY_BY_KIND[descriptor.kind]({ node, symbol, descriptor });
}

/** True when the declaration sits under a construct that takes it out of module scope. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function outOfModuleScope(node, descriptor) {
  if (descriptor.skipWhenParentTypes.includes(node.parent?.type)) return true;
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    if (descriptor.scopeBoundaryTypes.includes(parent.type)) return true;
  }
  return false;
}

/** One declaration, with the node it was read from so a later item can ask it more. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function readDeclaration(node, symbol, itemKind, context) {
  const { relativePath, descriptor, root } = context;
  return {
    node,
    symbol,
    itemKind,
    file: relativePath,
    line: lineOf(node),
    visibility: visibilityOf(node, symbol, descriptor.visibility),
    cfgGated: CONDITIONAL_BY_KIND[descriptor.conditional.kind]({
      node,
      root,
      descriptor: descriptor.conditional,
    }),
    spelling: node.text.split('\n')[0].trim(),
  };
}

/** Every declaration one file writes, private ones included. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function declarationsIn(language, tree, relativePath) {
  const descriptor = QUERIES_BY_LANGUAGE[language].E2;
  const root = tree.rootNode;
  const declarations = [];

  walkNamed(root, (node) => {
    if (outOfModuleScope(node, descriptor)) return;
    const itemKind = itemKindOf(node, descriptor);
    if (itemKind !== null) {
      const symbol = declaredNameOf(node, descriptor.nameFields);
      if (symbol !== null) {
        declarations.push(readDeclaration(node, symbol, itemKind, { relativePath, descriptor, root }));
      }
      return;
    }
    const declaratorKind = descriptor.declaratorKinds[node.type];
    if (declaratorKind === undefined) return;
    const ownType = node.childForFieldName?.('type');
    const resolvedKind = (ownType && descriptor.typeNodeKinds[ownType.type]) ?? declaratorKind;
    for (const declarator of node.namedChildren) {
      if (declarator.type !== descriptor.declaratorNodeType) continue;
      const symbol = declaredNameOf(declarator, descriptor.nameFields);
      if (symbol === null) continue;
      declarations.push(readDeclaration(node, symbol, resolvedKind, { relativePath, descriptor, root }));
    }
  });

  return declarations;
}

/**
 * Every item one file declares, as the syntax layer can see them.
 *
 * `visibility` records what was written rather than a verdict on whether the
 * item is externally reachable, because deciding that needs name resolution
 * this layer does not have.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectItems(language, tree, relativePath) {
  return declarationsIn(language, tree, relativePath).map(({ node, ...record }) => record);
}

/** The public surface: the items whose declaration states a reachability, plus the statements that publish one. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectPublicSurface(language, tree, relativePath) {
  const descriptor = QUERIES_BY_LANGUAGE[language].E2;
  const declared = declarationsIn(language, tree, relativePath)
    .filter((declaration) => declaration.visibility !== null)
    .map(({ node, ...record }) => record);
  return [...declared, ...publishedNamesIn(language, tree, relativePath, descriptor)];
}

/** The type definitions a file declares, whatever their reachability. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectTypeDefinitions(language, tree, relativePath) {
  const typeKinds = QUERIES_BY_LANGUAGE[language].E3.typeKinds;
  return declarationsIn(language, tree, relativePath)
    .filter((declaration) => typeKinds.includes(declaration.itemKind))
    .map(({ node, ...record }) => ({
      symbol: record.symbol,
      typeKind: record.itemKind,
      file: record.file,
      line: record.line,
      visibility: record.visibility,
      cfgGated: record.cfgGated,
    }));
}

/**
 * Every module or package name a file declares.
 *
 * Rust and Go state one in the file; the other four leave a file's module
 * identity to its path, which E1's package grouping already carries.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectModules(language, tree, relativePath) {
  const { moduleNodeTypes } = QUERIES_BY_LANGUAGE[language].E1;
  const descriptor = QUERIES_BY_LANGUAGE[language].E2;
  const modules = [];
  walkNamed(tree.rootNode, (node) => {
    if (!moduleNodeTypes.includes(node.type)) return;
    const symbol = moduleNameOf(node, language);
    if (symbol === null) return;
    modules.push({
      symbol,
      file: relativePath,
      line: lineOf(node),
      visibility: visibilityOf(node, symbol, descriptor.visibility),
      inline: node.text.includes('{'),
    });
  });
  return modules;
}

/** Go writes the package name on a child rather than in a field of its own. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function moduleNameOf(node, language) {
  if (language === 'go') {
    const [name] = node.namedChildren;
    return name ? name.text : null;
  }
  return declaredNameOf(node);
}

/**
 * The names a file publishes without declaring them.
 *
 * TypeScript and JavaScript state their public surface in a statement rather
 * than on the declaration: `export * from './x'` reaches names this file never
 * writes, and a `module.exports` object names them. Each is recorded at the
 * statement that performs it, which is the only location the tree can offer —
 * the construct is visible even where the name it publishes is not.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function publishedNamesIn(language, tree, relativePath, descriptor) {
  if (descriptor.exportSyntax === 'none') return [];
  const published = [];
  walkNamed(tree.rootNode, (node) => {
    if (outOfModuleScope(node, descriptor)) return;
    if (descriptor.exportSyntax === 'esm') published.push(...esmExportsOf(node, relativePath));
    else published.push(...commonJsExportsOf(node, relativePath));
  });
  return published;
}

/** The names an `export` statement publishes. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function esmExportsOf(node, relativePath) {
  if (node.type !== 'export_statement') return [];
  const source = node.childForFieldName?.('source');
  if (!source) return [];
  const clause = node.namedChildren.find((child) => child.type === 'export_clause');
  if (!clause) {
    return [{
      symbol: source.text.replace(/^['"]|['"]$/g, ''),
      itemKind: 're_export_all',
      file: relativePath,
      line: lineOf(node),
      visibility: 'export',
      cfgGated: false,
      spelling: node.text.split('\n')[0].trim(),
    }];
  }
  return clause.namedChildren
    .filter((specifier) => specifier.type === 'export_specifier')
    .map((specifier) => ({
      symbol: (specifier.childForFieldName?.('alias') ?? specifier.childForFieldName?.('name')).text,
      itemKind: 're_export',
      file: relativePath,
      line: lineOf(specifier),
      visibility: 'export',
      cfgGated: false,
      spelling: node.text.split('\n')[0].trim(),
    }));
}

/** The names a CommonJS assignment publishes. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function commonJsExportsOf(node, relativePath) {
  if (node.type !== 'expression_statement') return [];
  const [assignment] = node.namedChildren;
  if (!assignment || assignment.type !== 'assignment_expression') return [];
  const left = assignment.childForFieldName?.('left');
  const right = assignment.childForFieldName?.('right');
  if (!left || left.type !== 'member_expression') return [];
  const object = left.childForFieldName?.('object');
  const property = left.childForFieldName?.('property');
  if (!object || !property) return [];

  // A CommonJS module publishes through `module.exports` or `exports.<name>`
  // and nothing else. `Widget.prototype.render = ...` is the same node shape
  // and attaches a method to an object this file already declared, so it is not
  // a publication and must not be read as one.
  const publishesModule = object.text === 'module' && property.text === 'exports';
  const publishesNamed = object.type === 'identifier' && object.text === 'exports';
  if (!publishesModule && !publishesNamed) return [];

  const spelling = node.text.split('\n')[0].trim();
  const record = (symbol) => ({
    symbol,
    itemKind: 'export',
    file: relativePath,
    line: lineOf(node),
    visibility: 'export',
    cfgGated: false,
    spelling,
  });

  if (publishesModule && right?.type === 'object') {
    const names = right.namedChildren
      .map((entry) => (entry.type === 'shorthand_property_identifier'
        ? entry.text
        : entry.childForFieldName?.('key')?.text ?? null))
      .filter((name) => name !== null);
    if (names.length > 0) return names.map(record);
  }
  return [record(publishesModule ? 'module.exports' : property.text)];
}

/** The variants a type declaration writes, each with its own location. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function variantsOf(declaration, language) {
  const { variantBodyNodeType } = QUERIES_BY_LANGUAGE[language].E3;
  if (variantBodyNodeType === null) return [];
  const body = declaration.node.childForFieldName?.('body');
  if (!body || body.type !== variantBodyNodeType) return [];
  return body.namedChildren
    .map((variant) => ({ symbol: declaredNameOf(variant), line: lineOf(variant) }))
    .filter((variant) => variant.symbol !== null);
}

/**
 * The evidence that a declared type is an error type.
 *
 * The name is the weakest signal and a base type named for an error is
 * stronger, but none is a verdict: a type named `Error` may be a transport
 * status, and a class may extend an error type for reasons a reader would not
 * call one. R1 records the signals and hands the classification to a reader, as
 * the design requires for every contract-shaped finding.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectErrorTypes(language, tree, relativePath, context) {
  const { signals, errorBase, errorMethod } = QUERIES_BY_LANGUAGE[language].E4;
  const typeKinds = QUERIES_BY_LANGUAGE[language].E3.typeKinds;
  const evidence = {
    implementations: context?.implementations ?? [],
    resultErrorTypes: context?.resultErrorTypes ?? new Set(),
    errorMethodTypes: errorMethodTypesIn(tree, errorMethod),
  };

  const errors = [];
  for (const declaration of declarationsIn(language, tree, relativePath)) {
    if (!typeKinds.includes(declaration.itemKind)) continue;
    const found = signals.filter((signal) => ERROR_SIGNAL_READERS[signal]({
      symbol: declaration.symbol,
      node: declaration.node,
      descriptor: errorBase,
      context: evidence,
    }));
    if (found.length === 0) continue;
    errors.push({
      symbol: declaration.symbol,
      file: relativePath,
      signals: found,
      typeKind: declaration.itemKind,
      line: declaration.line,
      variants: variantsOf(declaration, language),
      cfgGated: declaration.cfgGated,
    });
  }
  return errors;
}

/** The types that declare the language's error method, which is how Go makes one. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function errorMethodTypesIn(tree, descriptor) {
  const types = new Set();
  if (descriptor === undefined) return types;
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== descriptor.nodeType) return;
    if (node.childForFieldName?.(descriptor.nameField)?.text !== descriptor.spelling) return;
    const receiver = node.childForFieldName?.(descriptor.receiverField);
    const [declaration] = receiver ? receiver.namedChildren : [];
    const typeNode = declaration?.childForFieldName?.('type');
    if (typeNode) types.add(typeNode.text);
  });
  return types;
}

/** Every use declaration a Rust file makes, before any name resolution. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectUseDeclarations(tree, relativePath) {
  const uses = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'use_declaration') return;
    const argument = node.childForFieldName?.('argument')
      ?? node.namedChildren.find((child) => [
        'scoped_identifier', 'identifier', 'scoped_use_list', 'use_list', 'use_as_clause',
      ].includes(child.type));
    if (!argument) return;
    uses.push({ target: argument.text, file: relativePath, line: lineOf(node) });
  });
  return uses;
}

/**
 * Every `impl ... for Type` a Rust file contains.
 *
 * An impl of the standard `Error` trait is the strongest syntactic evidence
 * that a type is an error type, which is why it is collected even though trait
 * resolution is out of reach: the text says the trait's name, and that much is
 * a fact about the source.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectImplementations(tree, relativePath) {
  const implementations = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'impl_item') return;
    const traitNode = node.childForFieldName?.('trait');
    const typeNode = node.childForFieldName?.('type');
    implementations.push({
      traitName: traitNode ? traitNode.text : null,
      typeName: typeNode ? typeNode.text : null,
      file: relativePath,
      line: lineOf(node),
    });
  });
  return implementations;
}

/** Every type name that appears in the error position of a Rust `Result`. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectResultErrorTypes(tree) {
  const names = new Set();
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'generic_type') return;
    if (node.childForFieldName?.('type')?.text !== 'Result') return;
    const argument = node.childForFieldName?.('type_arguments')?.namedChildren?.[1];
    if (argument) names.add(argument.text);
  });
  return names;
}
