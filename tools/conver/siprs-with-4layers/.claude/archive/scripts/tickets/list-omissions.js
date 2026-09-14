/**
 * Displays an OMISSIONS JSON file in checklist format.
 *
 * Usage: node list-omissions.js <path-to-omissions.json>
 * Output (stdout): Checklist-formatted text
 * Output (stderr): JSON metadata
 */

const fs = require("fs");
const path = require("path");

const SEVERITY_MAP = {
  critical: "!!",
  high: "!",
  medium: "-",
  low: " ",
};

function listOmissions(filePath) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: "File not found: " + filePath };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (e) {
    return { success: false, error: "Invalid JSON: " + e.message };
  }

  if (!data.omissions || !Array.isArray(data.omissions)) {
    return { success: false, error: "Missing or invalid omissions array" };
  }

  const lines = [];
  if (data.parentRfcPath) {
    lines.push("親RFC: " + data.parentRfcPath);
    lines.push("");
  }

  for (const o of data.omissions) {
    const sev = SEVERITY_MAP[o.severity] || " ";
    const suffix = o.rfcSection ? " §" + o.rfcSection : "";
    lines.push("[" + sev + "] " + o.id + " [" + o.type + "]" + suffix + ": " + o.description);
    if (o.affectedFiles && o.affectedFiles.length > 0) {
      for (const af of o.affectedFiles) {
        lines.push("      " + af);
      }
    }
  }

  return {
    success: true,
    output: lines.join("\n"),
    count: data.omissions.length,
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node list-omissions.js <path-to-omissions.json>" }));
    process.exit(1);
  }

  const result = listOmissions(filePath);
  if (!result.success) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  // Human-readable output goes to stdout, JSON metadata to stderr
  console.log(result.output);
  console.error(JSON.stringify({ success: true, count: result.count }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { listOmissions };
