/**
 * OMISSIONS JSON schema validation
 *
 * Validates OMISSIONS JSON schema using the same pattern as validate-tickets.js.
 * Hand-written validator with no external dependencies like ajv.
 */

const fs = require("fs");
const path = require("path");

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const O_ID_RE = /^O-\d{3}$/;
const ALLOWED_TYPES = [
  "missing_implementation",
  "incomplete_implementation",
  "design_deviation",
  "bug",
  "stub_remaining",
  "test_missing",
  "inconsistency",
];
const ALLOWED_SEVERITIES = ["critical", "high", "medium", "low"];

/**
 * Validate the entire OMISSIONS JSON.
 * @param {*} data - Parsed JSON object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOmissions(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push("Root must be a non-null object");
    return { valid: false, errors };
  }

  if (!data.parentRfcPath || typeof data.parentRfcPath !== "string") {
    errors.push("parentRfcPath: must be a non-empty string");
  }

  if (
    !data.generatedAt ||
    typeof data.generatedAt !== "string" ||
    !ISO_RE.test(data.generatedAt)
  ) {
    errors.push("generatedAt: must be YYYY-MM-DD format");
  }

  if (
    data.parentRfcTitle !== undefined &&
    typeof data.parentRfcTitle !== "string"
  ) {
    errors.push("parentRfcTitle: must be a string");
  }

  if (data.summary !== undefined && typeof data.summary !== "string") {
    errors.push("summary: must be a string");
  }

  // rfcUnderstanding (optional)
  if (data.rfcUnderstanding !== undefined) {
    if (typeof data.rfcUnderstanding !== "object" || Array.isArray(data.rfcUnderstanding)) {
      errors.push("rfcUnderstanding: must be an object");
    } else {
      const strFields = [
        "purpose", "goals", "successCriteria", "nonScope",
        "architecture", "componentRelations", "designDecisions",
        "typeDefinitions", "apiSignatures", "dependencyGraph",
        "externalDependencies", "testRequirements", "errorHandling",
        "configuration"
      ];
      for (const f of strFields) {
        if (data.rfcUnderstanding[f] !== undefined && typeof data.rfcUnderstanding[f] !== "string") {
          errors.push("rfcUnderstanding." + f + ": must be a string");
        }
      }
    }
  }

  // steps (optional)
  if (data.steps !== undefined) {
    if (!Array.isArray(data.steps)) {
      errors.push("steps: must be an array");
    } else {
      validateSteps(data.steps, "steps", errors);
    }
  }

  if (!Array.isArray(data.omissions)) {
    errors.push("omissions: must be an array");
    return { valid: false, errors };
  }

  const seenIds = {};
  for (let i = 0; i < data.omissions.length; i++) {
    const o = data.omissions[i];
    const prefix = "omissions[" + i + "]";

    if (!o || typeof o !== "object" || Array.isArray(o)) {
      errors.push(prefix + ": must be an object");
      continue;
    }

    if (!o.id || typeof o.id !== "string" || !O_ID_RE.test(o.id)) {
      errors.push(prefix + '.id: must match pattern O-XXX (e.g. O-001)');
    } else {
      if (seenIds[o.id]) {
        errors.push(prefix + ".id (" + o.id + "): duplicate");
      }
      seenIds[o.id] = true;
    }

    if (!o.type || !ALLOWED_TYPES.includes(o.type)) {
      errors.push(
        prefix + ".type: must be one of " + ALLOWED_TYPES.join(", ")
      );
    }

    if (!o.description || typeof o.description !== "string") {
      errors.push(prefix + ".description: must be a non-empty string");
    }

    if (o.severity !== undefined && !ALLOWED_SEVERITIES.includes(o.severity)) {
      errors.push(
        prefix + ".severity: must be one of " + ALLOWED_SEVERITIES.join(", ")
      );
    }

    if (o.rfcSection !== undefined && typeof o.rfcSection !== "string") {
      errors.push(prefix + ".rfcSection: must be a string");
    }

    if (o.details !== undefined && typeof o.details !== "string") {
      errors.push(prefix + ".details: must be a string");
    }

    if (o.affectedFiles !== undefined) {
      if (!Array.isArray(o.affectedFiles)) {
        errors.push(prefix + ".affectedFiles: must be an array");
      } else {
        for (let k = 0; k < o.affectedFiles.length; k++) {
          if (typeof o.affectedFiles[k] !== "string") {
            errors.push(prefix + ".affectedFiles[" + k + "]: must be a string");
          }
        }
      }
    }

    if (
      o.suggestedResolution !== undefined &&
      typeof o.suggestedResolution !== "string"
    ) {
      errors.push(prefix + ".suggestedResolution: must be a string");
    }

    if (
      o.resolvedInNextRfc !== undefined &&
      typeof o.resolvedInNextRfc !== "boolean"
    ) {
      errors.push(prefix + ".resolvedInNextRfc: must be a boolean");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Recursively validate the steps array.
 * @param {Array} steps
 * @param {string} prefix - Error message prefix
 * @param {string[]} errors - Error accumulation array
 */
function validateSteps(steps, prefix, errors) {
  const ALLOWED_STATUSES = ["todo", "in_progress", "done"];
  const seenIds = {};
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const sp = prefix + "[" + i + "]";
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      errors.push(sp + ": must be an object");
      continue;
    }
    if (!s.id || typeof s.id !== "string") {
      errors.push(sp + ".id: required string");
    } else {
      if (seenIds[s.id]) errors.push(sp + ".id (" + s.id + "): duplicate");
      seenIds[s.id] = true;
    }
    if (!s.label || typeof s.label !== "string") {
      errors.push(sp + ".label: required string");
    }
    if (!s.status || !ALLOWED_STATUSES.includes(s.status)) {
      errors.push(sp + ".status: must be one of " + ALLOWED_STATUSES.join(", "));
    }
    if (s.children !== undefined) {
      if (!Array.isArray(s.children)) {
        errors.push(sp + ".children: must be an array");
      } else {
        validateSteps(s.children, sp + ".children", errors);
      }
    }
  }
}

function main() {
  const fp = process.argv[2];

  if (!fp) {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let inputData;
      try {
        inputData = JSON.parse(raw);
      } catch (e) {
        console.log(JSON.stringify({ success: false, error: "Invalid JSON: " + e.message }));
        process.exit(1);
      }
      const r = validateOmissions(inputData);
      if (!r.valid) {
        console.log(JSON.stringify({ success: false, error: "Validation failed", errors: r.errors }));
        process.exit(1);
      }
      console.log(JSON.stringify({ success: true, valid: true }));
      process.exit(0);
    });
    return;
  }

  const rp = path.resolve(fp);
  if (!fs.existsSync(rp)) {
    console.log(JSON.stringify({ success: false, error: "File not found: " + fp }));
    process.exit(1);
  }
  let inputData;
  try {
    inputData = JSON.parse(fs.readFileSync(rp, "utf8"));
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: "Invalid JSON: " + e.message }));
    process.exit(1);
  }
  const r = validateOmissions(inputData);
  if (!r.valid) {
    console.log(JSON.stringify({ success: false, error: "Validation failed", errors: r.errors }));
    process.exit(1);
  }
  console.log(JSON.stringify({ success: true, valid: true }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { validateOmissions };
