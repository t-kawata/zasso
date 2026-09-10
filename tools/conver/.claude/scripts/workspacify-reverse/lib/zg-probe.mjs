/**
 * zg in the serving layer — candidate discovery, and never a determination.
 *
 * zg is zvec-grep: one CLI over four search paths (a ripgrep-compatible
 * enumeration, BM25, a vector search and a hybrid of the last two). The design
 * puts it here, in the layer that hands material to a reader, and not in the
 * layer that settles anything, because a vector or BM25 search is
 * model-dependent: it returns different material on different runs and on
 * different embedding models. A search result therefore enters this program
 * labelled `candidate`, and no stage of the analysis reads one.
 *
 * The two modes are not interchangeable and are never blended:
 *
 *   exhaustive — a ripgrep-compatible search for a literal the caller already
 *                names. Complete for that literal, and repeatable.
 *   candidate  — a hybrid search for material related to a question whose
 *                vocabulary the caller does not yet know. It proposes; it
 *                cannot enumerate, because it does not know what it has missed.
 *
 * An absent zg is a normal condition. The probe reports it, the run continues,
 * and the candidate section is simply not served — a missing search tool must
 * never read as a failed analysis, and must never be simulated into one that
 * looks complete.
 */
import { spawnSync } from 'node:child_process';

/** The tool this layer serves, as ENV-DEPS.json declares it. */
export const ZG_TOOL_ID = 'zg';

/** The probe ENV-DEPS.json declares for it, run verbatim. */
export const ZG_PROBE_COMMAND = 'zg version';

/** The one subcommand every search goes through; only the flags differ. */
export const ZG_SEARCH_COMMAND = 'zg query';

/** How the tool is obtained, quoted back when it is absent. */
export const ZG_REMEDY = 'npm install -g @zvec/zvec-grep';

/** How many rows a search is asked for when the caller names no limit. */
export const ZG_DEFAULT_LIMIT = 8;

/** Where the candidate section is published, beside the analysis documents. */
export const ZG_REPORT_FILE_NAME = 'ZG-CANDIDATES.md';

/** The two states a probe can report. Absence is a state, not an error. */
export const ZG_AVAILABILITY = Object.freeze({
  available: 'available',
  unavailable: 'unavailable',
});

/** What a hit of each mode is called, wherever it is carried or rendered. */
export const CANDIDATE_LABEL = 'candidate';
export const EXHAUSTIVE_LABEL = 'exhaustive-enumeration';

/**
 * The search paths, with what each one's result may be used for.
 *
 * `meaning` is carried on the hit's own record rather than left in this
 * comment, so the sentence a reader needs arrives with the material instead of
 * in a file they would have to go and find.
 */
export const ZG_SEARCH_MODES = Object.freeze({
  candidate: Object.freeze({
    mode: 'candidate',
    label: CANDIDATE_LABEL,
    deterministic: false,
    flags: Object.freeze([]),
    meaning:
      'a hybrid search matches by word and by meaning, so it finds material whose vocabulary the reader '
      + 'does not yet know. For the same reason it cannot say what it has missed.',
  }),
  exhaustive: Object.freeze({
    mode: 'exhaustive',
    label: EXHAUSTIVE_LABEL,
    deterministic: true,
    flags: Object.freeze(['--rg']),
    meaning:
      'a ripgrep-compatible search enumerates one literal the caller names, and is complete for that '
      + 'literal and for nothing else.',
  }),
});

const CANDIDATE_MODE = ZG_SEARCH_MODES.candidate.mode;

/** `path:line:text`, the shape a located hit is reported in. */
const LOCATED_HIT = /^(.*?):(\d+):(.*)$/;

/** The first `major.minor.patch` in a version line. */
const VERSION_NUMBER = /\d+\.\d+\.\d+/;

/** What a shell reports for a command it could not find. */
const COMMAND_NOT_FOUND_STATUS = 127;

