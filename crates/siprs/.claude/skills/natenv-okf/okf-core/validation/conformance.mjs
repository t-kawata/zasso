/**
 * OKF conformance: exactly the three conditions in the specification.
 *
 * Broken links, unknown types, unknown keys, and a missing index are not
 * conformance failures. They belong to lint or profile.
 */

export function validateConformance(bundle) {
  const findings = [];
  for (const concept of bundle.concepts) {
    if (!concept.hasFrontmatter) {
      findings.push(finding('FRONTMATTER_MISSING', concept.path, 'non-reserved .md has no frontmatter'));
      continue;
    }
    if (concept.frontmatterError) {
      findings.push(finding('FRONTMATTER_INVALID', concept.path, concept.frontmatterError.message, concept.frontmatterError));
      continue;
    }
    if (typeof concept.type !== 'string' || concept.type.trim().length === 0) {
      findings.push(finding('TYPE_EMPTY', concept.path, 'frontmatter type is empty'));
    }
  }
  for (const reserved of bundle.reserved) {
    if (reserved.kind === 'index' && !isIndexStructure(reserved)) {
      findings.push(finding('INDEX_STRUCTURE_INVALID', reserved.path, 'index must be a heading plus a linked list'));
    }
    if (reserved.kind === 'log' && !isLogStructure(reserved)) {
      findings.push(finding('LOG_STRUCTURE_INVALID', reserved.path, 'log headings must be YYYY-MM-DD in descending order'));
    }
  }
  return findings;
}

function finding(code, path, message, position) {
  return { code, path, message, line: position?.line, column: position?.column };
}

export function bodyLines(file) {
  const lines = String(file.text ?? '').split('\n');
  return lines.slice(Math.max(0, (file.bodyStartLine ?? 1) - 1));
}

function isIndexStructure(file) {
  const lines = bodyLines(file);
  const hasHeading = lines.some((line) => /^#{1,6}\s+\S/.test(line));
  const hasLinkedItem = lines.some((line) => /^\s*[-*+]\s+.*\[[^\]]+\]\([^)]+\)/.test(line));
  return hasHeading && hasLinkedItem;
}

function isLogStructure(file) {
  const headingLines = bodyLines(file).filter((line) => /^##\s+/.test(line));
  const dates = [];
  for (const line of headingLines) {
    const match = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (!match) return false;
    dates.push(match[1]);
  }
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index] > dates[index - 1]) return false;
  }
  return true;
}
