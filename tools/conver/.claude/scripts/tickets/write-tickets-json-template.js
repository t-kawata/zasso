/**
 * write-tickets-json-template.js — Generate Tickets.json skeleton and validate schema
 *
 * phases is a fixed empty array structure. title and metadata come from 3rd argument.
 *
 * Usage:
 *   node write-tickets-json-template.js <PATH to Tickets.json> '<metadata-json>'
 *
 * metadata-json:
 *   {"title":"...","source":"...","generatedAt":"YYYY-MM-DD","analyzedSections":"...","resolvedPaths":{...}}
 */

const fs = require("fs");
const path = require("path");
const { validateTickets } = require("../lib/validate-tickets");

function main() {
  const jsonPath = process.argv[2];
  const dataJson = process.argv[3];

  if (!jsonPath || !dataJson) {
    console.log(
      JSON.stringify({
        success: false,
        error:
          "Usage: node write-tickets-json-template.js <PATH to Tickets.json> '<metadata-json>'",
      }),
    );
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(dataJson);
  } catch (e) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Failed to parse metadata JSON",
      }),
    );
    process.exit(1);
  }

  const skeleton = {
    title: data.title || "",
    metadata: {
      source: data.source || "",
      generatedAt: data.generatedAt || "",
      analyzedSections: data.analyzedSections || "",
      ...(data.resolvedPaths ? { resolvedPaths: data.resolvedPaths } : {}),
    },
    phases: [],
  };

  const resolvedPath = path.resolve(jsonPath);

  try {
    fs.writeFileSync(
      resolvedPath,
      JSON.stringify(skeleton, null, 2) + "\n",
      "utf8",
    );
  } catch (e) {
    console.log(
      JSON.stringify({ success: false, error: "Failed to write file" }),
    );
    process.exit(1);
  }

  const result = validateTickets(skeleton);
  if (!result.valid) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Schema validation failed",
        errors: result.errors,
      }),
    );
    process.exit(1);
  }

  console.log(JSON.stringify({ success: true, path: resolvedPath }));
}

if (require.main === module) main();
module.exports = { main };
