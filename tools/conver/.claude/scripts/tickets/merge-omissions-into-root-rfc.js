/**
 * merge-omissions-into-root-rfc.js — Mechanical helper script
 *
 * Design Contract:
 *   This script performs mechanical judgments only.
 *   It does NOT perform semantic merge decisions (which section N merges into which
 *   existing section, or how to rewrite section content).
 *   Those judgments are made by the AI following the .md command file instructions.
 *
 * [::STUB::] policy: no incomplete implementations may remain in this file.
 *   All functions must be fully implemented, exported, and testable.
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// Public API
// ============================================================

/**
 * Validate arguments. Check both files exist and parent-rfc consistency.
 * @param {string} sourcePath - Path to RFC-OMISSIONS-XXX.md
 * @param {string} targetPath - Path to RFC-ROOT.md
 * @returns {{success:boolean, error?:string}}
 */
function validateArgs(sourcePath, targetPath) {
  if (!sourcePath || !targetPath) {
    return { success: false, error: "第1引数(source)と第2引数(target)の両方が必要です" };
  }
  const sourceAbs = path.resolve(sourcePath);
  const targetAbs = path.resolve(targetPath);
  if (!fs.existsSync(sourceAbs)) {
    return { success: false, error: `ソースファイルが見つかりません: ${sourceAbs}` };
  }
  if (!fs.existsSync(targetAbs)) {
    return { success: false, error: `ターゲットファイルが見つかりません: ${targetAbs}` };
  }
  const fm = readFrontmatter(sourceAbs);
  if (fm && fm["parent-rfc"]) {
    const parentRfcResolved = path.resolve(path.dirname(sourceAbs), fm["parent-rfc"]);
    if (parentRfcResolved !== targetAbs) {
      return {
        success: false,
        error:
          `parent-rfc がターゲットと一致しません。` +
          `source の parent-rfc: ${fm["parent-rfc"]}` +
          ` (解決後: ${parentRfcResolved}), target: ${targetAbs}`,
      };
    }
  }
  return { success: true };
}

/**
 * Read YAML frontmatter from a Markdown file.
 * @param {string} filePath
 * @returns {object|null} frontmatter object, or null if not found
 */
function readFrontmatter(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) return null;
  const content = fs.readFileSync(absPath, "utf8");
  if (!content.startsWith("---")) return null;
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return null;
  const yamlBlock = content.slice(3, endIndex).trim();
  return parseSimpleYaml(yamlBlock);
}

/**
 * Rewrite (or add if missing) YAML frontmatter in a Markdown file.
 * @param {string} filePath
 * @param {object} data - Object to write as frontmatter
 */
function writeFrontmatter(filePath, data) {
  const absPath = path.resolve(filePath);
  const content = fs.readFileSync(absPath, "utf8");
  const yamlStr = objectToSimpleYaml(data);
  let newContent;
  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex !== -1) {
      const afterFm = content.slice(endIndex + 3);
      newContent = `---\n${yamlStr}\n---${afterFm}`;
    } else {
      newContent = `---\n${yamlStr}\n---\n${content}`;
    }
  } else {
    newContent = `---\n${yamlStr}\n---\n${content}`;
  }
  fs.writeFileSync(absPath, newContent, "utf8");
}

/**
 * Append a merge-history entry to the target RFC frontmatter.
 * Skip if an entry for the same sourcePath already exists.
 * @param {string} targetPath - Path to RFC-ROOT.md
 * @param {string} sourcePath - Source file name for merge
 * @param {string[]} resolvedIds - Array of resolved omission IDs
 * @param {string} [date] - Date string (YYYY-MM-DD), defaults to today
 * @returns {{success:boolean, error?:string, skipped?:boolean}}
 */
function addMergeHistory(targetPath, sourcePath, resolvedIds, date) {
  const targetAbs = path.resolve(targetPath);
  if (!fs.existsSync(targetAbs)) {
    return { success: false, error: `ターゲットファイルが見つかりません: ${targetAbs}` };
  }
  const fm = readFrontmatter(targetAbs) || {};
  const history = fm["merge-history"] || [];

  const alreadyExists = history.some(
    (entry) => (entry.source || "").trim() === sourcePath.trim(),
  );
  if (alreadyExists) {
    return {
      success: false,
      error: `重複: ${sourcePath} は既に merge-history に存在します`,
      skipped: true,
    };
  }

  history.push({
    date: date || new Date().toISOString().slice(0, 10),
    source: sourcePath,
    resolved: resolvedIds,
  });
  fm["merge-history"] = history;
  writeFrontmatter(targetAbs, fm);
  return { success: true };
}

/**
 * Extract ### section N sections from an RFC-OMISSIONS file.
 * @param {string} filePath - Path to RFC-OMISSIONS-XXX.md
 * @returns {{success:boolean, count?:number, sections?:Array, error?:string}}
 */
