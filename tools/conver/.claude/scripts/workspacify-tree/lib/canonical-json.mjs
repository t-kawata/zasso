// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * Canonical JSON serialization (§12.1).
 *
 * Deterministic rendering used for every published artifact: LF newlines,
 * two-space indentation, object keys in lexicographic order, arrays preserved
 * in caller order, no trailing whitespace, and exactly one trailing LF. The
 * same renderer is used to compute the manifest self-hash (PX-178), so any
 * byte-level change in the value is reflected in the hash.
 */
import { WorkSpacifyTreeError } from './errors.mjs';

/**
 * Serialize any JSON-serializable value to canonical JSON text.
 *
 * @param {*} value - object/array/primitive; Date is rendered as UTC ISO 8601
 * @returns {string} canonical JSON ending with a single LF
 * @throws {WorkSpacifyTreeError} for non-serializable or cyclic values
 */
export function canonicalSerialize(value) {
  const seen = new WeakSet();
  const text = renderValue(value, '', seen);
  return text.endsWith('\n') ? text : `${text}\n`;
}

function renderValue(value, indent, seen) {
  if (value === null) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'string') {
    return JSON.stringify(value);
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new WorkSpacifyTreeError('cannot serialize a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (type === 'bigint' || type === 'symbol' || type === 'undefined' || type === 'function') {
    throw new WorkSpacifyTreeError(`cannot serialize value of type ${type}`);
  }
  if (Array.isArray(value)) {
    return renderArray(value, indent, seen);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  return renderObject(value, indent, seen);
}

function renderArray(value, indent, seen) {
  if (value.length === 0) {
    return '[]';
  }
  const innerIndent = `${indent}  `;
  const items = value.map((entry) => renderValue(entry, innerIndent, seen));
  return `[\n${innerIndent}${items.join(`,\n${innerIndent}`)}\n${indent}]`;
}

function renderObject(value, indent, seen) {
  if (seen.has(value)) {
    throw new WorkSpacifyTreeError('cannot serialize a circular reference');
  }
  seen.add(value);
  const keys = Object.keys(value).sort();
  const innerIndent = `${indent}  `;
  const entries = keys.map((key) => `${JSON.stringify(key)}: ${renderValue(value[key], innerIndent, seen)}`);
  seen.delete(value);
  if (entries.length === 0) {
    return '{}';
  }
  return `{\n${innerIndent}${entries.join(`,\n${innerIndent}`)}\n${indent}}`;
}
