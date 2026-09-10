/**
 * Capturing a session so that it can be examined again without being run again.
 *
 * A destructive transition cannot be repeated freely — that is why the
 * destructive entry point of the sandbox demands a recorded reset. But a
 * falsification plan needs to look at a session more than once, and re-running
 * the transition to look again would spend the one thing the isolation exists
 * to spend carefully. So a session is recorded whole: the commands that ran,
 * what they exited with, what they wrote. Replaying it re-derives the evidence
 * from that record and executes nothing, which is why the replay can be
 * repeated as often as a reader needs.
 *
 * A digest covers the evidence, and the evidence is re-derived from the
 * transitions on every replay, so an edit that leaves the record internally
 * inconsistent is refused rather than replayed as if it were observed. A
 * consistent rewrite is not detectable by a self-digest, and this module does
 * not claim otherwise: the digest catches drift, not forgery.
 *
 * A session is only recordable when it came from a sandbox this process
 * actually created: a hand-built session object describing runs nobody made is
 * not evidence, and recording it would manufacture the very thing the analysis
 * is trying to earn.
 */
import { createHash } from 'node:crypto';

import { SandboxError, isObservedSandbox } from './sandbox.mjs';

/** SHA-256 of a string, lowercase hex. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The evidence a set of transitions amounts to, as plain data. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function deriveEvidence(transitions) {
  return transitions.map((transition) => ({
    name: transition.name,
    command: transition.command,
    args: [...transition.args],
    exitCode: transition.exitCode,
    stdout: transition.stdout,
    stderr: transition.stderr,
    evidenceMode: transition.evidenceMode,
    observations: transition.observations.map((observation) => ({ ...observation })),
  }));
}

/** A digest over evidence alone, so two derivations of the same evidence agree. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function digestOfEvidence(evidence) {
  return `evd-${sha256(JSON.stringify(evidence)).slice(0, 16)}`;
}

/**
 * Capture a session so that replaying it repeats nothing.
 *
 * @param {object} session - a session returned by `startSession`
 * @returns {object} the record, with its evidence and the digest over it
 */
export function recordReplay(session) {
  if (session === null || typeof session !== 'object' || !Array.isArray(session.transitions)) {
    throw new SandboxError(
      'session-not-observed',
      'a session can only be recorded when it is the one a sandbox returned; this object carries no transitions to capture',
    );
  }
  if (!isObservedSandbox(session.origin)) {
    throw new SandboxError(
      'session-not-observed',
      `no sandbox in this process produced the session "${session.sessionId ?? '(unnamed)'}" — a session that was never observed cannot be recorded as evidence`,
    );
  }

  const transitions = deriveEvidence(session.transitions);
  const evidenceDigest = digestOfEvidence(transitions);
  const replayHandle = {
    sessionId: session.sessionId,
    evidenceDigest,
    transitionCount: transitions.length,
  };

  // The handle is where the replay capability is recorded, so the sandbox
  // describes itself completely: what it was made from, what has run in it, and
  // how to look at that again without running it again.
  session.origin.replayHandle = replayHandle;

  return {
    sessionId: session.sessionId,
    sandboxId: session.sandboxId,
    startPlan: session.startPlan,
    transitions,
    evidence: transitions,
    evidenceDigest,
    replayHandle,
  };
}

/**
 * Check a record against itself.
 *
 * The digest covers the evidence, and the evidence is re-derived from the
 * transitions in the same pass: a record whose transitions and evidence have
 * drifted apart describes a session that was never run.
 */
export function verifyReplay(record) {
  const errors = [];

  if (record === null || typeof record !== 'object' || !Array.isArray(record.transitions)) {
    return { valid: false, errors: [{ field: 'transitions', detail: 'a record to replay must carry the transitions it captured' }] };
  }

  const derived = deriveEvidence(record.transitions);
  const derivedDigest = digestOfEvidence(derived);
  if (record.evidenceDigest !== derivedDigest) {
    errors.push({
      field: 'evidenceDigest',
      detail: `the digest ${JSON.stringify(record.evidenceDigest)} does not match the evidence its transitions amount to (${derivedDigest}) — the record was altered after it was taken, and an altered record is not a replayable one`,
    });
  }
  if (digestOfEvidence(record.evidence ?? []) !== derivedDigest) {
    errors.push({
      field: 'evidence',
      detail: 'the stored evidence is not what the transitions amount to — replaying it would report runs that did not happen as recorded',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Re-derive a recorded session's evidence without executing anything.
 *
 * Nothing here spawns a process. That is the property being claimed, and it is
 * asserted by a side effect observed to happen exactly once — during the
 * recording, never during a replay.
 */
export function replaySession(record) {
  const verdict = verifyReplay(record);
  if (!verdict.valid) {
    throw new SandboxError(
      'replay-inconsistent',
      `the record for session "${record?.sessionId ?? '(unnamed)'}" cannot be replayed: ${verdict.errors[0].detail}`,
    );
  }
  return {
    sessionId: record.sessionId,
    evidence: record.evidence.map((entry) => ({ ...entry })),
    evidenceDigest: record.evidenceDigest,
    replayed: true,
    sideEffectsRepeated: false,
  };
}