function extractSections(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return { success: false, error: `ファイルが見つかりません: ${absPath}` };
  }
  const content = fs.readFileSync(absPath, "utf8");
  const sections = [];
  const sectionRegex = /^###\s+§(\d+)\s+(.+)$/gm;
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionStart = match.index;
    const sectionNumber = match[1];
    const sectionTitle = match[2].trim();
    const omissionMatch = sectionTitle.match(/[（(]([^）)]+)[）)]$/);
    const omissionId = omissionMatch ? omissionMatch[1] : null;

    const afterHeader = sectionStart + match[0].length;
    const nextSectionRegex = /^### /gm;
    nextSectionRegex.lastIndex = afterHeader;
    const nextMatch = nextSectionRegex.exec(content);
    const sectionContent = nextMatch
      ? content.slice(afterHeader, nextMatch.index).trim()
      : content.slice(afterHeader).trim();

    sections.push({
      id: `§${sectionNumber}`,
      number: parseInt(sectionNumber, 10),
      title: sectionTitle,
      omissionId,
      content: sectionContent,
    });
  }
  return { success: true, count: sections.length, sections };
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Simple YAML parser (for frontmatter, handles merge-history nested structure).
 */
function parseSimpleYaml(yamlBlock) {
  const result = {};
  const lines = yamlBlock.split("\n");
  let currentKey = null;
  let pendingIndent = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (indent === 0) {
      pendingIndent = 0;
      const keyMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();
        if (value === "" || value === "|" || value === ">") {
          // Value follows on subsequent lines
          result[currentKey] = [];
        } else if (value.startsWith("[") && value.endsWith("]")) {
          result[currentKey] = value
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        } else {
          result[currentKey] = value.replace(/^["']|["']$/g, "");
        }
      }
    } else if (indent === 2 && trimmed.startsWith("- ")) {
      // Array string element
      const item = trimmed.slice(2).replace(/^["']|["']$/g, "");
      if (currentKey && Array.isArray(result[currentKey])) {
        result[currentKey].push(item);
      }
    } else if (indent === 2 && trimmed === "-") {
      // Array object element (empty hyphen)
      if (currentKey && Array.isArray(result[currentKey])) {
        result[currentKey].push({});
      }
    } else if (indent === 4) {
      // Object array property (e.g., date/source/resolved)
      const objMatch = trimmed.match(/^([\w-]+):\s*(.*)$/);
      if (objMatch && currentKey && Array.isArray(result[currentKey])) {
        const arr = result[currentKey];
        if (arr.length === 0 || typeof arr[arr.length - 1] !== "object") {
          arr.push({});
        }
        const lastObj = arr[arr.length - 1];
        const objValue = objMatch[2].trim();
        if (objValue === "") {
          lastObj[objMatch[1]] = [];
        } else if (objValue.startsWith("[") && objValue.endsWith("]")) {
          lastObj[objMatch[1]] = objValue
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        } else {
          lastObj[objMatch[1]] = objValue.replace(/^["']|["']$/g, "");
        }
      }
    } else if (indent === 6 && trimmed.startsWith("- ")) {
      // Array element inside object array (e.g., resolved values)
      const item = trimmed.slice(2).replace(/^["']|["']$/g, "");
      if (currentKey && Array.isArray(result[currentKey])) {
        const arr = result[currentKey];
        if (arr.length > 0 && typeof arr[arr.length - 1] === "object") {
          const lastObj = arr[arr.length - 1];
          const objKeys = Object.keys(lastObj);
          if (objKeys.length > 0) {
            const lastKey = objKeys[objKeys.length - 1];
            if (Array.isArray(lastObj[lastKey])) {
              lastObj[lastKey].push(item);
            }
          }
        }
      }
    }
  }
  return result;
}

/**
 * Convert object to a simple YAML string (handles merge-history nested structure).
 */
function objectToSimpleYaml(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (typeof value[0] === "object" && value[0] !== null) {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  -`);
          for (const [k, v] of Object.entries(item)) {
            if (Array.isArray(v)) {
              lines.push(`    ${k}:`);
              for (const vi of v) {
                lines.push(`      - ${vi}`);
              }
            } else {
              lines.push(`    ${k}: ${v}`);
            }
          }
        }
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${v}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

// ============================================================
// CLI entry point
// ============================================================

function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "validate":
      return cliResult(validateArgs(process.argv[3], process.argv[4]));
    case "frontmatter":
      return cliResult(readFrontmatter(process.argv[3]));
    case "add-history":
      return cliResult(
        addMergeHistory(
          process.argv[3],
          process.argv[4],
          process.argv[5] ? process.argv[5].split(",") : [],
          process.argv[6],
        ),
      );
    case "extract":
      return cliResult(extractSections(process.argv[3]));
    case "list-sections": {
      const sr = extractSections(process.argv[3]);
      if (!sr.success) {
        console.log(JSON.stringify(sr));
        process.exit(1);
      }
      console.log("=== 抽出されたセクション ===");
      for (const s of sr.sections) {
        const oid = s.omissionId || "N/A";
        const lines = s.content.split("\n").length;
        console.log(`  ${s.id} ${s.title} [${oid}]`);
        console.log(`    → ${lines}行`);
      }
      return;
    }
    case "list-omissions": {
      const sr2 = extractSections(process.argv[3]);
      if (!sr2.success) {
        console.log(JSON.stringify(sr2));
        process.exit(1);
      }
      for (const s of sr2.sections) {
        const oid = s.omissionId || "N/A";
        console.log(`  [${oid}] ${s.title}`);
      }
      return;
    }
    default:
      return cliResult({
        success: false,
        error:
          "Usage: node merge-omissions-into-root-rfc.js <validate|frontmatter|add-history|extract|list-sections|list-omissions> ...",
      });
  }
}

function cliResult(result) {
  console.log(JSON.stringify(result));
  if (result && result.success === false && !result.skipped) {
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = {
  validateArgs,
  readFrontmatter,
  writeFrontmatter,
  addMergeHistory,
  extractSections,
};
