# Node.js Rules for everything-claude-code

> Project-specific rules for the ECC codebase. Extends common rules.

## Stack

- **Runtime**: the floor is declared once, in the `engines` field of `package.json`. Nothing here restates it: a second copy is a second thing to drift, and this file carried `>=18` while the toolchain in use was 26.
- **Test runner**: `make test`, or `node tests/run-all-surfaces.mjs` directly. It discovers and runs every test file beneath `.claude/tests/` and `tests/`, and reports any file it could not run by name. Individual files run with `node <file>` for the `.claude/tests` harness or `node --test <files>` for the `*.test.{js,cjs,mjs}` suites. **A directory is never passed to `node --test`** — on Node 26 it resolves as a module and the run fails.
- **Linter**: ESLint (`@eslint/js`, flat config)
- **Coverage**: c8
- **Lint**: markdownlint-cli for `.md` files

## Module System by Directory

The authority is the `type` field of the nearest `package.json`, and the `.mjs` / `.cjs` extension, which decide on their own. A `.js` file with no ancestor declaration is CommonJS, which is what Node does.

| Directory | Module system |
| --- | --- |
| `conver` | `module` |
| `crystalize-readme` | `commonjs` |
| `drill-rfc-down` | `module` |
| `grill-me-for-rfc` | `module` |
| `hooks` | `commonjs` |
| `lib` | `commonjs` |
| `rfc-graph` | `commonjs` |
| `tickets` | `commonjs` |
| `utils` | `unknown` |
| `workspacify-allocate` | `module` |
| `workspacify-reverse` | `module` |
| `workspacify-tree` | `module` |

`unknown` is a verdict, not a gap: `utils` holds a single shell script and no module-bearing file, so it has no module system to state. A directory whose files all agree is reported with theirs.

Directories under `.claude/scripts/` that declare no `type` of their own inherit `.claude/package.json`, which is `commonjs`; `workspacify-reverse` declares no `type` at all and is ESM because every one of its files is `.mjs`. An earlier version of this file stated a two-way split that named `grill-me-for-rfc`, `conver` and `drill-rfc-down` as CommonJS when all three declare `module`, and named `node tests/run-all.js` as the test runner when no such path exists. A reviewer reading only that statement reported a convention violation in fourteen correct files. `make check-conventions` derives this table from the filesystem and compares it against this one, so the document cannot drift from the repository again.

## File Conventions

- `scripts/` — Node.js utilities, hooks. The module system is the one the directory table above states, not one convention for the whole tree.
- `agents/`, `commands/`, `skills/`, `rules/` — Markdown with YAML frontmatter
- `tests/` — Mirrors the `scripts/` structure. Test files are named `*.test.js`, `*.test.cjs` or `*.test.mjs`; the extension decides the module system, so a test beside CommonJS code is `.test.cjs` and one beside ESM is `.test.mjs`.
- File naming: **lowercase with hyphens** (e.g. `session-start.js`, `post-edit-format.js`)

## Code Style

- **Use the module system the file's directory declares.** A `.js` file under a `type: module` tree is ESM; one under a `type: commonjs` tree is CommonJS. `import` in a CommonJS-declared file is a contradiction even though Node's syntax detection will load it — `make check-conventions` reports it by path.
- No TypeScript — plain `.js` throughout
- Prefer `const` over `let`; never `var`
- Keep hook scripts under 200 lines — extract helpers to `scripts/lib/`
- All hooks must `exit 0` on non-critical errors (never block tool execution unexpectedly)

## Hook Development

- Hook scripts normally receive JSON on stdin, but hooks routed through `scripts/hooks/run-with-flags.js` can export `run(rawInput)` and let the wrapper handle parsing/gating
- Async hooks: mark `"async": true` in `settings.json` with a timeout ≤30s
- Blocking hooks (PreToolUse, stop): keep fast (<200ms) — no network calls
- Use `run-with-flags.js` wrapper for all hooks so `ECC_HOOK_PROFILE` and `ECC_DISABLED_HOOKS` runtime gating works
- Always exit 0 on parse errors; log to stderr with `[HookName]` prefix

## Testing Requirements

- Run `node tests/run-all.js` before committing
- New scripts in `scripts/lib/` require a matching test in `tests/lib/`
- New hooks require at least one integration test in `tests/hooks/`

## Markdown / Agent Files

- Agents: YAML frontmatter with `name`, `description`, `tools`, `model`
- Skills: sections — When to Use, How It Works, Examples
- Commands: `description:` frontmatter line required
- Run `npx markdownlint-cli '**/*.md' --ignore node_modules` before committing
