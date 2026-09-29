// [::TICKET::] PX-225, PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-225|PX-226) --for-spec --no-implementation-order`.
//
// The human's section is named once. `frame.mjs` publishes the section vocabulary, so it owns
// the name; a consumer that spells the id again holds a second definition of one fact, and the
// two part company the moment the frame moves the section. PX-226 exported the name to remove
// that second definition, so this file measures the removal rather than the value: a consumer
// that happens to agree with the owner today still fails here, because agreement is not ownership.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME_SECTIONS, HUMAN_SECTION_ID } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';

/** The module that owns the section vocabulary, and so the only one allowed to name the section. */
const OWNER_MODULE = 'frame.mjs';

/** The tool whose modules must take the name from its owner rather than spell it again. */
const TOOL_DIRECTORY = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/', import.meta.url));

/** A declaration of the name; an import and a use are neither, so the match stays on declarations. */
const DECLARES_THE_NAME = /^\s*(?:export\s+)?(?:const|let|var|function|class)\s+HUMAN_SECTION_ID\b/m;

/** The name taken from its owner: an import list holding it, bound to the owner's own module. */
const IMPORTS_THE_NAME_FROM_THE_OWNER = /import\s*\{[^}]*\bHUMAN_SECTION_ID\b[^}]*\}\s*from\s*['"][^'"]*frame\.mjs['"]/;

/** Every module of the tool, the owner included, as tool-relative paths. */
function modulePaths() {
  return readdirSync(TOOL_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => relative(TOOL_DIRECTORY, join(entry.parentPath, entry.name)));
}

test('PX-225/PX-226: the human section is named once, by the module that owns the vocabulary', () => {
  // The owner derives the id from the vocabulary it publishes, so moving the section inside
  // FRAME_SECTIONS moves the name with it instead of leaving a literal behind.
  assert.ok(
    FRAME_SECTIONS.some((section) => section.id === HUMAN_SECTION_ID),
    'HUMAN_SECTION_ID names a section that FRAME_SECTIONS declares',
  );

  // The owner is recognised by name rather than by position, so moving the file inside the
  // tool does not silently exempt whichever consumer takes its place.
  const consumers = modulePaths().filter((path) => basename(path) !== OWNER_MODULE);
  const sources = new Map(consumers.map((path) => [path, readFileSync(join(TOOL_DIRECTORY, path), 'utf8')]));

  // Two shapes of the same defect: declaring the name again, and reading the section without
  // taking the name from its owner. Both make the consumer an owner, so both fail here.
  const offenders = consumers.filter((path) => {
    const source = sources.get(path);
    if (!source.includes('HUMAN_SECTION_ID')) return false;
    return DECLARES_THE_NAME.test(source) || !IMPORTS_THE_NAME_FROM_THE_OWNER.test(source);
  });

  assert.deepStrictEqual(
    offenders,
    [],
    'every module that reads the section takes the name from the owner, and none declares it',
  );
});
