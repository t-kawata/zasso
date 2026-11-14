/**
 * Per-skill applicability contract for `*-law` skills.
 *
 * The free-form block is interpreted by the AI, which authors the telegraphic
 * instruction. This module is the machine side: it splits the invocation,
 * validates the instruction and record, and renders the one-line injection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeLf } from '../law-verify/source.mjs';

export const APPLICABILITY_SCHEMA = 'law-applicability/v1';
export const TRIGGER_MARKER_PREFIX = '<!-- law-skill:trigger:';
export const MAX_TRIGGER_INSTRUCTION_LENGTH = 240;
export const MAX_TRIGGER_LINE_LENGTH = 320;

const SKILL_NAME = /^[a-z][a-z0-9-]*-law$/;
const CLASSIFICATIONS = new Set(['specific-case-trigger', 'general']);
const DISCOVERIES = new Set(['workspace-units', 'path-glob']);
const FILLER_PATTERNS = Object.freeze([
  /\bplease\b/i,
  /\byou should\b/i,
  /\bnote that\b/i,
  /\bmake sure\b/i,
  /\bin order to\b/i,
  /\bit is important\b/i,
  /\bthe following\b/i,
  /\bbe sure to\b/i,
]);
const REQUIRED_ACTIONS = Object.freeze(['applies', 'exit 3', 'skip']);

function finding(code, message) {
  return { code, message };
}

/**
 * Split the raw slash-command argument at the first blank line.
 *
 * The head stays in the existing positional grammar; the tail is the
 * instruction candidate. No flag grammar is introduced.
 *
 * @param {string} text
 * @returns {{sources:string, instruction:string}}
 */
export function splitInvocationArgument(text) {
  const normalized = normalizeLf(String(text ?? ''));
  const boundary = normalized.indexOf('\n\n');
  if (boundary < 0) return { sources: normalized.trim(), instruction: '' };
  return {
    sources: normalized.slice(0, boundary).trim(),
    instruction: normalized.slice(boundary + 2).trim(),
  };
}

export function triggerMarker(skillName) {
  return `${TRIGGER_MARKER_PREFIX}${skillName} -->`;
}

export function buildTriggerLine(skillName, instruction) {
  return `${triggerMarker(skillName)} ${instruction}`;
}

export function isTriggerLine(line) {
  return String(line).trimStart().startsWith(TRIGGER_MARKER_PREFIX);
}

export function parseTriggerLine(line) {
  const text = String(line).trim();
  if (!text.startsWith(TRIGGER_MARKER_PREFIX)) return null;
  const close = text.indexOf(' -->');
  if (close < 0) return null;
  return {
    skill: text.slice(TRIGGER_MARKER_PREFIX.length, close).trim(),
    instruction: text.slice(close + 4).trim(),
  };
}

/**
 * Validate the AI-authored instruction against the telegraphic contract.
 *
 * @param {string} instruction
 * @param {{skill:string, conditions:Array<{terms:string[]}>}} options
 * @returns {Array<{code:string,message:string}>}
 */
export function validateTriggerInstruction(instruction, { skill, conditions = [] } = {}) {
  const findings = [];
  const text = String(instruction ?? '').trim();
  if (text.length === 0) {
    findings.push(finding('TRIGGER_INSTRUCTION_MISSING', 'instruction is empty'));
    return findings;
  }
  if (!/^[\x20-\x7E]+$/.test(text)) {
    findings.push(finding('TRIGGER_NOT_ENGLISH', 'instruction must be ASCII English on one line'));
  }
  if (text.length > MAX_TRIGGER_INSTRUCTION_LENGTH) {
    findings.push(finding('TRIGGER_TOO_LONG', `instruction exceeds ${MAX_TRIGGER_INSTRUCTION_LENGTH} characters`));
  }
  if (FILLER_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push(finding('TRIGGER_FILLER', 'instruction carries filler prose'));
  }
  if (skill && !text.toLowerCase().includes(String(skill).toLowerCase())) {
    findings.push(finding('TRIGGER_MISSING_SKILL', 'instruction does not name the skill'));
  }
  for (const action of REQUIRED_ACTIONS) {
    if (!text.toLowerCase().includes(action.toLowerCase())) {
      findings.push(finding('TRIGGER_MISSING_ACTION', `instruction lacks "${action}"`));
    }
  }
  if (!/[;→]/.test(text)) {
    findings.push(finding('TRIGGER_NOT_TELEGRAPHIC', 'instruction lacks a telegraphic separator'));
  }
  for (const condition of conditions) {
    for (const term of condition.terms ?? []) {
      if (!text.toLowerCase().includes(String(term).toLowerCase())) {
        findings.push(finding('TRIGGER_MISSING_TERM', `instruction lacks "${term}"`));
      }
    }
  }
  return dedupe(findings);
}

