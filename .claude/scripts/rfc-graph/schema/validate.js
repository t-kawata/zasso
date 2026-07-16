/**
 * validate.js — Generic function to load and validate against JSON Schema from a schema directory
 *
 * Designed to be called from crud.js (P13-2).
 * Uses Ajv Draft 2020-12 and returns structured errors using a 3-part template (error path, expected value, actual value).
 */

const AjvDraft2020 = require("ajv/dist/2020");
const path = require("path");
const fs = require("fs");

/**
 * Default path for the schema directory
 * Resolved relative to this file's location
 */
const DEFAULT_SCHEMAS_DIR = path.resolve(__dirname);

/**
 * Result of schema validation
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid — Whether validation succeeded
 * @property {string[]} [errors] — Array of 3-part template errors on validation failure
 */

/**
 * Validates specified data against a JSON Schema
 *
 * @param {Object} data — Data to validate
 * @param {string} schemaFileName — Schema file name (e.g. "node.schema.json")
 * @param {string} [schemasDir] — Absolute path to the directory containing schema files
 * @returns {ValidationResult} Validation result
 */
function validateAgainstSchema(data, schemaFileName, schemasDir) {
  // Resolve the schema directory
  const resolvedSchemasDir = schemasDir || DEFAULT_SCHEMAS_DIR;
  const schemaFilePath = path.resolve(resolvedSchemasDir, schemaFileName);

  // Check if schema file exists
  if (!fs.existsSync(schemaFilePath)) {
    return {
      valid: false,
      errors: [
        `schemaFile: ${schemaFileName}`,
        `expected: 存在するスキーマファイル`,
        `actual: ${schemaFilePath} が見つかりません`,
      ],
    };
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaFilePath, "utf-8"));
  } catch (parseError) {
    return {
      valid: false,
      errors: [
        `schemaFile: ${schemaFileName}`,
        `expected: 有効なJSON`,
        `actual: JSONパースエラー — ${parseError.message}`,
      ],
    };
  }

  // Create Ajv instance
  // allErrors: true — Collect all errors (don't stop at the first one)
  const ajv = new AjvDraft2020({ allErrors: true });

  // Pre-register dependent schemas (all schemas except the target, for $ref resolution)
  registerDependentSchemas(ajv, resolvedSchemasDir, schemaFileName);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (compileError) {
    return {
      valid: false,
      errors: [
        `schema: ${schemaFileName}`,
        `expected: 有効なJSON Schema`,
        `actual: スキーマコンパイルエラー — ${compileError.message}`,
      ],
    };
  }

  const isValid = validate(data);

  if (isValid) {
    return { valid: true };
  }

  // Structure error information in 3-part template
  const errors = validate.errors.map((err) => {
    const instancePath = err.instancePath || "/";
    const expectedMessage = err.message || "制約違反";
    const actualValue = JSON.stringify(
      instancePath === "/" ? data : getValueAtPath(data, instancePath)
    );
    return `${instancePath}: ${expectedMessage} (actual: ${actualValue})`;
  });

  return { valid: false, errors };
}

/**
 * Retrieves the value at a JSON Pointer-style path from an object
 *
 * @param {Object} obj — Object to search
 * @param {string} pathStr — JSON Pointer-style path (e.g. "/properties/name")
 * @returns {*} The matching value, or undefined
 */
function getValueAtPath(obj, pathStr) {
  if (pathStr === "" || pathStr === "/") {
    return obj;
  }

  const segments = pathStr.split("/").filter(Boolean);
  let current = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index
    const arrayIndex = /^\d+$/.test(segment) ? parseInt(segment, 10) : null;
    if (arrayIndex !== null && Array.isArray(current)) {
      current = current[arrayIndex];
    } else {
      current = current[segment];
    }
  }

  return current;
}

/**
 * Pre-registers all JSON Schema files except the target into Ajv
 *
 * Since graph.schema.json references node.schema.json / edge.schema.json via $ref,
 * dependent schemas must be registered before compilation.
 *
 * @param {object} ajv — Ajv instance
 * @param {string} schemasDir — Absolute path to the schema directory
 * @param {string} excludeFileName — Schema file name to exclude (the target itself)
 */
function registerDependentSchemas(ajv, schemasDir, excludeFileName) {
  let files;
  try {
    files = fs.readdirSync(schemasDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".schema.json") || file === excludeFileName) {
      continue;
    }
    const filePath = path.resolve(schemasDir, file);
    try {
      const schema = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      ajv.addSchema(schema);
    } catch {
      // Ignore individual schema registration failures (re-validated during compile)
    }
  }
}

module.exports = { validateAgainstSchema };
