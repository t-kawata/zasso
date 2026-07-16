/**
 * Common processing for OMISSIONS field updates.
 * Used by add-omissions-*.js scripts.
 */
const fs = require("fs");
const path = require("path");

/**
 * Update the specified field in an OMISSIONS JSON.
 * @param {string} omPath - Path to the OMISSIONS file
 * @param {object} updates - Key-value map of fields to update
 * @param {string} [parentKey] - Parent key (e.g. "rfcUnderstanding")
 */
function updateOmissionsField(omPath, updates, parentKey) {
  const resolved = path.resolve(omPath);
  if (!fs.existsSync(resolved)) return { success: false, error: "File not found: " + omPath };
  let data;
  try { data = JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch (e) { return { success: false, error: "Invalid JSON: " + e.message }; }
  const target = parentKey ? (data[parentKey] || (data[parentKey] = {})) : data;
  for (const [key, value] of Object.entries(updates)) target[key] = value;
  try {
    const { validateOmissions } = require("../lib/validate-omissions");
    const r = validateOmissions(data);
    if (!r.valid) return { success: false, error: "Validation failed", errors: r.errors };
  } catch (e) { return { success: false, error: "Validation error: " + e.message }; }
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2) + "\n");
  return { success: true, written: Object.keys(updates) };
}

function mainGeneric(allowedFields, scriptName, parentKey) {
  const omPath = process.argv[2];
  if (!omPath) { console.log(JSON.stringify({success:false,error:"Usage: echo '{...}' | node "+scriptName+".js <OMISSIONS_FILE_PATH>"})); process.exit(1); }
  const chunks = [];
  process.stdin.on("data", c => chunks.push(c));
  process.stdin.on("end", () => {
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { console.log(JSON.stringify({success:false,error:"Invalid JSON: "+e.message})); process.exit(1); }
    const updates = {};
    for (const f of allowedFields) { if (input[f] !== undefined) updates[f] = input[f]; }
    if (Object.keys(updates).length === 0) { console.log(JSON.stringify({success:false,error:"No valid fields. Allowed: "+allowedFields.join(", ")})); process.exit(1); }
    const result = updateOmissionsField(omPath, updates, parentKey);
    if (!result.success) { console.log(JSON.stringify(result)); process.exit(1); }
    console.log(JSON.stringify(result)); process.exit(0);
  });
}

/**
 * Calculate the effective status of a step.
 * For steps with children, dynamically derive from children's status:
 * - All children "done" → "done"
 * - Any child "in_progress" → "in_progress"
 * - Otherwise → "todo"
 * Leaf steps (no children) return their own status unchanged.
 * @param {{ status?: string, children?: Array }} step
 * @returns {string} "done" | "in_progress" | "todo"
 */
function computeEffectiveStatus(step) {
  if (!step.children || step.children.length === 0) {
    return step.status || "todo";
  }
  const childStatuses = step.children.map(c => computeEffectiveStatus(c));
  if (childStatuses.every(s => s === "done")) return "done";
  if (childStatuses.some(s => s === "in_progress")) return "in_progress";
  return "todo";
}

module.exports = { updateOmissionsField, mainGeneric, computeEffectiveStatus };
