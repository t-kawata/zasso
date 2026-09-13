// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R2.5 — the execution surface: the dynamic mechanisms an import graph cannot
 * represent.
 *
 * This is the highest-priority measurement of the ticket. The design's failure
 * F4 is a static analysis that quietly overclaims: it reads `use` declarations,
 * finds no coupling, and reports that as the truth about a program that couples
 * half its modules through a trait object, a feature flag or a generated file.
 * The defence is not to detect every mechanism — exhaustiveness over an
 * arbitrary program is not decidable — but to enumerate the mechanisms that
 * were found, each with its `file:line`, so a human can audit what was and was
 * not looked at.
 *
 * The second half of the defence is mechanical: `classifyWithDynamicEvidence`
 * refuses `observed` for a proposition that touches a listed mechanism unless
 * dynamic evidence exists. That is rule R-1, and it is what stops the surface
 * from being decoration.
 */
import {
  ANALYSIS_MODES,
  EVIDENCE_MODES,
  LANGUAGES_WITH_EXTRACTORS,
  assertAdapterResult,
  renderCappedList,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { compareText } from './holdout-ledger.mjs';
import { collectRustUses, parseSourceFile, syntaxLanguageOf, syntaxRecoveryDiagnostic, walkNamed } from './structure.mjs';

/**
 * The kinds of mechanism this instrument enumerates.
 *
 * Each is a way for code to reach other code that no import names. The list is
 * a closed vocabulary so that a later stage can test membership in it rather
 * than matching prose, and so that a kind quietly disappearing is a test
 * failure rather than a silent change of meaning.
 */
export const MECHANISM_KINDS = Object.freeze([
  'compile_time_embedding',
  'code_generation',
  'dynamic_dispatch',
  'ffi',
  'runtime_loading',
  'config_driven',
  'conditional_compilation',
  'macro_expansion',
  'runtime_registration',
  'reflection',
]);

/**
 * The seven mechanism classes the design enumerates for E6, in its own words.
 *
 * They are named here so the relationship to the closed vocabulary below is a
 * fact a test can check rather than a claim in prose: the design's list is a
 * subset of what this instrument reads, and the three classes outside it are
 * ones the design's sentence does not name — a run-time load, a build-tag
 * selection and a macro expansion — not a second vocabulary.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export const DESIGN_E6_CLASSES = Object.freeze([
  'ffi',
  'reflection',
  'dynamic_dispatch',
  'code_generation',
  'runtime_registration',
  'config_driven',
  'compile_time_embedding',
]);

/**
 * Why a file carries no mechanism site: this instrument enumerates none for its language.
 *
 * Named rather than typed into the loop, so the row that records an unexamined
 * language is the same string wherever it is read, and a language whose
 * inventory was lost is distinguishable from one that has none.
 */
export const NO_MECHANISM_EXTRACTOR_REASON = 'no_mechanism_extractor_for_language';

/** The macros that read a file at compile time, making a build-time input a dependency. */
const EMBEDDING_MACROS = Object.freeze(['include_str', 'include_bytes', 'include']);

/** The call suffixes through which a Rust program reads its environment. */
const ENVIRONMENT_CALL_SUFFIXES = Object.freeze(['env::var', 'env::var_os']);

/**
 * The call suffixes through which a Rust program recovers a type at run time.
 *
 * Rust has no general reflection, and this is deliberately not a search for the
 * word "reflect": that word appears in ordinary prose, in identifiers and in
 * comments, and a mechanism list that fires on it would be noise a reader learns
 * to skip. These are the concrete APIs through which a value's type decides
 * which code runs.
 */
const REFLECTION_CALL_SUFFIXES = Object.freeze(['TypeId::of', 'downcast_ref', 'downcast_mut', 'type_id']);

/** True when a callee path names the given item, directly or through a module path. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function isPathTo(callee, item) {
  return callee === item || callee.endsWith(`::${item}`);
}

/** The attributes that make an item exist only in some configurations. */
const CONDITIONAL_ATTRIBUTE = /^#\[\s*cfg(_attr)?\s*[(!]/;

/** The crates that load a library at run time, which no `use` of the target can name. */
const RUNTIME_LOADING_CRATES = Object.freeze(['libloading', 'dlopen', 'libc::dlopen']);

/** The build script that generates code before the crate is compiled. */
const BUILD_SCRIPT = 'build.rs';

/** The statement this report makes about its own completeness, in every rendering. */
export const PRESENCE_NOT_ABSENCE =
  'This list is evidence of presence, not proof of absence. A mechanism not listed here is one '
  + 'this instrument did not find, which is not the same as one that is not there — no static '
  + 'analysis of an arbitrary program can be exhaustive about dynamic mechanisms.';

/** One mechanism, with the location that lets a human go and look at it. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function mechanism(kind, file, line, spelling, note) {
  return { id: `${kind}:${file}:${line}`, kind, file, line, spelling: spelling.trim(), note };
}

/** The macro a `macro_invocation` calls, or null. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function invokedMacroOf(node) {
  return node.childForFieldName?.('macro')?.text ?? null;
}

/** The callee path of a `call_expression`, or null. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function calleeOf(node) {
  if (node.type !== 'call_expression') return null;
  return node.childForFieldName?.('function')?.text ?? null;
}

/**
 * Every dynamic mechanism one Rust file declares.
 *
 * Detection is deliberately syntactic. Calling a macro `include_str!` is a fact
 * about the text; whether the embedded file exists is a fact about a build, and
 * is exactly the kind of claim this layer does not make.
 */
export function detectRustMechanisms(tree, relativePath, { uses = [] } = {}) {
  const found = [];

  if (relativePath === BUILD_SCRIPT) {
    found.push(mechanism(
      'code_generation',
      relativePath,
      1,
      '# build script',
      'a build script runs before compilation and commonly writes source that no import names',
    ));
  }

  for (const use of uses) {
    if (RUNTIME_LOADING_CRATES.some((crateName) => use.target.includes(crateName))) {
      found.push(mechanism(
        'runtime_loading',
        relativePath,
        use.line,
        use.target,
        'a library loaded by name at run time is coupled to code the compiler never sees',
      ));
    }
  }

  walkNamed(tree.rootNode, (node) => {
    if (node.type === 'macro_invocation') {
      const macro = invokedMacroOf(node);
      if (macro === null) return;
      if (EMBEDDING_MACROS.includes(macro)) {
        found.push(mechanism(
          'compile_time_embedding',
          relativePath,
          node.startPosition.row + 1,
          node.text,
          `${macro}! makes a build-time input a dependency of this file`,
        ));
        return;
      }
      if (macro.startsWith('env') || macro === 'option_env') {
        found.push(mechanism(
          'config_driven',
          relativePath,
          node.startPosition.row + 1,
          node.text,
          `${macro}! selects between values by build configuration, which no import records`,
        ));
      }
      return;
    }

    if (node.type === 'macro_definition') {
      found.push(mechanism(
        'macro_expansion',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a macro rewrites the syntax tree, so code that exists after expansion may not appear before it',
      ));
      return;
    }

    if (node.type === 'dynamic_type') {
      found.push(mechanism(
        'dynamic_dispatch',
        relativePath,
        node.startPosition.row + 1,
        node.text,
        'a trait object dispatches to an implementation the compiler chooses, so the call target is not in the text',
      ));
      return;
    }

    if (node.type === 'foreign_mod_item' || node.type === 'extern_modifier') {
      found.push(mechanism(
        'ffi',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a foreign declaration leaves the type system, so no Rust-side analysis constrains the other side',
      ));
      return;
    }

    if (node.type === 'attribute_item' && CONDITIONAL_ATTRIBUTE.test(node.text.trim())) {
      found.push(mechanism(
        'conditional_compilation',
        relativePath,
        node.startPosition.row + 1,
        node.text,
        'a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build',
      ));
      return;
    }

    const callee = calleeOf(node);
    if (callee === null) return;
    if (ENVIRONMENT_CALL_SUFFIXES.some((suffix) => isPathTo(callee, suffix))) {
      found.push(mechanism(
        'config_driven',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'the program reads its environment, so behaviour depends on a configuration no source states',
      ));
      return;
    }
    if (REFLECTION_CALL_SUFFIXES.some((suffix) => isPathTo(callee, suffix))) {
      found.push(mechanism(
        'reflection',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a type identity is recovered at run time, so which code runs is decided by the value rather than by the text',
      ));
    }
  });

  // One node can be reachable as two kinds — a foreign module item and its
  // extern modifier are the same declaration — so the identity of a mechanism
  // is its kind and location, and a repeat of that pair is the same evidence.
  const byIdentity = new Map();
  for (const item of found) {
    if (!byIdentity.has(item.id)) byIdentity.set(item.id, item);
  }
  return [...byIdentity.values()];
}

/**
 * The files the surface measurement attempts: in-scope, and of a known language.
 *
 * An unreadable entry stays in the population so that its attempt fails and
 * leaves a ledger row, rather than disappearing from the measurement without
 * anything recording that it was skipped.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function measuredFiles(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => syntaxLanguageOf(path) !== 'unknown')
    .sort(compareText);
}

// ---------------------------------------------------------------------------
// E6 — the mechanism forms each target language presents, and the detector that
// finds them
// ---------------------------------------------------------------------------

/** The callee of a call node, or null when the node is not a call. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function callTargetOf(node) {
  return node.type === 'call_expression' ? node.childForFieldName?.('function')?.text ?? null : null;
}

/** Every argument expression a call node carries. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function callArgumentsOf(node) {
  return node.type === 'call_expression' ? [...(node.childForFieldName?.('arguments')?.namedChildren ?? [])] : [];
}

/** Whether every argument of a call is a literal the reader can resolve. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function callIsComputed(node) {
  const argumentsInCall = callArgumentsOf(node);
  return argumentsInCall.length > 0 && argumentsInCall.every((argument) => argument.type !== 'string');
}

/** Whether an import path names a module the standard library or a runtime provides. */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function importNames(node, names) {
  const text = node.childForFieldName?.('path')?.text ?? node.childForFieldName?.('module_name')?.text ?? node.text;
  return names.some((name) => text.includes(name));
}

/**
 * The dynamic mechanisms one TypeScript or JavaScript file declares.
 *
 * The dynamic load is the construct these two languages share and the one the
 * representative carries: a `require` or `import()` whose specifier is a value
 * names no module, so the coupling it creates is real and unnameable. `Reflect`,
 * `eval` and `process.env` are declared because they are the same class of
 * entrance, and a class the representative does not exercise is recorded as
 * unverified rather than counted as absent.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function detectScriptMechanisms(language, tree, relativePath) {
  const found = [];
  walkNamed(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    const callee = callTargetOf(node);
    if (callee === 'import' || callee === 'require') {
      if (!callIsComputed(node)) return;
      found.push(mechanism(
        'runtime_loading',
        relativePath,
        line,
        node.text.split('\n')[0],
        `${callee}() with a specifier that is a value: which module arrives is decided while the program runs`,
      ));
      return;
    }
    if (callee === 'eval') {
      found.push(mechanism(
        'code_generation',
        relativePath,
        line,
        node.text.split('\n')[0],
        'eval() compiles text into code while the program runs, so the code that couples is not in this file',
      ));
      return;
    }
    if (callee !== null && callee.startsWith('Reflect.')) {
      found.push(mechanism(
        'reflection',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a property is reached by a name computed at run time, so the shape of the object is not in the text',
      ));
      return;
    }
    if (node.text.includes('process.env.') && node.type === 'member_expression') {
      found.push(mechanism(
        'config_driven',
        relativePath,
        line,
        node.text.split('\n')[0],
        'the program selects on its environment, so behaviour depends on a configuration no source states',
      ));
    }
  });
  return found;
}

/**
 * The dynamic mechanisms one Go file declares.
 *
 * A build constraint decides which of a package's declarations exist at all, and
 * an `init` function runs before anything names it — both are reachable code no
 * import names. `reflect`, cgo and interface values are declared as the forms
 * this reader looks for; the representative exercises the build constraint.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function detectGoMechanisms(language, tree, relativePath) {
  const found = [];
  walkNamed(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    if (node.type === 'comment' && /^\/\/go:build\b/.test(node.text)) {
      found.push(mechanism(
        'conditional_compilation',
        relativePath,
        line,
        node.text,
        'a build constraint decides whether this file exists in a given build, so a declaration here is a declaration in some builds only',
      ));
      return;
    }
    if (node.type === 'function_declaration' && node.childForFieldName?.('name')?.text === 'init') {
      found.push(mechanism(
        'runtime_registration',
        relativePath,
        line,
        node.text.split('\n')[0],
        'an init function runs before the program names it, so the registration it performs is invisible to an import graph',
      ));
      return;
    }
    if (node.type === 'import_spec' && importNames(node, ['"C"'])) {
      found.push(mechanism(
        'ffi',
        relativePath,
        line,
        node.text,
        'cgo leaves the Go type system, so no Go-side analysis constrains the other side of this call',
      ));
      return;
    }
    if (node.type === 'import_spec' && /reflect/.test(node.text)) {
      found.push(mechanism(
        'reflection',
        relativePath,
        line,
        node.text,
        'the reflect package reads a type at run time, so which code runs is decided by a value',
      ));
      return;
    }
    const callee = callTargetOf(node);
    if (callee !== null && callee.startsWith('reflect.')) {
      found.push(mechanism(
        'reflection',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a type or field is reached by a name decided at run time, so the call target is not in the text',
      ));
    }
  });
  return found;
}

/**
 * The dynamic mechanisms one Python file declares.
 *
 * `__getattr__` answers for names no body declares and a metaclass installs
 * attributes as the class statement runs; a decorator replaces the name the
 * `def` bound. Those three are the forms the representative carries, and they
 * are why a reader that lists declarations sees less than a caller can reach.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function detectPythonMechanisms(language, tree, relativePath) {
  const found = [];
  walkNamed(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    if (node.type === 'function_definition' && /^__(getattr|getattribute)__$/.test(node.childForFieldName?.('name')?.text ?? '')) {
      found.push(mechanism(
        'reflection',
        relativePath,
        line,
        node.text.split('\n')[0],
        'an attribute hook answers for names no statement in this file declares, so the attributes a consumer reaches are not in the body',
      ));
      return;
    }
    if (node.type === 'class_definition' && /metaclass\s*=/.test(node.childForFieldName?.('superclasses')?.text ?? '')) {
      found.push(mechanism(
        'runtime_registration',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a metaclass builds the class, so what the class carries is installed while the class statement runs',
      ));
      return;
    }
    if (node.type === 'decorator') {
      found.push(mechanism(
        'runtime_registration',
        relativePath,
        line,
        node.text,
        'a decorator replaces the name the definition bound, so the callable a caller reaches is not the one declared here',
      ));
      return;
    }
    if ((node.type === 'import_statement' || node.type === 'import_from_statement') && importNames(node, ['importlib'])) {
      found.push(mechanism(
        'runtime_loading',
        relativePath,
        line,
        node.text,
        'importlib resolves a module by a name computed at run time, so the module that arrives is not in the text',
      ));
      return;
    }
    if ((node.type === 'import_statement' || node.type === 'import_from_statement') && importNames(node, ['ctypes', 'cffi'])) {
      found.push(mechanism(
        'ffi',
        relativePath,
        line,
        node.text,
        'a foreign function interface leaves the type system, so no Python-side analysis constrains the other side',
      ));
      return;
    }
    const callee = callTargetOf(node);
    if (callee !== null && /^(os\.(environ\.get|getenv)|os\.environ\[)/.test(callee)) {
      found.push(mechanism(
        'config_driven',
        relativePath,
        line,
        node.text.split('\n')[0],
        'the program reads its environment, so behaviour depends on a configuration no source states',
      ));
    }
  });
  return found;
}

/**
 * The dynamic mechanisms one C or C++ file declares.
 *
 * The preprocessor decides what the compiler ever sees: a macro rewrites the
 * text, a conditional selects which lines exist, and an include composes
 * declarations from another file. A call through a dereferenced function
 * pointer names no function in the text, which is this language's dynamic
 * dispatch.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
function detectCStyleMechanisms(language, tree, relativePath) {
  const found = [];
  walkNamed(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    if (node.type === 'preproc_function_def' || node.type === 'preproc_def') {
      found.push(mechanism(
        'macro_expansion',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a macro rewrites the text before the compiler reads it, so the code that exists is not the code in this file',
      ));
      return;
    }
    if (node.type === 'preproc_if' || node.type === 'preproc_ifdef') {
      found.push(mechanism(
        'conditional_compilation',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a preprocessor condition selects which lines exist, so a fact about this file is a fact about a set of flags',
      ));
      return;
    }
    if (node.type === 'preproc_include') {
      found.push(mechanism(
        'compile_time_embedding',
        relativePath,
        line,
        node.text,
        'an include composes declarations from another file, so what this translation unit holds is written elsewhere',
      ));
      return;
    }
    const callee = callTargetOf(node);
    if (callee !== null && /^\(\s*\*/.test(callee)) {
      found.push(mechanism(
        'dynamic_dispatch',
        relativePath,
        line,
        node.text.split('\n')[0],
        'a call through a function pointer dispatches to whichever function the value holds, so the target is not in the text',
      ));
    }
  });
  return found;
}