export function validateApplicabilityRecord(record) {
  const findings = [];
  if (!record || typeof record !== 'object') {
    return [finding('TRIGGER_INVALID', 'record is not an object')];
  }
  if (record.schema !== APPLICABILITY_SCHEMA) {
    findings.push(finding('TRIGGER_INVALID', `schema must be ${APPLICABILITY_SCHEMA}`));
  }
  if (!SKILL_NAME.test(String(record.skill ?? ''))) {
    findings.push(finding('TRIGGER_INVALID', 'skill name is invalid'));
  }
  if (!CLASSIFICATIONS.has(record.classification)) {
    findings.push(finding('TRIGGER_INVALID', 'classification is invalid'));
  }
  if (record.classification === 'general') return dedupe(findings);

  if (!Array.isArray(record.conditions) || record.conditions.length === 0) {
    findings.push(finding('TRIGGER_INVALID', 'conditions must be a non-empty array'));
  } else {
    for (const condition of record.conditions) {
      if (!condition || typeof condition.id !== 'string' || !Array.isArray(condition.terms)
        || condition.terms.length === 0 || condition.terms.some((term) => typeof term !== 'string')) {
        findings.push(finding('TRIGGER_INVALID', 'each condition needs an id and string terms'));
      }
    }
  }
  findings.push(...validateTriggerInstruction(record.instruction, {
    skill: record.skill,
    conditions: record.conditions ?? [],
  }));

  const applies = record.applies ?? {};
  if (!DISCOVERIES.has(applies.discovery)) {
    findings.push(finding('TRIGGER_INVALID', 'applies.discovery is invalid'));
  }
  if (!Array.isArray(applies.paths) || applies.paths.length === 0
    || applies.paths.some((path) => typeof path !== 'string')) {
    findings.push(finding('TRIGGER_INVALID', 'applies.paths must be a non-empty string array'));
  }
  if (!Array.isArray(applies.roles) || applies.roles.some((role) => typeof role !== 'string')) {
    findings.push(finding('TRIGGER_INVALID', 'applies.roles must be a string array'));
  }
  if (!Array.isArray(applies.sharedRoles) || applies.sharedRoles.some((role) => typeof role !== 'string')) {
    findings.push(finding('TRIGGER_INVALID', 'applies.sharedRoles must be a string array'));
  }
  if (applies.skipExit !== 3) {
    findings.push(finding('TRIGGER_INVALID', 'applies.skipExit must be 3'));
  }
  if ((applies.roles ?? []).length > 0 && applies.discovery !== 'workspace-units') {
    findings.push(finding('TRIGGER_INVALID', 'role matching requires workspace-units discovery'));
  }
  if ((applies.sharedRoles ?? []).length > 0
    && (typeof applies.sharedCondition !== 'string' || applies.sharedCondition.trim().length === 0)) {
    findings.push(finding('TRIGGER_INVALID', 'sharedRoles require a sharedCondition'));
  }
  return dedupe(findings);
}

/**
 * Load and validate a skill's `source/applicability.json`.
 *
 * @param {string} skillDirectory
 * @returns {{status:'absent'|'invalid'|'valid', record?:object, findings:Array}}
 */
export function loadApplicability(skillDirectory) {
  const path = join(skillDirectory, 'source/applicability.json');
  if (!existsSync(path)) return { status: 'absent', findings: [] };
  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { status: 'invalid', findings: [finding('TRIGGER_INVALID', 'record is not valid JSON')] };
  }
  const findings = validateApplicabilityRecord(record);
  if (findings.length > 0) return { status: 'invalid', findings };
  return { status: 'valid', record, findings: [] };
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((entry) => {
    const key = `${entry.code}:${entry.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
