#!/usr/bin/env node
/**
 * update-split-rfc-status.js — /split-rfc-to-children の進捗ステータスを更新
 *
 * 使用例:
 *   node update-split-rfc-status.js RFC-TREE.json 6 done
 *   node update-split-rfc-status.js RFC-TREE.json 3a-1 in_progress
 */
var fs = require("fs");
var path = require("path");

var VALID_STATUSES = ["pending", "in_progress", "done"];

var VALID_STEP_IDS = [
  "0", "1", "2", "3",
  "3a-1", "3a-2", "3b", "3c-1", "3c-2", "3-review",
  "4", "5", "6", "7", "8", "9", "10", "11", "12"
];

/**
 * stepId が有効か検証する。
 */
function validateStepId(stepId) {
  return VALID_STEP_IDS.indexOf(stepId) !== -1;
}

/**
 * newStatus が有効か検証する。
 */
function validateStatus(newStatus) {
  return VALID_STATUSES.indexOf(newStatus) !== -1;
}

/**
 * RFC-TREE.json の split_status.steps[stepId] を更新する。
 */
function updateStatus(treePath, stepId, newStatus) {
  var resolved = path.resolve(treePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: "File not found: " + resolved };
  }

  if (!validateStepId(stepId)) {
    return { success: false, error: "Invalid stepId: " + stepId + ". Valid: " + VALID_STEP_IDS.join(", ") };
  }
  if (!validateStatus(newStatus)) {
    return { success: false, error: "Invalid status: " + newStatus + ". Valid: " + VALID_STATUSES.join(", ") };
  }

  var data = JSON.parse(fs.readFileSync(resolved, "utf8"));

  if (!data.split_status) {
    return { success: false, error: "RFC-TREE.json has no split_status field" };
  }
  if (!data.split_status.steps) {
    return { success: false, error: "RFC-TREE.json has no split_status.steps field" };
  }
  if (data.split_status.steps[stepId] === undefined) {
    return { success: false, error: "Step " + stepId + " not found in split_status.steps" };
  }

  data.split_status.steps[stepId] = newStatus;
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2) + "\n", "utf8");

  return { success: true, stepId: stepId, newStatus: newStatus };
}

// === メイン ===
function main() {
  var args = process.argv.slice(2);
  if (args.length < 3) {
    var usage = "Usage: node update-split-rfc-status.js <RFC-TREE.json> <stepId> <newStatus>\n";
    usage += "  stepId: " + VALID_STEP_IDS.join(", ") + "\n";
    usage += "  newStatus: " + VALID_STATUSES.join(", ");
    console.log(JSON.stringify({ success: false, error: usage }));
    process.exit(1);
  }

  var result = updateStatus(args[0], args[1], args[2]);
  console.log(JSON.stringify(result));
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) { main(); }
module.exports = { updateStatus: updateStatus, validateStepId: validateStepId, validateStatus: validateStatus };
