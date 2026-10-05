#!/usr/bin/env node
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * settle-run.js <session-dir> <operation> [args...]
 *
 * The question gate, bound to the design tree of one grill or drill session.
 * /grill-me-for-rfc hands it the RFC directory and /drill-rfc-down hands it the
 * session directory under `<rfcDir>/drills`; nothing else differs, so the two
 * copies of this file are one implementation and cannot drift.
 *
 * Operations:
 *   prior [dir...]            read the artifacts the given directories hold — the
 *                             package directory, and any neighbour directory — record
 *                             the scan in the tree, and print what they decide. With
 *                             no directory given, the session directory is read.
 *                             Writes nothing but the scan record.
 *   next <n>                  open n numbered empty question blocks. Refuses when
 *                             no point is open, past the round cap, or when more
 *                             blocks are asked for than a round may carry.
 *   check                     the gate: exit 0 only when the tree and every block
 *                             are well formed and the prior records were read.
 *   answers                   the verdict: exit 0 only when every block carries an
 *                             answer and the ledger holds no unsettled point.
 *
 * The reason `check` is separate from `answers`: well-formedness and completion are
 * different states. Questions can be perfectly shaped while every one of them is still
 * open, and conflating the two would let the run report itself finished because its
 * questions were tidy.
 */
import fs from "fs";
import path from "path";
import { validateAll } from "./check-all-schema.js";
import { toHomeRelative } from "../lib/path-utils.js";
import { partitionPoints } from "../question-gate/ledger.mjs";
import { priorDecisions } from "../question-gate/prior-decisions.mjs";
import { MAX_AXES_PER_ROUND } from "../question-gate/bundle.mjs";
import { nextNumbers } from "../question-gate/rounds.mjs";
import { isAnsweredByLetter, readAnswers, refineLetterlessAnswer } from "../question-gate/answers.mjs";
import { readBack, renderBlock } from "../question-gate/block.mjs";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/** A question binds at least this many points: one point is a fact-question. */
const MIN_BOUND_NODES = 2;

/** The framing half of the block: the four lines that narrow the question. */
const FRAMING_FIELDS = ["context", "conclusion", "settled", "remainder"];

/** A question offers at least this many directions, and they must differ in consequence. */
const REQUIRED_DIRECTIONS = 2;

