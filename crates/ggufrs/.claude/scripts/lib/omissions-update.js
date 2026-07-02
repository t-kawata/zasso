/**
 * OMISSIONS フィールド更新の共通処理。
 * add-omissions-*.js 系スクリプトから利用される。
 */
const fs = require("fs");
const path = require("path");

/**
 * OMISSIONS JSON の指定フィールドを更新する。
 * @param {string} omPath - OMISSIONS ファイルのパス
 * @param {object} updates - 更新するフィールドのキー・値マップ
 * @param {string} [parentKey] - 親キー（例: "rfcUnderstanding"）
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
 * ステップの実効的な status を計算する。
 * 子を持つステップの場合、子の status から動的に導出する：
 * - 全子が "done" → "done"
 * - いずれかの子が "in_progress" → "in_progress"
 * - 上記以外 → "todo"
 * 葉（子なし）のステップは自身の status をそのまま返す。
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
