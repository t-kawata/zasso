// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
/**
 * Twelve realistic exploration and reach scenarios for rust-interface-law.
 *
 * Each scenario records the command sequence, the facts that must appear in
 * the answer, the payload size, the latency, and the guidance state. A result
 * is sufficient only when the expected content is present; an exit code alone
 * cannot prove reach.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export async function runLawScenarios({ skillDir, fixtureRoot }) {
  const cli = join(skillDir, 'dist/skill.mjs');
  const scenarios = [];

  const run = (label, args, expectations = {}, cwd = process.cwd(), expectedExitCodes = [0]) => {
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    const parsed = parseJson(result.stdout);
    const contentOk = expectations.content
      ? expectations.content.every((pattern) => pattern.test(result.stdout))
      : true;
    const emptyOk = expectations.empty
      ? expectedEmpty(parsed, expectations.empty)
      : true;
    const statusOk = expectedExitCodes.includes(result.status);
    scenarios.push({
      label,
      commands: [`node "$LAW" ${args.join(' ')}`],
      status: result.status,
      expectedStatus: expectedExitCodes,
      conceptIds: extractIds(result.stdout),
      payloadBytes: Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8'),
      latencyMs,
      usedRawFileRead: false,
      guidanceState: parsed?.guidance?.state ?? null,
      frontierCount: Array.isArray(parsed?.frontier) ? parsed.frontier.length : 0,
      contentOk,
      verdict: statusOk && contentOk && emptyOk ? 'sufficient' : 'insufficient',
    });
    return result;
  };

  const appliedRoot = join(fixtureRoot, 'applicable');
  run('applies REST', ['applies', '--root', appliedRoot, '--paths', 'crates/app-rest/src/lib.rs'], { content: [/APPLIES/] }, appliedRoot, [0]);
  run('show REST-01', ['show', 'REST-01'], { content: [/Credentials come only from/] });
  run('required REST-01', ['required', '--rule', 'REST-01'], { content: [/REST-01/, /ARC-01/, /applies_to/] });
  run('incoming ID-01', ['incoming', 'ID-01'], { content: [/rules\/c\/id-02/, /kind/] });
  run('context REST-01', ['context', '--rule', 'REST-01', '--budget', '1000000'], { content: [/Credentials come only from/, /6-http-rules/] });
  run('freshness', ['freshness'], { empty: 'rows' });
  run('trust unverified', ['trust', '--tier', 'unverified'], { empty: 'rows' });
  run('explain REST-01', ['explain', '--rule', 'REST-01'], { content: [/Requirement/, /V3 test\./] });
  run('search authorization', ['search', '--query', 'authorization'], { content: [/AUTH-21/, /why_matched/] });
  run('required adapter phase', ['required', '--phase', 'adapter'], { content: [/REST-01/, /records/] });
  run('lint', ['lint'], { empty: 'findings' });
  run('neighbors REST-01', ['neighbors', 'REST-01'], { content: [/6-http-rules/] });
  return scenarios;
}

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function expectedEmpty(parsed, field) {
  const value = parsed?.[field];
  if (!Array.isArray(value)) return false;
  return value.length === 0;
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
function extractIds(output) {
  const text = String(output ?? '');
  const ids = new Set();
  for (const match of text.matchAll(/(?:`|")((?:rules|sources)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)(?:`|")/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}
