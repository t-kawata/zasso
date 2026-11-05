/**
 * The Rust surface a package RFC declares and uses.
 *
 * The RFC is the only place a cross-package signature exists. The graph carries nodes and
 * contracts, not parameter counts or generic arity, so a gate that proves two packages
 * agree has to read the code fences as declarations and uses. This parser reads the
 * subset the pipeline writes: structs, traits, enums, type aliases, functions, constants
 * and inherent impl methods. A construct outside that subset is reported, never skipped:
 * a silent skip would make the gate pass over exactly the defect it cannot see.
 */

/** The declarations a fence may open. */
const DECLARATION_KEYWORD = /^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|trait|enum|type|const|static)\s+([A-Za-z_]\w*)\s*(<[^>{]*>)?/;

/**
 * A free function, an inherent method, a trait method or an associated function.
 *
 * Rust writes the same `fn` under modifiers the earlier line-anchored pattern did not
 * accept. A declaration the parser cannot see is a declaration the gate reports as
 * missing, so the modifiers are part of the declaration shape rather than noise.
 */
const FUNCTION_START = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:(?:const|async|unsafe)\s+)*(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/;

/** The start of any declaration form, used only to report an unparsed shape. */
const DECLARATION_START = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:(?:const|async|unsafe)\s+)*(?:extern\s+"[^"]*"\s+)?(?:struct|trait|enum|type|const|static|fn|impl)\b/;

/** An impl block, with or without a trait. */
const IMPL_LINE = /^\s*impl(?:<[^>]*>)?\s+(?:[\w:]+\s+for\s+)?([A-Za-z_]\w*)/;

/** A type used with generic arguments, or a bare capitalised identifier. */
const TYPE_USE = /\b([A-Z]\w*)\s*(?:<([^<>]*(?:<[^<>]*>[^<>]*)*)>)?/g;

/**
 * A free call or an associated-function path, but not a method call.
 *
 * A method call names no package: `value.clone()` could be `Clone::clone` or an
 * inherent method on a type this parser does not infer. Treating the bare method
 * name as a cross-package symbol made every `.len()`, `.get()` and `.clone()` a
 * missing declaration. The receiver is the missing fact, and this parser does not
 * have it, so the method call is left to the type checker rather than guessed here.
 */