/**
 * The mechanism forms each target language presents, and the detector that finds them.
 *
 * One frozen row per language, so `measureExecutionSurface` holds no branch on
 * the language and adding a seventh language is adding a row. `declared` is the
 * prediction `ABOUT-ANALYSIS-TECH.md` §2.3 asks to have verified — the classes
 * this instrument expects to find, each with the syntax marker that indicates it
 * — and `detect` is the reader that checks the prediction against a tree. The
 * two travel together so a language cannot declare a form nothing looks for.
 *
 * Rust's row keeps the detector its behaviour is pinned by; the other five read
 * the forms above. A class the representative does not exercise is recorded as
 * unverified rather than counted as absent, which is how the prediction is
 * checked rather than asserted.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export const DYNAMIC_MECHANISMS_BY_LANGUAGE = Object.freeze({
  rust: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'compile_time_embedding', markers: Object.freeze(['include_str!', 'include_bytes!', 'include!']), note: 'a build-time input becomes a dependency of this file' }),
      Object.freeze({ class: 'code_generation', markers: Object.freeze(['build.rs']), note: 'a build script writes source no import names' }),
      Object.freeze({ class: 'dynamic_dispatch', markers: Object.freeze(['dyn Trait']), note: 'a trait object dispatches to an implementation the compiler chooses' }),
      Object.freeze({ class: 'ffi', markers: Object.freeze(['extern "C"']), note: 'a foreign declaration leaves the type system' }),
      Object.freeze({ class: 'runtime_loading', markers: Object.freeze(['libloading', 'dlopen']), note: 'a library loaded by name is coupled to code the compiler never sees' }),
      Object.freeze({ class: 'config_driven', markers: Object.freeze(['env!', 'option_env!', 'env::var']), note: 'the program selects on its environment or build configuration' }),
      Object.freeze({ class: 'conditional_compilation', markers: Object.freeze(['#[cfg(']), note: 'a cfg attribute means the item exists only in some configurations' }),
      Object.freeze({ class: 'macro_expansion', markers: Object.freeze(['macro_rules!']), note: 'a macro rewrites the syntax tree before expansion' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['ctor']), note: 'a constructor registers itself before main runs' }),
      Object.freeze({ class: 'reflection', markers: Object.freeze(['TypeId::of', 'downcast_ref', 'downcast_mut', 'type_id']), note: 'a type identity is recovered at run time' }),
    ]),
    detect: (language, tree, relativePath, { uses }) => detectRustMechanisms(tree, relativePath, { uses }),
  }),
  typescript: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'runtime_loading', markers: Object.freeze(['import(expr)', 'require(expr)']), note: 'a computed specifier names a module the text does not' }),
      Object.freeze({ class: 'code_generation', markers: Object.freeze(['eval']), note: 'eval compiles text into code while the program runs' }),
      Object.freeze({ class: 'reflection', markers: Object.freeze(['Reflect.']), note: 'a property is reached by a name computed at run time' }),
      Object.freeze({ class: 'config_driven', markers: Object.freeze(['process.env']), note: 'the program selects on its environment' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['@Injectable', '@Component']), note: 'a decorator registers the declaration it is applied to' }),
    ]),
    detect: detectScriptMechanisms,
  }),
  javascript: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'runtime_loading', markers: Object.freeze(['require(expr)', 'import(expr)']), note: 'a computed specifier names a module the text does not' }),
      Object.freeze({ class: 'code_generation', markers: Object.freeze(['eval', 'new Function(']), note: 'text is compiled into code while the program runs' }),
      Object.freeze({ class: 'reflection', markers: Object.freeze(['Reflect.']), note: 'a property is reached by a name computed at run time' }),
      Object.freeze({ class: 'config_driven', markers: Object.freeze(['process.env']), note: 'the program selects on its environment' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['.prototype.']), note: 'a method attached after construction is not in the class body' }),
    ]),
    detect: detectScriptMechanisms,
  }),
  go: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'conditional_compilation', markers: Object.freeze(['//go:build']), note: 'a build constraint decides which declarations exist' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['func init()']), note: 'an init function runs before the program names it' }),
      Object.freeze({ class: 'ffi', markers: Object.freeze(['import "C"']), note: 'cgo leaves the Go type system' }),
      Object.freeze({ class: 'reflection', markers: Object.freeze(['reflect.']), note: 'the reflect package reads a type at run time' }),
      Object.freeze({ class: 'dynamic_dispatch', markers: Object.freeze(['interface {']), note: 'an interface value dispatches to the method its dynamic type holds' }),
      Object.freeze({ class: 'config_driven', markers: Object.freeze(['os.Getenv', 'flag.']), note: 'the program selects on its environment or flags' }),
    ]),
    detect: detectGoMechanisms,
  }),
  python: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'reflection', markers: Object.freeze(['def __getattr__', 'def __getattribute__']), note: 'an attribute hook answers for names no body declares' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['metaclass=', '@decorator']), note: 'a metaclass or decorator installs what the declaration does not write' }),
      Object.freeze({ class: 'runtime_loading', markers: Object.freeze(['importlib']), note: 'a module is resolved by a name computed at run time' }),
      Object.freeze({ class: 'ffi', markers: Object.freeze(['ctypes', 'cffi']), note: 'a foreign function interface leaves the type system' }),
      Object.freeze({ class: 'config_driven', markers: Object.freeze(['os.environ', 'os.getenv']), note: 'the program selects on its environment' }),
      Object.freeze({ class: 'code_generation', markers: Object.freeze(['exec(', 'eval(']), note: 'text is compiled into code while the program runs' }),
    ]),
    detect: detectPythonMechanisms,
  }),
  c_cpp: Object.freeze({
    declared: Object.freeze([
      Object.freeze({ class: 'macro_expansion', markers: Object.freeze(['#define']), note: 'a macro rewrites the text before the compiler reads it' }),
      Object.freeze({ class: 'conditional_compilation', markers: Object.freeze(['#if', '#ifdef', '#ifndef']), note: 'a preprocessor condition selects which lines exist' }),
      Object.freeze({ class: 'compile_time_embedding', markers: Object.freeze(['#include']), note: 'an include composes declarations from another file' }),
      Object.freeze({ class: 'dynamic_dispatch', markers: Object.freeze(['(*fn)(']), note: 'a call through a function pointer names no function in the text' }),
      Object.freeze({ class: 'runtime_loading', markers: Object.freeze(['dlopen', 'dlsym']), note: 'a library loaded by name is coupled to code the compiler never sees' }),
      Object.freeze({ class: 'runtime_registration', markers: Object.freeze(['__attribute__((constructor))']), note: 'a constructor runs before main is entered' }),
    ]),
    detect: detectCStyleMechanisms,
  }),
});

/**
 * Refuse a mechanism class the vocabulary does not declare.
 *
 * A second language's extractor that introduced a class by accident would put a
 * kind into the surface that the channel has no construct for, and the channel
 * would report it as unmatched for a reason that names the wrong fault. The
 * refusal happens where the mechanism is built rather than where it is read, so
 * the name travels with the throw.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function assertDeclaredMechanismClass(kind) {
  if (!MECHANISM_KINDS.includes(kind)) {
    throw new Error(
      `"${kind}" is not a mechanism class this instrument declares; the closed vocabulary is ${MECHANISM_KINDS.join(', ')}`,
    );
  }
  return kind;
}

/**
 * Every dynamic mechanism one file declares, as the language under measurement writes it.
 *
 * The per-file `uses` are what Rust's detector reads to spot a crate that loads
 * a library by name; the other five read the tree alone, so the argument is
 * named rather than defaulted for each of them.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function collectDynamicMechanisms(language, tree, relativePath, { uses = [] } = {}) {
  const row = DYNAMIC_MECHANISMS_BY_LANGUAGE[language];
  if (row === undefined) {
    throw new Error(`${language} declares no mechanism inventory, so no mechanism can be read from ${relativePath}`);
  }
  const found = row.detect(language, tree, relativePath, { uses });
  // The language travels on the site, so a consumer can say which language's
  // graph a mechanism qualifies. A tree can hold two, and a total that blended
  // them would leave a reader unable to tell which one it was reading about.
  return found.map((site) => {
    assertDeclaredMechanismClass(site.kind);
    return { ...site, language };
  });
}

/**
 * Which of a language's declared mechanism classes were observed, and which were not.
 *
 * The union of the two lists is the declared set, so the prediction is checked
 * against the tree rather than asserted: a class the representative does not
 * exercise is reported as unverified, and rendering it as a zero would claim a
 * verification that did not happen. The two lists are disjoint, so no class is
 * counted twice.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function verifyMechanismInventory(language, mechanisms, { inventory = DYNAMIC_MECHANISMS_BY_LANGUAGE } = {}) {
  const row = inventory[language];
  if (row === undefined) {
    throw new Error(`${language} declares no mechanism inventory, so nothing can be verified against it`);
  }
  const declared = row.declared ?? row;
  const observedClasses = [...new Set(mechanisms.map((site) => site.kind))].sort(compareText);
  for (const kind of observedClasses) assertDeclaredMechanismClass(kind);

  const observed = new Set(observedClasses);
  return {
    language,
    declaredClasses: [...new Set(declared.map((entry) => entry.class))].sort(compareText),
    observedClasses,
    unverifiedClasses: declared
      .filter((entry) => !observed.has(entry.class))
      .map((entry) => ({ language, class: entry.class, markers: [...entry.markers] }))
      .sort((left, right) => compareText(left.class, right.class)),
  };
}

/**
 * R2.5 — the execution surface.
 *
 * @param {{root: string, excludedPaths?: string[], grammar?: object|null}} params
 */
