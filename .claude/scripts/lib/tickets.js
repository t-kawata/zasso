/**
 * Ticket system common utilities
 *
 * Provides common processing shared across all ticket scripts.
 * File operations, frontmatter parsing, slug generation, status transition validation, etc.
 */

const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./ticket-config");

const CFG = loadConfig();

// ============================================================
// ID Utilities
// ============================================================

/**
 * Validate that ticket_id is a positive integer.
 * @param {*} value - Value to validate
 * @returns {number|null} Numeric if valid, null if invalid
 */
function validateTicketId(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/**
 * Format ticket_id as a zero-padded string.
 * @param {number} id - Ticket ID
 * @returns {string} Formatted like "0042"
 */
function formatTicketId(id) {
  return String(id).padStart(CFG.idPadding, "0");
}

/**
 * Find the next available ticket_id from the specs directory.
 * Returns max existing + 1, or 1 if none exist.
 * @param {string} specsDir - Absolute path to specs directory
 * @returns {number}
 */
function findNextTicketId(specsDir) {
  if (!fs.existsSync(specsDir)) return 1;
  const files = fs.readdirSync(specsDir);
  let max = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)-/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (id > max) max = id;
    }
  }
  return max + 1;
}

// ============================================================
// Slug Utilities
// ============================================================

/**
 * Generate a slug (kebab-case) from a title.
 * @param {string} title - Ticket title
 * @returns {string}
 */
