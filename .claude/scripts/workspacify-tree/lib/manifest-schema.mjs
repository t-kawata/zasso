// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Minimal JSON Schema (draft 2020-12) validation implemented on the standard
 * library only.
 *
 * Supported keywords: type, properties, required, items, minItems, enum,
 * const, pattern. Unknown keywords are not silently ignored by the loader:
 * the schema author is expected to stay inside this subset.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMAS_DIR = fileURLToPath(new URL('../schemas/', import.meta.url));

/**
 * Load a schema JSON file by name from the schemas directory.
 *
 * @param {string} fileName - e.g. "workspacify-tree-manifest.schema.json"
 * @returns {object} parsed schema
 */
export function loadSchema(fileName) {
  const schemaText = readFileSync(`${SCHEMAS_DIR}${fileName}`, 'utf8');
  return JSON.parse(schemaText);
}

/**
 * Validate a value against a JSON Schema subset.
 *
 * @param {*} value - the value to validate
 * @param {object} schema - JSON Schema (subset)
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validateAgainstSchema(value, schema) {
  const errors = [];
  validateValue(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

function validateValue(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  if (schema.enum !== undefined && !schema.enum.some((entry) => equalValue(entry, value))) {
    errors.push({ path, message: 'value is not one of the allowed enum values' });
  }
  if (schema.const !== undefined && !equalValue(schema.const, value)) {
    errors.push({ path, message: `value does not equal const ${JSON.stringify(schema.const)}` });
  }
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path, message: `expected type ${schema.type}, got ${describeType(value)}` });
  }
  if (typeof value === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    errors.push({ path, message: `value does not match pattern ${schema.pattern}` });
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `array has fewer than ${schema.minItems} items` });
    }
    if (schema.items !== undefined) {
      value.forEach((entry, index) => validateValue(entry, schema.items, `${path}[${index}]`, errors));
    }
    return;
  }

  if (schema.properties !== undefined) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateValue(value[key], propertySchema, `${path}.${key}`, errors);
      }
    }
  }
  if (schema.required !== undefined) {
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push({ path, message: `missing required property "${key}"` });
      }
    }
  }
}

function matchesType(value, type) {
  if (type === 'array') {
    return Array.isArray(value);
  }
  if (type === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  if (type === 'null') {
    return value === null;
  }
  if (type === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return typeof value === type;
}

function describeType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
