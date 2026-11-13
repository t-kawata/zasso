// @verifies C010
/**
 * PX-424 — executable contract for the `/build-okf-skill` procedure.
 *
 * The command is an AI-executed Markdown procedure. This module holds the
 * deterministic parts: argument parsing, the static audit of the command text,
 * and the check-set constants the command and verifier must agree on.
 */

import { readFileSync } from 'node:fs';
import { auditUsageManual } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/usage.mjs';

export { auditUsageManual };

export const OKF_SKILL_NAME = /^[a-z][a-z0-9-]*-okf$/;

export const COMMAND_SECTIONS = Object.freeze([
  '## Path Anchor',
  '## Language Protocol',
  '## Arguments',
  '## Invariants',
  '## Input Contract',
  '## Generated Skill Layout',
  '## Procedure',
  '## Verification Gates',
  '## Failure Modes',
  '## Completion',
]);

export const REQUIRED_SCRIPTS = Object.freeze([
  'verify-okf-skill.mjs',
  'okf-verify/checks.json',
  'okf-engine/scripts/cli.mjs',
  'okf-engine/scripts/lib/claims.mjs',
]);

export const FORBIDDEN_COMMAND_TEXT = Object.freeze([
  '## Integration Contract',
  'Integration Checkpoints',
  'Step 12.5',
  'verify-law-integration.mjs',
  'build-law-skill.md',
]);

export const FORBIDDEN_URL = /https?:\/\//;

export const CHECK_CONTRACT = JSON.parse(
  readFileSync(new URL('../../../.claude/scripts/amend-rfc-up/okf-verify/checks.json', import.meta.url), 'utf8'),
);

export const CHECK_NAMES = Object.freeze(CHECK_CONTRACT.checks.map((check) => check.name));
export const CHECK_SET_VERSION = CHECK_CONTRACT.check_set_version;

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
export class ArgumentError extends Error {
// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
  constructor(code, message) {
    super(message);
    this.name = 'ArgumentError';
    this.code = code;
  }
}

/**
 * Parse the positional argument grammar.
 *
 * @param {string[]} argv
 * @returns {{name:string,sources:string[]}[]}
 */
export function parseOkfInvocation(argv) {
  const args = [...argv];
  if (args.length === 0) throw new ArgumentError('INVALID_ARGUMENT', 'empty argument');
  for (const argument of args) {
    if (argument.startsWith('-')) throw new ArgumentError('INVALID_ARGUMENT', `option not accepted: ${argument}`);
  }
  const paired = args.some((argument) => argument.includes('='));
  const plain = args.some((argument) => !argument.includes('='));
  if (paired && plain) throw new ArgumentError('MIXED_ARGUMENT_FORMS', 'mixed name=source and positional forms');
  if (paired) {
    const units = new Map();
    for (const argument of args) {
      const equals = argument.indexOf('=');
      if (equals <= 0 || equals === argument.length - 1) throw new ArgumentError('INVALID_ARGUMENT', argument);
      const name = argument.slice(0, equals);
      const source = argument.slice(equals + 1);
      assertName(name);
      if (!units.has(name)) units.set(name, []);
      units.get(name).push(source);
    }
    return [...units].map(([name, sources]) => ({ name, sources }));
  }
  const [name, ...sources] = args;
  assertName(name);
  if (sources.length === 0) throw new ArgumentError('INVALID_ARGUMENT', 'no source document');
  return [{ name, sources }];
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function assertName(name) {
  if (!OKF_SKILL_NAME.test(name)) throw new ArgumentError('INVALID_ARGUMENT', `invalid skill name: ${name}`);
}

/**
 * Static audit of the command document.
 *
 * @param {string} text
 * @returns {{code:string,detail:string}[]}
 */
export function auditOkfCommand(text) {
  const findings = [];
  for (const section of COMMAND_SECTIONS) {
    if (!text.includes(section)) findings.push({ code: 'MISSING_SECTION', detail: section });
  }
  for (const fragment of FORBIDDEN_COMMAND_TEXT) {
    if (text.includes(fragment)) findings.push({ code: 'INTEGRATION_PRESENT', detail: fragment });
  }
  if (FORBIDDEN_URL.test(text)) findings.push({ code: 'EXTERNAL_REFERENCE', detail: 'URL' });
  for (const script of REQUIRED_SCRIPTS) {
    if (!text.includes(script)) findings.push({ code: 'MISSING_SCRIPT', detail: script });
  }
  if (!text.includes('check_set_version')) findings.push({ code: 'MISSING_CHECK_VERSION', detail: 'check_set_version' });
  if (!text.includes('19')) findings.push({ code: 'MISSING_CHECK_COUNT', detail: '19 checks' });
  if (!text.includes('-okf')) findings.push({ code: 'MISSING_NAME_GRAMMAR', detail: '-okf' });
  if (/[぀-ヿ一-鿿]/.test(text)) findings.push({ code: 'CJK_TEXT', detail: 'non-English' });
  if (/\bPX-\d+\b/.test(text)) findings.push({ code: 'TICKET_ID', detail: 'ticket id' });
  if (/\/Users\/[A-Za-z0-9._-]+/.test(text)) findings.push({ code: 'ABSOLUTE_PATH', detail: 'absolute path' });
  return findings;
}