/**
 * Run one zg command.
 *
 * Injected rather than called directly, following the environment probe in
 * `env-manifest.cjs`: the available branch must be testable on a machine where
 * zg is absent, and this machine is one.
 */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function runZgCommand({ command, args, cwd }) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) {
    return { status: COMMAND_NOT_FOUND_STATUS, stdout: '', stderr: result.error.message };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The version the tool reports, or `null` when it reports none. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function versionFrom(stdout) {
  const line = String(stdout ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  if (line === undefined) return null;
  return VERSION_NUMBER.exec(line)?.[0] ?? line;
}

/**
 * Turn a search's stdout into hits, keeping the ones it cannot locate.
 *
 * A line that does not carry `path:line:` is reported with no location rather
 * than dropped: a search that found something the parser did not understand has
 * found something, and a hit quietly discarded here would read downstream as a
 * search that came back empty.
 */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function parseHits(stdout, label) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      const located = LOCATED_HIT.exec(line);
      if (located === null) return { label, path: null, line: null, text: line };
      return { label, path: located[1], line: Number(located[2]), text: located[3] };
    });
}

/** The command line a search ran, so a report can quote what produced its rows. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function searchCommandLine(mode, query) {
  return [ZG_SEARCH_COMMAND, ...mode.flags, '--limit', String(ZG_DEFAULT_LIMIT), JSON.stringify(query)].join(' ');
}

/**
 * Ask zg what it is, and — when it is there and a question was asked — what it
 * can find.
 *
 * The probe is one call that answers two questions, because the caller needs
 * both before it can serve anything: whether the tool exists, and whether there
 * is candidate material to serve. A run that is given no query still reports
 * availability, and returns no candidates: probing for material nobody asked
 * for would be an enumeration with no question behind it.
 *
 * @param {{root?: string, query?: string|null, mode?: string, runner?: Function}} params
 * @returns {object} the probe record; `availability` is `unavailable` when the tool is absent,
 *                   which is a state this function reports rather than an error it raises.
 */
export function probeZg({
  root,
  query = null,
  mode = CANDIDATE_MODE,
  runner = runZgCommand,
} = {}) {
  const search = ZG_SEARCH_MODES[mode];
  if (search === undefined) {
    throw new Error(
      `unknown zg search mode ${JSON.stringify(mode)}; the modes are ${Object.keys(ZG_SEARCH_MODES).join(', ')}. `
      + 'An unrecognised mode is refused rather than defaulted, because a fallback would decide on the '
      + "caller's behalf whether a result may be used as an enumeration.",
    );
  }

  const probe = runner({ command: ZG_TOOL_ID, args: ['version'], cwd: root });
  const version = probe.status === 0 ? versionFrom(probe.stdout) : null;
  const availability = version === null ? ZG_AVAILABILITY.unavailable : ZG_AVAILABILITY.available;

  const record = {
    tool: ZG_TOOL_ID,
    commandLine: ZG_PROBE_COMMAND,
    availability,
    version,
    remedy: version === null ? ZG_REMEDY : '',
    mode: search.mode,
    label: search.label,
    deterministic: search.deterministic,
    meaning: search.meaning,
    query,
    candidates: [],
    exhaustive: [],
    search: null,
  };
  if (availability === ZG_AVAILABILITY.unavailable) return record;
  if (query === null || query.length === 0) return record;

  const [command, ...subcommand] = ZG_SEARCH_COMMAND.split(' ');
  const outcome = runner({
    command,
    args: [...subcommand, ...search.flags, '--limit', String(ZG_DEFAULT_LIMIT), query],
    cwd: root,
  });
  const hits = parseHits(outcome.stdout, search.label);
  const failed = outcome.status !== 0;

  return {
    ...record,
    candidates: search.label === CANDIDATE_LABEL ? hits : [],
    exhaustive: search.label === CANDIDATE_LABEL ? [] : hits,
    search: {
      commandLine: searchCommandLine(search, query),
      status: outcome.status,
      note: failed
        ? `The search exited with status ${outcome.status} and its output may be incomplete: `
          + `${(outcome.stderr ?? '').trim() || 'it wrote nothing to stderr'}. `
          + 'Read the rows below as what it managed to return, not as what is there.'
        : '',
    },
  };
}