export function measureExecutionSurface({ root, excludedPaths = [], grammar } = {}) {
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
  const coverage = emptyCoverage();
  const attempts = [];
  const limitations = [];
  const mechanisms = [];

  const files = measuredFiles(root, excludedPaths);
  coverage.files_discovered = files.length;

  const extractedByLanguage = new Map();

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    if (!LANGUAGES_WITH_EXTRACTORS.E6.includes(language)) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'skipped',
          extractedCount: 0,
          reason: NO_MECHANISM_EXTRACTOR_REASON,
        },
      }));
      continue;
    }

    const parsed = parseSourceFile(root, file, { grammar });
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'failed',
          diagnostics: [{ severity: 'error', message: parsed.message }],
          extractedCount: 0,
          reason: parsed.reason,
        },
      }));
      continue;
    }

    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    const fileMechanisms = collectDynamicMechanisms(language, parsed.tree, file, {
      uses: collectRustUses(parsed.tree, file),
    });
    const recovery = parsed.errorNodes ? syntaxRecoveryDiagnostic(parsed.tree) : null;
    if (recovery !== null) {
      limitations.push({
        code: 'SURFACE_PARTIAL_ON_PARSE_ERROR',
        scope: file,
        effect: `${recovery.message}. Mechanisms inside the recovered region may not have been detected, `
          + 'so an absent mechanism here is a limit of the pinned grammar rather than a fact about the file',
      });
    }

    mechanisms.push(...fileMechanisms);
    extractedByLanguage.set(language, [...(extractedByLanguage.get(language) ?? []), ...fileMechanisms]);
    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: `tree-sitter-${language}`,
      outcome: {
        phase: 'parse',
        // The same rule structure.mjs and dependencies.mjs record: a parse the
        // grammar had to recover from is one that could not run, not one that
        // found nothing.
        status: parsed.errorNodes ? 'failed' : 'success',
        diagnostics: recovery === null ? [] : [recovery],
        extractedCount: fileMechanisms.length,
        reason: parsed.errorNodes ? 'grammar_recovered' : null,
      },
    }));
  }

  // A language the syntax layer reaches but this instrument enumerates no
  // mechanisms for is named, so an empty surface for it means "not examined"
  // rather than "nothing there". The six are never in this set: their
  // inventories are declared and their files are read.
  const unextractedLanguages = new Set(
    files.map(syntaxLanguageOf).filter((language) => !LANGUAGES_WITH_EXTRACTORS.E6.includes(language)),
  );
  for (const language of [...unextractedLanguages].sort(compareText)) {
    limitations.push({
      code: 'EXTRACTOR_NOT_WRITTEN',
      scope: `**/*.${language}`,
      effect: `${language} is reachable by the syntax layer but this instrument version enumerates no mechanisms for it, so an empty surface for those files means they were not examined for one`,
    });
  }

  return assertAdapterResult({
    analysis_mode: ANALYSIS_MODES[0],
    coverage: { ...coverage, files_semantically_resolved: 0 },
    limitations,
    mechanisms: mechanisms.sort((left, right) => compareText(left.id, right.id)),
    // The declared inventory checked against this tree, per language. A class
    // this run did not observe is recorded as unverified rather than counted as
    // absent: the design asks for its prediction to be verified, and a row that
    // was not verified is the record of that.
    mechanismInventory: Object.fromEntries(
      [...extractedByLanguage.entries()]
        .map(([language, sites]) => [language, verifyMechanismInventory(language, sites)]),
    ),
    presence_not_absence: PRESENCE_NOT_ABSENCE,
    attempts,
  });
}