const PATH_CALL_USE = /(?<!\.)\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)?)\s*\(/g;

/** An attribute line, including `#[derive(...)]` and the inner `#![...]` form. */
const ATTRIBUTE_LINE = /^\s*#!?\[/;

/** The receiver forms that are not call arguments. */
const SELF_PARAMETER = /^(?:&\s*)?(?:mut\s+)?self(?:\s*:.*)?$/;

/** The names Rust, the standard library and Cargo supply, which are not workspace symbols. */
const BUILTIN_SYMBOLS = new Set([
  'String', 'Vec', 'Option', 'Result', 'Box', 'HashMap', 'HashSet', 'BTreeMap', 'BTreeSet',
  'VecDeque', 'Arc', 'Rc', 'RefCell', 'Cell', 'Cow', 'Path', 'PathBuf', 'Duration', 'SystemTime',
  'Instant', 'Regex', 'Uuid', 'Ordering', 'Self', 'Ok', 'Err', 'Some', 'None', 'Default',
  'Clone', 'Copy', 'Debug', 'Display', 'Error', 'Send', 'Sync', 'Sized', 'Iterator',
  'PartialEq', 'Eq', 'PartialOrd', 'Ord', 'Hash',
  'Into', 'From', 'TryFrom', 'AsRef', 'AsMut', 'Serialize', 'Deserialize', 'ToString',
  'FromStr', 'TryInto', 'IntoIterator', 'ExactSizeIterator', 'DoubleEndedIterator',
  'Mutex', 'RwLock', 'MutexGuard', 'RwLockReadGuard', 'RwLockWriteGuard', 'PhantomData',
  'NonNull', 'Pin', 'Waker', 'Context', 'Poll', 'Future', 'Stream', 'Sink', 'File',
  'Read', 'Write', 'BufRead', 'BufReader', 'BufWriter', 'OsString', 'OsStr', 'CString',
  'CStr', 'IpAddr', 'SocketAddr', 'TcpListener', 'TcpStream', 'UdpSocket', 'JoinHandle',
  'Thread', 'ThreadId', 'AtomicBool', 'AtomicUsize', 'AtomicIsize', 'AtomicU8', 'AtomicU16',
  'AtomicU32', 'AtomicU64', 'AtomicI8', 'AtomicI16', 'AtomicI32', 'AtomicI64', 'Formatter',
  'Arguments', 'CARGO_PKG_VERSION', 'CARGO_PKG_NAME', 'CARGO_PKG_AUTHORS',
  'CARGO_PKG_DESCRIPTION', 'CARGO_PKG_HOMEPAGE', 'CARGO_PKG_REPOSITORY', 'CARGO_PKG_LICENSE',
  'CARGO_PKG_RUST_VERSION', 'CARGO_MANIFEST_DIR',
]);

/** The words that look like calls but are language constructs. */
const KEYWORD_CALLS = new Set([
  'if', 'for', 'while', 'match', 'loop', 'return', 'fn', 'let', 'impl', 'trait', 'struct',
  'enum', 'type', 'const', 'static', 'pub', 'use', 'mod', 'where', 'as', 'move', 'async',
  'await', 'unsafe', 'extern', 'crate', 'self', 'super',
]);

const FENCE_OPEN = /^\s*```rust\b/;
const FENCE_CLOSE = /^\s*```\s*$/;

/** Split a comma-separated list at the top level, respecting nested brackets. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of String(text ?? '')) {
    if (character === '<' || character === '(' || character === '[') depth += 1;
    if (character === '>' || character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Replace string literals and line comments with spaces, preserving column positions. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function stripNonCode(line) {
  const withoutStrings = String(line).replace(/"(?:\\.|[^"\\])*"/g, (match) => ' '.repeat(match.length));
  return withoutStrings.replace(/\/\/.*$/, (match) => ' '.repeat(match.length));
}

/** The arity of a generic list, or 0 when there is none. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function genericArity(genericText) {
  if (typeof genericText !== 'string' || genericText.trim().length === 0) return 0;
  return splitTopLevel(genericText.replace(/^</, '').replace(/>$/, '')).length;
}

/**
 * The arity of a parameter list, with a receiver excluded.
 *
 * `&self` is the method's receiver, not an argument the caller supplies. Counting it
 * made a one-argument method look like a two-argument function, so every associated
 * call was off by one. The receiver is dropped here rather than at the call site
 * because the declaration is where the fact is stated.
 */
// [::TICKET::] PX-369, PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-371) --for-spec --no-implementation-order`.
function parameterCountOf(parameterText) {
  return splitTopLevel(parameterText).filter((parameter) => !SELF_PARAMETER.test(parameter)).length;
}

/** The generic parameter names a `<...>` list declares. */
// [::TICKET::] PX-369, PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-372) --for-spec --no-implementation-order`.
function genericParameterNames(genericText) {
  if (typeof genericText !== 'string' || genericText.trim().length === 0) return [];
  return splitTopLevel(genericText.replace(/^</, '').replace(/>$/, ''))
    .map((entry) => entry.replace(/^(?:const|type)\s+/, '').split(':')[0].trim())
    .filter((entry) => /^[A-Za-z_]\w*$/.test(entry));
}

/** The field names a braced body declares, at its top level. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function fieldNames(bodyLines) {
  const names = [];
  for (const line of bodyLines) {
    const match = /^\s*(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_]\w*)\s*:/.exec(line);
    if (match !== null) names.push(match[1]);
  }
  return names;
}

/**
 * The variant names an enum body declares.
 *
 * A variant is a value the workspace can name (`PortResult::Ok`), not a type the
 * workspace should have declared. Reading it as an undefined type made every enum
 * result look like a missing cross-package symbol.
 */
// [::TICKET::] PX-371, PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-371|PX-372) --for-spec --no-implementation-order`.
function enumVariantNames(bodyLines) {
  const names = [];
  for (const line of bodyLines) {
    if (/^\s*#/.test(line) || /^\s*\/\//.test(line)) continue;
    for (const match of line.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*(?:\(|\{|,|$)/g)) names.push(match[1]);
  }
  return [...new Set(names)];
}

/** The brace depth change a line makes. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function braceDelta(line) {
  const opens = (line.match(/{/g) ?? []).length;
  const closes = (line.match(/}/g) ?? []).length;
  return opens - closes;
}

/** The body lines and the index of the closing line. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function readBody(lines, startIndex, openLine) {
  const body = [];
  let depth = braceDelta(openLine);
  if (depth <= 0) return { body, nextIndex: startIndex };
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    depth += braceDelta(line);
    if (depth <= 0) return { body, nextIndex: index };
    body.push(line);
  }
  return { body, nextIndex: lines.length - 1 };
}

/** The first occurrence of one character at or after a position. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function findCharacter(lines, startIndex, startColumn, target) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const code = stripNonCode(lines[index]);
    const from = index === startIndex ? startColumn : 0;
    const column = code.indexOf(target, from);
    if (column !== -1) return { index, column };
  }
  return null;
}

/**
 * Read one balanced delimiter pair across lines.
 *
 * A signature or a call may put its closing delimiter on a later line. Reading only
 * the opening line counted a three-parameter function as zero and a three-argument
 * call as zero, which is exactly the arity defect the gate reports. The reader
 * returns the text inside the pair and the position of the closing delimiter.
 *
 * @returns {{ innerText: string|null, endIndex: number, endColumn: number }}
 */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function readBalanced(lines, startIndex, startColumn, open = '(', close = ')') {
  let depth = 0;
  const parts = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const code = stripNonCode(lines[index]);
    let current = '';
    const from = index === startIndex ? startColumn : 0;
    for (let column = from; column < code.length; column += 1) {
      const character = code[column];
      if (character === open) {
        depth += 1;
        if (depth === 1) continue;
      }
      if (character === close) {
        depth -= 1;
        if (depth === 0) {
          return { innerText: `${parts.join('\n')}${current}`, endIndex: index, endColumn: column };
        }
      }
      if (depth > 0) current += character;
    }
    if (depth > 0) {
      parts.push(current);
      parts.push('\n');
    }
  }
  return { innerText: null, endIndex: lines.length - 1, endColumn: 0 };
}

/** Whether a call at this position is part of a declaration signature. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function isInsideSignature(signatureSpans, index, column) {
  return signatureSpans.some((span) => {
    if (index < span.startIndex || index > span.endIndex) return false;
    if (index === span.endIndex && column > span.endColumn) return false;
    return true;
  });
}

/** Read a function signature and the position of its closing parenthesis. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function readFunctionSignature(lines, startIndex, nameEndColumn) {
  const open = findCharacter(lines, startIndex, nameEndColumn, '(');
  if (open === null) return null;
  const parameters = readBalanced(lines, open.index, open.column);
  if (parameters.innerText === null) return null;

  const genericOpen = findCharacter(lines, startIndex, nameEndColumn, '<');
  const generic = genericOpen !== null && genericOpen.index <= open.index
    ? readBalanced(lines, genericOpen.index, genericOpen.column, '<', '>')
    : { innerText: '' };

  return {
    parameterText: parameters.innerText,
    genericText: generic.innerText ?? '',
    endIndex: parameters.endIndex,
    endColumn: parameters.endColumn,
  };
}

/**
 * Read one Rust fence into declarations, references and unparsed constructs.
 *
 * @param {string[]} lines — the fence body, without the fence markers
 * @param {number} firstLine — the RFC line number of the first body line
 * @param {{ packageId: string, rfcPath: string }} origin
 * @returns {{ declarations: object[], references: object[], unparsed: object[] }}
 */
// [::TICKET::] PX-369, PX-371, PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-371|PX-372) --for-spec --no-implementation-order`.
function parseFence(lines, firstLine, origin) {
  const declarations = [];
  const references = [];
  const unparsed = [];
  const declaredOnLine = new Map();
  const skippedLines = new Set();
  const typeDeclarationLines = new Set();
  const declaredCallNames = new Set();
  const declaredTypeNames = new Set();
  const variantNames = new Set();
  const genericParameters = new Set();
  const signatureSpans = [];
  const unparsedDeclarationLines = new Set();
  let implementationType = null;
  let implementationDepth = 0;
  let traitName = null;
  let traitDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = firstLine + index;
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('//')) continue;
    // An attribute names a macro or a derive, not a workspace symbol. Reading
    // `#[derive(Debug, Clone)]` as calls is what made `derive`, `Clone` and `Eq`
    // look like cross-package references nobody declared.
    if (ATTRIBUTE_LINE.test(trimmed)) continue;
    if (/macro_rules!/.test(line)) {
      unparsed.push({ line: lineNumber, reason: 'macro_rules! is outside the declared surface subset' });
      continue;
    }

    // The trait's own body is read line by line so its method signatures become
    // declarations. The closing brace clears the context before the line is read.
    if (traitDepth > 0) {
      traitDepth += braceDelta(line);
      if (traitDepth <= 0) traitName = null;
    }

    if (trimmed.startsWith('impl')) {
      const match = IMPL_LINE.exec(line);
      if (match === null) {
        unparsed.push({ line: lineNumber, reason: 'impl block could not be read' });
        unparsedDeclarationLines.add(index);
        continue;
      }
      const implGenerics = /^\s*impl\s*<([^>]*)>/.exec(line);
      if (implGenerics !== null) {
        for (const parameter of genericParameterNames(`<${implGenerics[1]}>`)) genericParameters.add(parameter);
      }
      implementationType = match[1];
      implementationDepth = braceDelta(line);
      if (implementationDepth <= 0) {
        // A one-line impl: read the methods between its braces on this same line.
        const open = line.indexOf('{');
        const close = line.lastIndexOf('}');
        if (open !== -1 && close > open) {
          const inline = line.slice(open + 1, close);
          for (const method of inline.matchAll(/(?:const\s+|async\s+|unsafe\s+)*fn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g)) {
            declaredCallNames.add(`${index}:${method[1]}`);
            declarations.push({
              symbol: `${implementationType}::${method[1]}`,
              kind: 'fn',
              genericArity: 0,
              parameterCount: parameterCountOf(method[2]),
              fields: [],
              packageId: origin.packageId,
              rfcPath: origin.rfcPath,
              line: lineNumber,
            });
          }
        }
        implementationType = null;
      }
      continue;
    }

    if (implementationType !== null) {
      implementationDepth += braceDelta(line);
      if (implementationDepth <= 0) implementationType = null;
    }

    const fnMatch = FUNCTION_START.exec(stripNonCode(line));
    if (fnMatch !== null) {
      const name = fnMatch[1];
      const signature = readFunctionSignature(lines, index, fnMatch.index + fnMatch[0].length);
      if (signature === null) {
        unparsed.push({ line: lineNumber, reason: 'declaration shape could not be read' });
        unparsedDeclarationLines.add(index);
        continue;
      }
      for (const parameter of genericParameterNames(signature.genericText)) genericParameters.add(parameter);
      const prefix = implementationType ?? traitName;
      const symbol = prefix === null ? name : `${prefix}::${name}`;
      declarations.push({
        symbol,
        kind: 'fn',
        genericArity: genericArity(signature.genericText),
        parameterCount: parameterCountOf(signature.parameterText),
        fields: [],
        packageId: origin.packageId,
        rfcPath: origin.rfcPath,
        line: lineNumber,
      });
      signatureSpans.push({
        startIndex: index,
        endIndex: signature.endIndex,
        startColumn: 0,
        endColumn: signature.endColumn,
      });
      declaredOnLine.set(index, name);
      declaredCallNames.add(`${index}:${name}`);
      continue;
    }

    const declaration = DECLARATION_KEYWORD.exec(line);
    if (declaration !== null) {
      const [, keyword, symbol, genericText] = declaration;
      if ((keyword === 'const' || keyword === 'static') && symbol === 'fn') {
        unparsed.push({ line: lineNumber, reason: 'declaration shape could not be read' });
        unparsedDeclarationLines.add(index);
        continue;
      }
      const { body, nextIndex } = readBody(lines, index, line);
      const inlineOpen = line.indexOf('{');
      const inlineClose = line.lastIndexOf('}');
      const inlineBody = inlineOpen !== -1 && inlineClose > inlineOpen ? [line.slice(inlineOpen + 1, inlineClose)] : [];
      if (keyword !== 'trait') {
        for (let bodyIndex = index + 1; bodyIndex <= nextIndex; bodyIndex += 1) skippedLines.add(bodyIndex);
      }
      for (const parameter of genericParameterNames(genericText)) genericParameters.add(parameter);
      declarations.push({
        symbol,
        kind: keyword,
        genericArity: genericArity(genericText),
        parameterCount: 0,
        fields: keyword === 'struct' || keyword === 'trait' || keyword === 'enum' ? fieldNames([...inlineBody, ...body]) : [],
        packageId: origin.packageId,
        rfcPath: origin.rfcPath,
        line: lineNumber,
      });
      if (keyword === 'struct' || keyword === 'trait' || keyword === 'enum' || keyword === 'type') {
        declaredTypeNames.add(symbol);
      }
      if (keyword === 'enum') {
        for (const variant of enumVariantNames([...inlineBody, ...body])) {
          variantNames.add(variant);
          declarations.push({
            symbol: `${symbol}::${variant}`,
            kind: 'variant',
            genericArity: 0,
            parameterCount: 0,
            fields: [],
            packageId: origin.packageId,
            rfcPath: origin.rfcPath,
            line: lineNumber,
          });
        }
      }
      declaredOnLine.set(index, symbol);
      typeDeclarationLines.add(index);
      if (keyword === 'trait') {
        traitName = symbol;
        traitDepth = braceDelta(line);
        if (traitDepth <= 0) {
          // A one-line trait: read the methods between its braces on this same line.
          const open = inlineOpen;
          const close = inlineClose;
          if (open !== -1 && close > open) {
            const inline = line.slice(open + 1, close);
            for (const method of inline.matchAll(/(?:const\s+|async\s+|unsafe\s+)*fn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g)) {
              declaredCallNames.add(`${index}:${method[1]}`);
              declarations.push({
                symbol: `${symbol}::${method[1]}`,
                kind: 'fn',
                genericArity: 0,
                parameterCount: parameterCountOf(method[2]),
                fields: [],
                packageId: origin.packageId,
                rfcPath: origin.rfcPath,
                line: lineNumber,
              });
            }
          }
          traitName = null;
        }
      } else {
        index = nextIndex;
      }
      continue;
    }

    if (DECLARATION_START.test(stripNonCode(line))) {
      unparsed.push({ line: lineNumber, reason: 'declaration shape could not be read' });
      unparsedDeclarationLines.add(index);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = firstLine + index;
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('//') || skippedLines.has(index)) continue;
    // Attributes were skipped by the declaration pass; they must be skipped here too,
    // or `#[derive(Debug, Clone)]` comes back as a call to `derive` and two type uses.
    if (ATTRIBUTE_LINE.test(trimmed)) continue;
    // A path or a message inside a string literal is prose, not a symbol. Stripping
    // the literals keeps `"RFC-SEED.md"` and `"Cargo.toml"` out of the type pass.
    const code = stripNonCode(line);
    const declaredHere = declaredOnLine.get(index);
    // A bare callee is a constructor or a routine, not a type use. The type
    // pattern sees the capitalised callee in a constructor expression and would
    // otherwise report the same name twice: once as an unresolved call and once as
    // an unresolved type.
    const bareCallsOnLine = new Set(
      [...code.matchAll(PATH_CALL_USE)]
        .map((match) => match[1])
        .filter((symbol) => !symbol.includes('::')),
    );

    for (const match of code.matchAll(TYPE_USE)) {
      const symbol = match[1];
      if (BUILTIN_SYMBOLS.has(symbol) || genericParameters.has(symbol) || symbol === declaredHere) continue;
      // A one-letter capital is a generic parameter written in a fence whose
      // declaration the parser did not read (a `where` clause, an associated type).
      // It is not a workspace type; a package does not name a type `T`.
      if (/^[A-Z]$/.test(symbol) && !declaredTypeNames.has(symbol)) continue;
      if (bareCallsOnLine.has(symbol)) continue;
      // The right half of `Type::Variant` is a variant, not a type the workspace
      // must declare; the left half is checked on its own match.
      const matchStart = match.index ?? 0;
      if (code.slice(Math.max(0, matchStart - 2), matchStart) === '::') continue;
      // A bare variant name is a value, not a type. A name the fence also declares
      // as a type keeps its type reference.
      if (variantNames.has(symbol) && !declaredTypeNames.has(symbol)) continue;
      references.push({
        symbol,
        kind: 'type',
        genericArity: genericArity(match[2]),
        argumentCount: null,
        packageId: origin.packageId,
        rfcPath: origin.rfcPath,
        line: lineNumber,
      });
    }

    // A struct, enum or type declaration holds types, never call expressions.
    if (typeDeclarationLines.has(index)) continue;
    for (const match of code.matchAll(PATH_CALL_USE)) {
      const symbol = match[1];
      const matchColumn = match.index ?? 0;
      if (KEYWORD_CALLS.has(symbol) || BUILTIN_SYMBOLS.has(symbol)) continue;
      // A declaration's own signature is not a call. This is the difference between
      // `pub fn admit(` and a call to `admit`: the opening line of a multi-line
      // signature used to become a zero-argument call against another package's
      // declaration.
      if (isInsideSignature(signatureSpans, index, matchColumn)) continue;
      if (unparsedDeclarationLines.has(index) && !code.slice(0, matchColumn).includes('{')) continue;
      // The signature's own name is a declaration, not a call; a call in the same
      // line's body still counts.
      if (declaredCallNames.has(`${index}:${symbol}`)) continue;
      // `Self::method` is the implementation's own surface, not a cross-package name.
      if (symbol.startsWith('Self::')) continue;
      // `Vec::with_capacity` is a standard-library associated routine. The standard
      // library declares it, not a workspace package.
      if (symbol.includes('::') && BUILTIN_SYMBOLS.has(symbol.split('::')[0])) continue;
      const openIndex = matchColumn + match[0].length - 1;
      const callArguments = readBalanced(lines, index, openIndex);
      references.push({
        symbol,
        kind: 'call',
        genericArity: 0,
        argumentCount: callArguments.innerText === null ? 0 : splitTopLevel(callArguments.innerText).length,
        packageId: origin.packageId,
        rfcPath: origin.rfcPath,
        line: lineNumber,
      });
    }
  }

  return { declarations, references, unparsed };
}

/**
 * Read every Rust fence in one RFC.
 *
 * @param {{ rfcText: string, packageId: string, rfcPath?: string }} input
 * @returns {{ declarations: object[], references: object[], unparsed: object[] }}
 */
export function parseRustSurface({ rfcText, packageId, rfcPath = '' } = {}) {
  const lines = String(rfcText ?? '').split('\n');
  const declarations = [];
  const references = [];
  const unparsed = [];
  const origin = { packageId, rfcPath };

  for (let index = 0; index < lines.length; index += 1) {
    if (!FENCE_OPEN.test(lines[index])) continue;
    const bodyStart = index + 1;
    let bodyEnd = bodyStart;
    while (bodyEnd < lines.length && !FENCE_CLOSE.test(lines[bodyEnd])) bodyEnd += 1;
    const parsed = parseFence(lines.slice(bodyStart, bodyEnd), bodyStart + 1, origin);
    declarations.push(...parsed.declarations);
    references.push(...parsed.references);
    unparsed.push(...parsed.unparsed.map((entry) => ({ ...entry, packageId, rfcPath })));
    index = bodyEnd;
  }

  return { declarations, references, unparsed };
}