function generateSlug(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/**
 * Generate a unique slug that does not conflict with existing slugs.
 * Appends "-2", "-3" suffixes on collision.
 * @param {string} slug - Base slug
 * @param {string[]} existingSlugs - List of existing slugs
 * @returns {string}
 */
function makeUniqueSlug(slug, existingSlugs) {
  if (!existingSlugs.includes(slug)) return slug;
  let counter = 2;
  while (existingSlugs.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

/**
 * Get all slugs from the specs directory.
 * @param {string} specsDir
 * @returns {string[]}
 */
function collectSlugs(specsDir) {
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const match = f.match(/^\d+-(.+)\.md$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
}

// ============================================================
// Path Resolution
// ============================================================

/**
 * Resolve the absolute path of a spec file for the given ticket_id.
 * @param {string} specsDir - Absolute path to specs directory
 * @param {number} ticketId
 * @param {string} [slug] - Slug to use if not yet created
 * @returns {{ path: string, exists: boolean }}
 */
function resolveSpecPath(specsDir, ticketId, slug) {
  const prefix = formatTicketId(ticketId);
  if (fs.existsSync(specsDir)) {
    const files = fs.readdirSync(specsDir);
    const found = files.find((f) => f.startsWith(prefix) && f.endsWith(".md"));
    if (found) {
      return { path: path.join(specsDir, found), exists: true };
    }
  }
  const filename = slug ? `${prefix}-${slug}.md` : `${prefix}-untitled.md`;
  return { path: path.join(specsDir, filename), exists: false };
}

/**
 * Resolve the absolute path of a spec file using the new naming convention.
 *
 * All paths (create-spec.js / ensure-ticket.js / show-ticket-context.js /
 * dump-node-context-to-spec.js / dump-ticket-graph-commands.js / make-ticket.md）
 * use this function, unified to {ticketsDir}/specs/{ticketKey}.md.
 *
 * @param {string} ticketsDir - Tickets.json directory (absolute path)
 * @param {string} ticketKey - Ticket key (e.g. "P0-1", "PX-5")
 * @returns {string} Absolute path to spec file
 */
function resolveTicketSpecPath(ticketsDir, ticketKey) {
  return path.resolve(ticketsDir, 'specs', ticketKey + '.md');
}

/**
 * Resolve all related paths for the given ticket_id.
 * @param {number} ticketId
 * @param {string} [slug]
 * @returns {{ specPath: string, contextDir: string, draftPath: string, specExists: boolean }}
 */
function resolveAllPaths(ticketId, slug) {
  const prefix = formatTicketId(ticketId);
  const specsDir = path.resolve(CFG.specsDir);
  const { path: specPath, exists: specExists } = resolveSpecPath(
    specsDir,
    ticketId,
    slug,
  );

  let resolvedSlug = slug;
  if (!resolvedSlug && specExists) {
    const basename = path.basename(specPath, ".md");
    const match = basename.match(/^\d+-(.+)$/);
    if (match) resolvedSlug = match[1];
  }
  const slugPart = resolvedSlug || "untitled";
  const contextDir = path.resolve(CFG.contextDir, `${prefix}-${slugPart}`);
  const draftPath = path.resolve(CFG.draftsDir, `${prefix}-${slugPart}.md`);

  return { specPath, contextDir, draftPath, specExists };
}

// ============================================================
// Frontmatter Utilities
// ============================================================

/**
 * Extract YAML frontmatter from Markdown body.
 * @param {string} content - Full file content
 * @returns {{ attrs: object|null, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { attrs: null, body: content };
  }
  const yamlStr = match[1];
  const body = match[2] || "";
  const attrs = {};
  for (const line of yamlStr.split("\n")) {
    const kv = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      if (/^\d+$/.test(value)) {
        attrs[kv[1]] = parseInt(value, 10);
      } else {
        attrs[kv[1]] = value;
      }
    }
  }
  return { attrs: Object.keys(attrs).length > 0 ? attrs : null, body };
}

/**
 * Convert a frontmatter object to a YAML string.
 * @param {object} data
 * @returns {string}
 */
function stringifyFrontmatter(data) {
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/**
 * Read frontmatter from a file.
 * @param {string} filePath
 * @returns {{ attrs: object|null, body: string }}
 */
function readFrontmatterFromFile(filePath) {
  if (!fs.existsSync(filePath)) return { attrs: null, body: "" };
  const content = fs.readFileSync(filePath, "utf8");
  return parseFrontmatter(content);
}

/**
 * Overwrite-save all frontmatter attributes of a file.
 * @param {string} filePath
 * @param {object} newAttrs
 */
function writeFrontmatter(filePath, newAttrs) {
  if (!fs.existsSync(filePath)) {
    const yaml = stringifyFrontmatter(newAttrs);
    fs.writeFileSync(filePath, `---\n${yaml}\n---\n\n`);
    return;
  }
  const { body } = readFrontmatterFromFile(filePath);
  const yaml = stringifyFrontmatter(newAttrs);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

/**
 * Read a specific frontmatter field.
 * @param {string} filePath
 * @param {string} field
 * @returns {*|null}
 */
function readField(filePath, field) {
  const { attrs } = readFrontmatterFromFile(filePath);
  return attrs ? attrs[field] : null;
}

/**
 * Update a specific frontmatter field (preserves others).
 * @param {string} filePath
 * @param {string} field
 * @param {*} value
 */
function writeField(filePath, field, value) {
  const { attrs, body } = readFrontmatterFromFile(filePath);
  const merged = { ...(attrs || {}), [field]: value };
  const yaml = stringifyFrontmatter(merged);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

/**
 * Batch-update multiple frontmatter fields in a file.
 * @param {string} filePath
 * @param {object} updates
 */
function updateFrontmatterFields(filePath, updates) {
  const { attrs, body } = readFrontmatterFromFile(filePath);
  const merged = { ...(attrs || {}), ...updates };
  const yaml = stringifyFrontmatter(merged);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

// ============================================================
// Spec File Utilities
// ============================================================

/**
 * Read a spec file split into frontmatter and body.
 * @param {string} filePath
 * @returns {{ frontmatter: object|null, body: string, fullContent: string }}
 */
function loadSpec(filePath) {
  if (!fs.existsSync(filePath))
    return { frontmatter: null, body: "", fullContent: "" };
  const fullContent = fs.readFileSync(filePath, "utf8");
  const { attrs, body } = parseFrontmatter(fullContent);
  return { frontmatter: attrs, body, fullContent };
}

/**
 * Save a spec file in frontmatter + body format.
 * @param {string} filePath
 * @param {object} frontmatter
 * @param {string} body
 */
function saveSpecFrontmatter(filePath, frontmatter, body) {
  const yaml = stringifyFrontmatter(frontmatter);
  const content = body ? `---\n${yaml}\n---\n${body}` : `---\n${yaml}\n---\n`;
  fs.writeFileSync(filePath, content);
}

// ============================================================
// Queue Utilities
// ============================================================

/**
 * Parse one line of queue.md.
 * @param {string} line
 * @returns {{ checked: boolean, ticketId: number|null, title: string|null, specPath: string|null }|null}
 */
function parseQueueLine(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^- \[([ x])\] #(\d+)\s+(.+?)\s*\|\s*(.+)$/);
  if (!match) return null;
  const parts = match[4].split("|").map((s) => s.trim());
  return {
    checked: match[1] === "x",
    ticketId: parseInt(match[2], 10),
    title: match[3].trim(),
    specPath: parts[0],
    createdAt:
      parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : null,
    startedAt:
      parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]) ? parts[2] : null,
    completedAt:
      parts[3] && /^\d{4}-\d{2}-\d{2}$/.test(parts[3]) ? parts[3] : null,
  };
}

/**
 * Generate one line of queue entry.
 * @param {number} ticketId
 * @param {string} title
 * @param {string} specPath
 * @param {boolean} [checked=false]
 * @returns {string}
 */
function generateQueueLine(
  ticketId,
  title,
  specPath,
  checked,
  createdAt,
  startedAt,
  completedAt,
) {
  const mark = checked ? "x" : " ";
  let line = `- [${mark}] #${ticketId} ${title} | ${specPath}`;
  if (createdAt) line += ` | ${createdAt}`;
  if (startedAt) line += ` | ${startedAt}`;
  if (completedAt) line += ` | ${completedAt}`;
  return line;
}

/**
 * Parse the queue.md file.
 * @param {string} queuePath
 * @returns {{ entries: Array, headerLines: string[] }}
 */
function parseQueueFile(queuePath) {
  if (!fs.existsSync(queuePath)) return { entries: [], headerLines: [] };
  const content = fs.readFileSync(queuePath, "utf8");
  const lines = content.split("\n");
  const headerLines = [];
  const entries = [];
  for (const line of lines) {
    const parsed = parseQueueLine(line);
    if (parsed) {
      entries.push(parsed);
    } else if (!parsed && line.trim()) {
      headerLines.push(line);
    }
  }
  return { entries, headerLines };
}

/**
 * Add a new entry to the queue.
 * @param {string} queuePath
 * @param {number} ticketId
 * @param {string} title
 * @param {string} specPath
 */
function addToQueue(queuePath, ticketId, title, specPath) {
  archiveExpiredEntries(queuePath, path.resolve(CFG.queueArchiveFile), CFG.archivalDays);
  const parsed = parseQueueFile(queuePath);
  if (parsed.entries.some((e) => e.ticketId === ticketId)) return;
  const createdAt = today();
  const newLine = generateQueueLine(ticketId, title, specPath, false, createdAt);
  const header =
    parsed.headerLines.length > 0
      ? parsed.headerLines.join("\n") + "\n"
      : "# Ticket Queue\n\n";
  const lines = parsed.entries.map((e) =>
    generateQueueLine(e.ticketId, e.title, e.specPath, e.checked, e.createdAt, e.startedAt, e.completedAt)
  );
  lines.push(newLine);
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * Update an entry in the queue.
 * @param {string} queuePath
 * @param {number} ticketId
 * @param {{ title?: string, specPath?: string, checked?: boolean }} updates
 */
function updateQueueEntry(queuePath, ticketId, updates) {
  const { entries, headerLines } = parseQueueFile(queuePath);
  const newEntries = entries.map((e) => {
    if (e.ticketId !== ticketId) return e;
    return { ...e, ...updates };
  });
  const header = headerLines.join("\n") + "\n";
  const lines = newEntries.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * Remove an entry from the queue.
 * @param {string} queuePath
 * @param {number} ticketId
 */
function removeFromQueue(queuePath, ticketId) {
  const { entries, headerLines } = parseQueueFile(queuePath);
  const filtered = entries.filter((e) => e.ticketId !== ticketId);
  if (filtered.length === entries.length) return;
  const header = headerLines.join("\n") + "\n";
  const lines = filtered.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * Move entries completed 14+ days ago from queue to archive.
 * @param {string} queuePath
 * @param {string} archivePath
 * @param {number} archivalDays
 * @returns {{ archived: number }}
 */
function archiveExpiredEntries(queuePath, archivePath, archivalDays) {
  if (!fs.existsSync(queuePath)) return { archived: 0 };
  const { entries, headerLines } = parseQueueFile(queuePath);
  const now = Date.now();
  const active = [];
  const expired = [];
  for (const entry of entries) {
    if (entry.checked && entry.completedAt) {
      const ms = Date.parse(entry.completedAt);
      if (!isNaN(ms)) {
        const daysSince = Math.floor((now - ms) / (1000 * 60 * 60 * 24));
        if (daysSince >= archivalDays) {
          expired.push(entry);
          continue;
        }
      }
    }
    active.push(entry);
  }
  if (expired.length === 0) return { archived: 0 };
  const todayStr = today();
  const archiveLines = expired.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  const archiveSection = `## Archived on ${todayStr}\n${archiveLines.join("\n")}\n`;
  const archiveContent = fs.existsSync(archivePath)
    ? fs.readFileSync(archivePath, "utf8").replace(/\n$/, "") +
      "\n\n" +
      archiveSection
    : "# Queue Archive\n\n" + archiveSection;
  fs.writeFileSync(archivePath, archiveContent);
  const header = headerLines.join("\n") + "\n";
  const lines = active.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
  return { archived: expired.length };
}

// ============================================================
// Status Utilities
// ============================================================

/**
 * Check if a status value is in the allowed list.
 * @param {string} status
 * @returns {boolean}
 */
function validateStatus(status) {
  return CFG.review.allowedStatuses.includes(status);
}

/**
 * Check if a status transition follows the rules.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function validateTransition(from, to) {
  const allowed = CFG.review.validTransitions[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Return the list of statuses reachable from a given status.
 * @param {string} from
 * @returns {string[]}
 */
function getAllowedTransitions(from) {
  return CFG.review.validTransitions[from] || [];
}

// ============================================================
// Date Utilities
// ============================================================

/**
 * Format a Date object as "YYYY-MM-DD".
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function formatDate(date) {
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Return today's date as "YYYY-MM-DD".
 * @returns {string}
 */
function today() {
  return formatDate(new Date());
}

// ============================================================
// Spec Template
// ============================================================

/**
 * Generate the template body for a spec file.
 * @param {number} ticketId
 * @param {string} title
 * @returns {string}
 */
function generateSpecBody(ticketId, title, slug) {
  return `# ${title}

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Investigation

<!--
憶測や論理的な推論だけでは不十分である。ソースコードの解析、grep、解析調査用テストコードの作成、テストの実行、ログの確認などを通じて**物理的な証拠**を見つけ出し、ここに記録すること。

記録すべき証拠の例：
- エラーメッセージ、スタックトレース、テスト失敗の再現手順
- grep や検索で見つけた関連コードの該当箇所（ファイル名・行番号）
- 実際に確認した動作や期待との乖離
- 検証済みの仮説と反証された仮説

記載された証拠は後日 /plan-ticket が正確な計画を立てるための唯一の材料となる。
-->

## Test Plan

<!--
★★★ 重要: テスト計画はユニットテストの網羅性を最優先する ★★★

**基本方針**: ユニットテストでカバーできる範囲は全てユニットテストで検証する。
ユニットテストのみで検証できない部分（外部サービス結合、ハードウェア依存等）に
限り、E2Eテストまたは手動テストを計画する。「ユニットテスト不可能な項目」として
理由を明記したものだけが例外として認められる。

### ユニットテスト計画

- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
- カバレッジ目標（目安: 80%以上、クリティカルパスは90%以上）

### ユニットテスト不可能な項目（例外）

ユニットテストでは検証不可能な項目のみを、理由とともに列挙する。
例：
- 理由1: 外部APIとの結合（モックでは再現不可能な挙動がある）
- 理由2: ハードウェア依存の処理（実機が必要）
-->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して、以下の観点で「来たときよりも美しく（翻訳可能に）」する計画を書く:

- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testUnit, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

詳細は Tickets.json の該当チケットフィールドを参照すること。
-->

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: \`scope[]\`, \`testUnit[]\`, \`testExceptions[]\`, \`notes\` フィールド（差分: \`context/${String(ticketId).padStart(4, '0')}-${slug}/plan.md\`）
- **実装サマリ**: \`changes[]\`, \`notes\` フィールド（差分: \`context/${String(ticketId).padStart(4, '0')}-${slug}/implementation.md\`）
- **レビュー報告書**: \`instrumentation\`, \`notes\`, \`rfcDiscrepancies[]\` フィールド（差分: \`context/${String(ticketId).padStart(4, '0')}-${slug}/review.md\`）
`;
}

/**
 * Generate a new spec file from a template.
 * @param {string} filePath
 * @param {number} ticketId
 * @param {string} title
 * @param {string} slug
 * @param {string} [status='draft']
 * @returns {object} frontmatter
 */
function createSpecFile(filePath, ticketId, title, slug, status) {
  const now = today();
  const frontmatter = {
    ticket_id: ticketId,
    title,
    slug,
    status: status || "draft",
    created_at: now,
    updated_at: now,
  };
  const body = generateSpecBody(ticketId, title, slug);
  saveSpecFrontmatter(filePath, frontmatter, body);
  return frontmatter;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  CFG,
  resolveTicketSpecPath,
  validateTicketId,
  formatTicketId,
  findNextTicketId,
  generateSlug,
  makeUniqueSlug,
  collectSlugs,
  resolveSpecPath,
  resolveAllPaths,
  parseFrontmatter,
  stringifyFrontmatter,
  readFrontmatterFromFile,
  writeFrontmatter,
  readField,
  writeField,
  updateFrontmatterFields,
  loadSpec,
  saveSpecFrontmatter,
  generateSpecBody,
  createSpecFile,
  parseQueueLine,
  generateQueueLine,
  parseQueueFile,
  addToQueue,
  updateQueueEntry,
  removeFromQueue,
  archiveExpiredEntries,
  validateStatus,
  validateTransition,
  getAllowedTransitions,
  formatDate,
  today,
};