/**
 * Classify a proposition, refusing `observed` when a dynamic mechanism is in play.
 *
 * This is rule R-1 made mechanical. A proposition that touches a listed
 * mechanism may not be called `observed` on source evidence alone, because the
 * source does not determine which implementation runs: it is demoted to
 * `inferred`, which is the classification that asks a human to weigh it.
 *
 * A proposition touching no mechanism, and supported by at least one piece of
 * evidence, may be `observed` from the source text — that is what the static
 * half of the design is for.
 *
 * @param {{proposition: {mechanisms?: string[]}, evidence: Array<{evidence_mode: string}>, surface?: object|null}} params
 * @returns {{classification: string, reason: string}}
 */
export function classifyWithDynamicEvidence({ proposition, evidence = [], surface = null }) {
  const touched = proposition?.mechanisms ?? [];
  const dynamicEvidence = evidence.filter((item) => item.evidence_mode !== EVIDENCE_MODES[0]);

  if (touched.length > 0 && dynamicEvidence.length === 0) {
    const known = new Map((surface?.mechanisms ?? []).map((item) => [item.id, item]));
    const named = touched
      .map((id) => known.get(id))
      .filter((item) => item !== undefined)
      .map((item) => `${item.kind} at ${item.file}:${item.line}`);
    const where = named.length > 0 ? ` (${named.join('; ')})` : '';
    return {
      classification: 'inferred',
      reason: `the proposition touches ${touched.length} dynamic mechanism(s)${where}, and no dynamic evidence exists for it — `
        + 'the source does not determine which implementation runs, so observed is refused and the proposition is handed to a human to weigh',
    };
  }

  if (evidence.length === 0) {
    return {
      classification: 'unresolved',
      reason: 'no evidence was supplied, so there is nothing to observe the proposition from',
    };
  }

  return {
    classification: 'observed',
    reason: touched.length === 0
      ? 'the proposition touches no dynamic mechanism and is supported by evidence read from the source'
      : `the proposition touches a dynamic mechanism and is supported by ${dynamicEvidence.length} piece(s) of dynamic evidence`,
  };
}

/** The execution surface report, as Markdown for a reader rather than JSON for a machine. */
export function renderExecutionSurfaceReport(surface) {
  const byKind = new Map();
  for (const item of surface.mechanisms) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }

  const lines = [
    '# R2.5 — the execution surface',
    '',
    `Analysis mode: \`${surface.analysis_mode}\`.`,
    '',
    `> ${surface.presence_not_absence}`,
    '',
    '## What was found',
    '',
    '| Mechanism kind | Count |',
    '|---|---|',
    ...[...byKind.entries()]
      .sort((left, right) => compareText(left[0], right[0]))
      .map(([kind, items]) => `| \`${kind}\` | ${items.length} |`),
    '',
    '## Every mechanism, with its location',
    '',
    ...renderCappedList(
      surface.mechanisms,
      (item) => `- \`${item.kind}\` — \`${item.file}:${item.line}\` — \`${item.spelling}\`\n  - ${item.note}`,
    ),
    '',
    'Every mechanism above is a place where the import graph and the running program can disagree.',
    'A proposition touching one of them may not be classified `observed` without dynamic evidence (R-1).',
    '',
    '## Limitations',
    '',
    ...renderCappedList(
      surface.limitations,
      (limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