/** One row per hit, with its location in the table so a reader can go and open it. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function renderHitRows(hits) {
  if (hits.length === 0) return ['No row was returned.'];
  const rows = ['| Where | Text |', '|---|---|'];
  for (const hit of hits) {
    const where = hit.path === null ? '(no location reported)' : `\`${hit.path}:${hit.line}\``;
    rows.push(`| ${where} | ${hit.text.trim()} |`);
  }
  return rows;
}

/** The heading a served section carries, named after the mode that produced its rows. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function sectionHeading(label) {
  return label === CANDIDATE_LABEL
    ? '## Candidate discovery (zg) — candidates, not findings'
    : '## Exhaustive enumeration (zg --rg) — complete for the literal given';
}

/** What this mode's rows may and may not be used for, in the reader's own terms. */
// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
function aboutTheRows(label) {
  return label === CANDIDATE_LABEL
    ? '**A candidate does not settle a claim.** Per-row material found by a search is a place to look, '
      + 'never a proposition established. Open the file and the line, read the surrounding code, and let '
      + 'the reading — not this table — be the evidence.'
    : '**This enumeration is complete for the literal that was searched and for nothing else.** It says '
      + 'where the literal occurs; it says nothing about what the literal means, and a literal that is '
      + 'absent from this table is absent only for the spelling that was asked for.';
}

/** The line every served section ends with, so the boundary is stated once. */
const SERVICE_FOOTER = 'This section is served beside the analysis. No stage of the analysis reads it.';

/**
 * Render the candidate material as the Markdown a reader is served.
 *
 * JSON is for what another script consumes; this is read by a person or an AI
 * about to decide something, so it is prose, it says where each hit came from,
 * and it says what the hit may not be used for. When the tool is absent there is
 * no section at all — only a statement of the absence, so that a missing search
 * cannot be mistaken for a search that found nothing.
 *
 * @param {object} probe - a record from {@link probeZg}
 * @returns {string} Markdown, with a section heading whenever zg is installed
 */
export function renderZgReport(probe) {
  if (probe.availability === ZG_AVAILABILITY.unavailable) {
    return [
      `zg: not installed. The serving layer probed it with \`${probe.commandLine}\` and this machine has no `
      + `working \`${probe.tool}\`, so no candidate discovery was served and \`${ZG_REPORT_FILE_NAME}\` was not written.`,
      '',
      'Nothing else is affected: no stage of the analysis reads a zg result, so every document beside this '
      + 'line was produced without one and is complete.',
      '',
      `To have candidate material served beside a later run, install it with \`${probe.remedy}\`.`,
    ].join('\n');
  }

  // Installed and asked nothing: the state `analyze <root>` alone produces.
  if (probe.search === null) {
    return [
      sectionHeading(probe.label),
      '',
      `zg is installed (version ${probe.version}), and no question was asked of it, so no candidate `
      + 'material was served for this run. The analysis is complete without it.',
      '',
      aboutTheRows(probe.label),
      '',
      probe.meaning,
      '',
      'Ask it a question with `--query=<text>` to have related material served beside the results.',
      '',
      SERVICE_FOOTER,
    ].join('\n');
  }

  const hits = probe.label === CANDIDATE_LABEL ? probe.candidates : probe.exhaustive;
  const lines = [
    sectionHeading(probe.label),
    '',
    `zg is installed (version ${probe.version}). The search \`${probe.search.commandLine}\` returned `
    + `${hits.length} row(s).`,
    '',
    aboutTheRows(probe.label),
    '',
    probe.meaning,
    '',
  ];
  if (probe.search.note.length > 0) lines.push(probe.search.note, '');
  lines.push(...renderHitRows(hits), '', SERVICE_FOOTER);
  return lines.join('\n');
}
