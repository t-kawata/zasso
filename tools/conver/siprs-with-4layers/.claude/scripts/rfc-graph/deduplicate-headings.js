#!/usr/bin/env node

/**
 * deduplicate-headings.js — Heading deduplication (graphify-rfc Step 0)
 *
 * Extracts all heading lines (^#{1,6}\s+) from a source Markdown document.
 * When multiple headings at the same level have identical text, appends
 * " A", " B", ... " Z" to make heading-based references (headingRefs) uniquely resolvable.
 *
 * CLI: deduplicate-headings.js <source-path>
 *
 * Output contract:
 *   Normal case → outputs change status to stdout (exit code 0)
 *   Error case → outputs 3-part template to stderr (exit code 1)
 */

const fs = require('fs');

const MAX_DUPLICATES = 26;

function exitWithError(summary, cause, action) {
  process.stderr.write(`[ERROR] ${summary}\nCause: ${cause}\nAction: ${action}\n`);
  process.exit(1);
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError('Source file not found.', `${filePath} does not exist.`, 'Specify a valid file path.');
  }
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

/**
 * Detect duplicate heading texts at the same level and append A-Z
 *
 * @param {string[]} lines — Array of file lines
 * @returns {{ result: string[], modified: boolean, changes: string[] }}
 */
function deduplicateHeadings(lines) {
  const seen = {}; // key: "level:text" -> count
  const changes = [];

  const result = lines.map((line, i) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (!match) return line;

    const level = match[1].length;
    const text = match[2].trim();
    const key = `${level}:${text}`;

    if (seen[key] === undefined) {
      seen[key] = 0;
      return line;
    }

    seen[key]++;
    const count = seen[key];
    if (count > MAX_DUPLICATES) {
      throw new Error(
        `Heading duplicates exceeded 27 entries.\n` +
        `  heading: ${'#'.repeat(level)} ${text}\n` +
        `  line: ${i + 1}\n` +
        `  Action: Manually split or rename the headings.`
      );
    }

    const suffix = ' ' + String.fromCharCode(64 + count); // A=65, B=66, etc.
    const newLine = `${'#'.repeat(level)} ${text}${suffix}`;
    changes.push(`L${i + 1}: "${line}" → "${newLine}"`);
    return newLine;
  });

  return { result: result, modified: changes.length > 0, changes };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    console.log('Usage: deduplicate-headings.js <source-path>');
    console.log('Appends A-Z to duplicate headings in the source file.');
    process.exit(args[0] === '--help' || args[0] === '-h' ? 0 : 1);
  }

  const lines = readLines(args[0]);
  const { result, modified, changes } = deduplicateHeadings(lines);

  if (modified) {
    fs.writeFileSync(args[0], result.join('\n'), 'utf8');
    console.log(`[Modified] Suffix added to ${changes.length} duplicate heading(s).`);
    changes.forEach(c => console.log(`  ${c}`));
  } else {
    console.log('No duplicate headings found. No changes made.');
  }
}

module.exports = { deduplicateHeadings, readLines };

if (require.main === module) main();
