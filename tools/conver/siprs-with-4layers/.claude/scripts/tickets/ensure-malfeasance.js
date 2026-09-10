/**
 * ensure-malfeasance.js — Initialize Malfeasance.json
 *
 * Creates an initial JSON with an empty records array if Malfeasance.json does not exist.
 * Does nothing if it already exists.
 *
 * Usage:
 *   node ensure-malfeasance.js               # create in CWD
 *   node ensure-malfeasance.js <directory>    # create in specified directory
 *
 * Output:
 *   on create: { "success": true, "action": "created", "path": "..." }
 *   on skip:   { "success": true, "action": "skipped", "path": "..." }
 *   on error:  { "success": false, "error": "..." }
 */

const fs = require('fs');
const path = require('path');

const { validateRecords } = require('../lib/validate-malfeasance');

const CLAUDE_DIR = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(CLAUDE_DIR, 'scripts', 'tickets', 'malfeasance-schema.json');

/**
 * Return the path to Malfeasance.json.
 * @param {string} [dir] - base directory
 * @returns {string}
 */
function getMalfeasancePath(dir) {
  return path.resolve(dir || process.cwd(), 'Malfeasance.json');
}

/**
 * Output JSON to stdout.
 * @param {object} result
 */
function output(result) {
  console.log(JSON.stringify(result));
}

/**
 * Execute initialization of Malfeasance.json.
 * @param {string} [targetDir] - target directory
 */
function main(targetDir) {
  const MALFEASANCE_PATH = getMalfeasancePath(targetDir);

  // Verify schema file exists
  if (!fs.existsSync(SCHEMA_PATH)) {
    output({ success: false, error: `Schema file not found at ${SCHEMA_PATH}` });
    return;
  }

  // Verify schema file parses
  try {
    const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    JSON.parse(schemaRaw);
  } catch (e) {
    output({ success: false, error: `Failed to parse schema file: ${e.message}` });
    return;
  }

  // Skip if Malfeasance.json already exists
  if (fs.existsSync(MALFEASANCE_PATH)) {
    output({ success: true, action: 'skipped', path: MALFEASANCE_PATH });
    return;
  }

  // Create initial data
  const initialData = { version: 1, records: [] };

  // Schema validation
  const validation = validateRecords(initialData);
  if (!validation.valid) {
    output({ success: false, error: `Schema validation failed: ${validation.errors.join('; ')}` });
    return;
  }

  // Verify directory exists
  const malfDir = path.dirname(MALFEASANCE_PATH);
  if (!fs.existsSync(malfDir)) {
    fs.mkdirSync(malfDir, { recursive: true });
  }

  // Write file
  try {
    fs.writeFileSync(MALFEASANCE_PATH, JSON.stringify(initialData, null, 2) + '\n', 'utf8');
  } catch (e) {
    output({ success: false, error: `Failed to write Malfeasance.json: ${e.message}` });
    return;
  }

  output({ success: true, action: 'created', path: MALFEASANCE_PATH });
}

if (require.main === module) {
  const targetDir = process.argv[2] || undefined;
  main(targetDir);
}