/**
 * Everything wrong with one block's shape, as the seven lines state it.
 *
 * The gate reads the block the way its reader does: rendered top to bottom, so a
 * letter used before the line that defines it is a defect at that line, and every
 * line the rule requires is required here too.
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function shapeFaults(block) {
  const faults = [];
  const framing = { context: "", conclusion: "", settled: "", remainder: "", ...(block.framing ?? {}) };
  const choice = { directions: [], recommendation: "", overturning: "", ...(block.choice ?? {}) };

  for (const field of FRAMING_FIELDS) {
    if (framing[field].trim() === "") {
      faults.push({ kind: "missing-line", detail: `Q${block.number} states no ${field}` });
    }
  }
  if ((block.scopeLine ?? "").trim() === "") {
    faults.push({ kind: "missing-scope-line", detail: `Q${block.number} states no scope line` });
  }

  const directions = Array.isArray(choice.directions) ? choice.directions : [];
  if (directions.length < REQUIRED_DIRECTIONS) {
    faults.push({
      kind: "missing-directions",
      detail: `Q${block.number} offers ${directions.length} direction(s); at least ${REQUIRED_DIRECTIONS} are required`,
    });
  }
  directions.forEach((direction, index) => {
    if (!direction?.letter || !direction?.meaning) {
      faults.push({ kind: "malformed-direction", detail: `Q${block.number} direction ${index + 1} has no letter or no meaning` });
    }
  });
  if (choice.recommendation.trim() === "") {
    faults.push({ kind: "missing-recommendation", detail: `Q${block.number} recommends nothing` });
  }
  if (choice.overturning.trim() === "") {
    faults.push({ kind: "missing-overturning", detail: `Q${block.number} names no fact that would overturn it` });
  }

  for (const fault of readBack(renderBlock({ framing, choice })).faults) {
    faults.push({ kind: fault.kind, detail: `Q${block.number}: ${fault.line ?? "no options line"}` });
  }

  return faults;
}

const [,, sessionDirArg, operation, ...args] = process.argv;
if (!sessionDirArg || !operation) {
  process.stderr.write("Usage: settle-run.js <session-dir> <prior|next|check|answers> [args...]\n");
  process.exit(EXIT_FAILURE);
}

const sessionDir = path.resolve(sessionDirArg);
const treePath = path.join(sessionDir, "DesignTree.json");

if (!fs.existsSync(treePath)) {
  process.stderr.write(`DesignTree.json not found: ${toHomeRelative(treePath)}\n`);
  process.exit(EXIT_FAILURE);
}

const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function emptyBlock(number) {
  return {
    number,
    boundNodeIds: [],
    settleTrace: "",
    scopeLine: "",
    framing: { context: "", conclusion: "", settled: "", remainder: "" },
    choice: { directions: [], recommendation: "", overturning: "" },
    answer: null,
  };
}

/** Every node of the tree, parents before children. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function collectNodes(nodes, collected = []) {
  for (const node of nodes) {
    collected.push(node);
    if (node.children?.length) collectNodes(node.children, collected);
  }
  return collected;
}

/**
 * The points, the open questions and the settled items of this tree, as the ledger
 * wants them.
 *
 * A node counts as settled only when its latest resolution carries a ground: a
 * resolution with a decision and no ground rests on nothing, and reading it as
 * settled would report a point as decided while the gate is still refusing it.
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function buildLedger() {
  const nodes = collectNodes(tree.nodes ?? []);
  const points = nodes.map((node) => node.id);
  const preDecided = [];

  for (const node of nodes) {
    const resolution = (node.questions ?? []).at(-1);
    if (node.status !== "resolved" || !resolution?.ground) continue;
    preDecided.push({
      ids: [node.id],
      decision: resolution.decision ?? resolution.answer,
      ground: resolution.ground,
      override: resolution.override,
    });
  }

  const questions = (tree.questions ?? []).map((block) => ({
    number: block.number,
    boundIds: block.boundNodeIds ?? [],
  }));

  return partitionPoints({ points, questions, preDecided });
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function writeTree() {
  fs.writeFileSync(treePath, JSON.stringify(tree, null, 2), "utf-8");
  const errors = validateAll(sessionDir);
  if (errors.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, phase: "schema-validation", errors }, null, 2)}\n`);
    process.exit(EXIT_FAILURE);
  }
}

/** Read a file, or report that it could not be read rather than guessing at it. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
const unreadableDocuments = [];

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function readIfReadable(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      unreadableDocuments.push({ path: toHomeRelative(filePath), reason: error.code ?? String(error.message) });
    }
    return null;
  }
}

/** List a directory, or report that it could not be listed. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function listIfReadable(directory) {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

/** What the prior artifacts carry, as the operator reads it. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function renderPrior(entries) {
  if (entries.length === 0) return "No prior decision was found in this package or its neighbours.\n";

  const lines = ["# Prior decisions already recorded", ""];
  for (const entry of entries) {
    const mark = entry.kind === "decision" ? "decides" : "states";
    const ground = entry.ground === null ? "" : `  (ground: ${entry.ground})`;
    lines.push(`- ${entry.artifact} ${mark}: ${entry.statement}${ground}`);
  }
  return `${lines.join("\n")}\n`;
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function runPrior(recordDirectories) {
  // The records live in the package directory, which for a drill session is one level
  // up from the session directory the tree lives in. The caller names the directories
  // to read, so neither tool has to guess where its own records are.
  const directories = recordDirectories.length > 0 ? recordDirectories : [sessionDir];
  const entries = [];
  for (const directory of directories) {
    entries.push(
      ...priorDecisions({ directory, readFile: readIfReadable, listDirectory: listIfReadable }),
    );
  }

  tree.priorScan = {
    scannedAt: new Date().toISOString(),
    directories: [...directories],
    artifacts: [...new Set(entries.map((entry) => entry.artifact))],
    decisions: entries.filter((entry) => entry.kind === "decision"),
    grounds: entries.filter((entry) => entry.kind === "ground"),
    unreadable: [...unreadableDocuments],
  };
  writeTree();

  for (const document of unreadableDocuments) {
    process.stderr.write(`prior: unreadable — ${document.path} (${document.reason}); it settles nothing\n`);
  }

  process.stdout.write(renderPrior(entries));
  return EXIT_OK;
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function runNext(countText) {
  const count = Number(countText);
  if (!Number.isInteger(count) || count < 1) {
    process.stderr.write(`next refused: the round size must be a positive integer (got "${countText}")\n`);
    return EXIT_FAILURE;
  }
  if (count > MAX_AXES_PER_ROUND) {
    process.stderr.write(`next refused: a round opens at most ${MAX_AXES_PER_ROUND} axes\n`);
    return EXIT_FAILURE;
  }

  const ledger = buildLedger();
  const existingNumbers = (tree.questions ?? []).map((block) => block.number);
  // One round carries at most MAX_AXES_PER_ROUND blocks, so the highest number the
  // document holds is what says how many rounds have been opened.
  const highest = existingNumbers.length === 0 ? 0 : Math.max(...existingNumbers);
  const roundsUsed = Math.ceil(highest / MAX_AXES_PER_ROUND);

  const opened = nextNumbers({ existingNumbers, n: count, openCount: ledger.unsettled.size, roundsUsed });
  if (!opened.ok) {
    process.stderr.write(`next refused: ${opened.reason}\n`);
    return EXIT_FAILURE;
  }

  if (!Array.isArray(tree.questions)) tree.questions = [];
  for (const number of opened.numbers) {
    tree.questions.push(emptyBlock(number));
  }
  writeTree();

  process.stdout.write(`${JSON.stringify({ ok: true, operation: "next", numbers: opened.numbers })}\n`);
  return EXIT_OK;
}

/**
 * Everything wrong with this round, as values a reader can act on.
 *
 * The four kinds are the four ways a round can look finished and not be: a question
 * that should have been settled, a question that does not say why it was not, a
 * question asked without reading the records, and a question that names none of the
 * records that were read.
 */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function collectFaults() {
  const faults = [];
  const blocks = tree.questions ?? [];
  const scannedArtifacts = tree.priorScan?.artifacts ?? [];
  const boundCount = new Map();

  for (const block of blocks) {
    const boundIds = block.boundNodeIds ?? [];
    for (const id of boundIds) boundCount.set(id, (boundCount.get(id) ?? 0) + 1);

    const first = boundIds[0] ?? "the round";
    faults.push(...shapeFaults(block));
    if (boundIds.length < MIN_BOUND_NODES) {
      faults.push({ kind: "single-point-question", detail: `Q${block.number} binds ${boundIds.length} point(s)` });
    }
    if ((block.settleTrace ?? "").trim() === "") {
      faults.push({ kind: "missing-settle-trace", detail: `Q${block.number} records no reason it could not be settled` });
      continue;
    }
    if (boundIds.length > 0 && tree.priorScan === undefined) {
      faults.push({ kind: "prior-artifacts-not-read", detail: `Q${block.number} binds ${first} before any prior scan was recorded` });
    }
    if (scannedArtifacts.length > 0 && !scannedArtifacts.some((artifact) => block.settleTrace.includes(artifact))) {
      faults.push({
        kind: "unread-prior-artifact",
        detail: `Q${block.number} binds ${first} and its reason names none of: ${scannedArtifacts.join(", ")}`,
      });
    }
  }

  for (const [nodeId, times] of boundCount) {
    if (times > 1) {
      faults.push({ kind: "node-bound-twice", detail: `${nodeId} is bound by ${times} questions` });
    }
  }

  for (const node of collectNodes(tree.nodes ?? [])) {
    const resolution = (node.questions ?? []).at(-1);
    if (resolution?.source === "ai" && (!resolution.ground || !resolution.override)) {
      faults.push({ kind: "groundless-settlement", detail: `${node.id} was settled without a ground or an override` });
    }
  }

  return faults;
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function runCheck() {
  const faults = collectFaults();
  if (faults.length > 0) {
    process.stderr.write(`check FAILED:\n${faults.map((fault) => `- ${fault.kind}: ${fault.detail}`).join("\n")}\n`);
    return EXIT_FAILURE;
  }

  const ledger = buildLedger();
  process.stdout.write(`check OK: ${(tree.questions ?? []).length} question(s), unsettled ${ledger.unsettled.size}\n`);
  return EXIT_OK;
}

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function runAnswers() {
  const blocks = tree.questions ?? [];
  const reading = readAnswers({ questions: blocks.map((block) => ({ number: block.number, answer: block.answer })) });
  const ledger = buildLedger();
  const unsettled = [...ledger.unsettled].sort();
  // A reply carrying no letter is not an answer — and it is not nothing: what it
  // raised is a point, so the report says so rather than only counting it short.
  const raised = blocks
    .filter((block) => typeof block.answer === "string" && block.answer.trim() !== "" && !isAnsweredByLetter({ answer: block.answer }))
    .map((block) => ({ number: block.number, ...refineLetterlessAnswer({ reply: block.answer }).raised }));

  if (reading.unanswered.length === 0 && unsettled.length === 0) {
    process.stdout.write(
      reading.asked === 0
        ? "answers OK: there was nothing to ask — no question stands and no recorded point is unsettled.\n"
        : `answers OK: ${reading.answered} of ${reading.asked} answered, none still open.\n`,
    );
    return EXIT_OK;
  }

  process.stdout.write(
    [
      `answers FAILED: ${reading.answered} of ${reading.asked} answered, ${reading.unanswered.length + unsettled.length} still open.`,
      ...reading.unanswered.map((number) => `- Q${number}`),
      ...unsettled.map((nodeId) => `- ${nodeId}`),
      ...raised.map((entry) => `- Q${entry.number}: what it raised is a point, not an answer — ${entry.origin}`),
      "",
    ].join("\n"),
  );
  return EXIT_FAILURE;
}

switch (operation) {
  case "prior":
    process.exit(runPrior(args));
  case "next":
    process.exit(runNext(args[0]));
  case "check":
    process.exit(runCheck());
  case "answers":
    process.exit(runAnswers());
  default:
    process.stderr.write(`Unknown operation: ${operation}\n`);
    process.exit(EXIT_FAILURE);
}
