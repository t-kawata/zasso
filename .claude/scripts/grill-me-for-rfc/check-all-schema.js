#!/usr/bin/env node
/**
 * check-all-schema.js <rfc-dir>
 *
 * Status.json / DesignTree.json / CheckList.md のスキーマを検証する。
 * モジュールとして export され、全スクリプトの成功パス末尾から内部呼び出しされる。
 * CLI としても単独実行可能。
 *
 * 使用方法（CLI）:
 *   node check-all-schema.js <rfc-dir>
 *
 * 使用方法（スクリプト内インポート）:
 *   import { validateAll } from './check-all-schema.js';
 *   const errors = validateAll(rfcDir);
 *   if (errors.length) { process.exit(1); }
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── ステート定数（update-status.js と同期すること） ───
const VALID_STATES = [
  "GRILLING",
  "CHECKLIST_PENDING",
  "CHECKLIST_APPROVED",
  "WRITING",
  "REVIEWING",
  "DONE",
];

// ─── Status.json スキーマ検証 ───

export function validateStatus(rfcDir) {
  const errors = [];
  const statusPath = path.join(rfcDir, "Status.json");

  if (!fs.existsSync(statusPath)) {
    errors.push("Status.json: file not found");
    return errors;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  } catch (e) {
    errors.push("Status.json: JSON parse failed — " + e.message);
    return errors;
  }

  const requiredFields = ["state", "researchPath", "rfcPath", "rfcDir", "reviewLoopCount", "createdAt", "updatedAt"];
  for (const f of requiredFields) {
    if (data[f] === undefined || data[f] === null) {
      errors.push(`Status.json: required field "${f}" is missing`);
    }
  }

  if (data.state && !VALID_STATES.includes(data.state)) {
    errors.push(`Status.json.state: "${data.state}" is invalid (valid: ${VALID_STATES.join(", ")})`);
  }

  if (typeof data.reviewLoopCount !== "number" || data.reviewLoopCount < 0) {
    errors.push("Status.json.reviewLoopCount: must be a non-negative number");
  }

  if (data.createdAt && isNaN(Date.parse(data.createdAt))) {
    errors.push("Status.json.createdAt: must be an ISO 8601 date string");
  }
  if (data.updatedAt && isNaN(Date.parse(data.updatedAt))) {
    errors.push("Status.json.updatedAt: must be an ISO 8601 date string");
  }

  return errors;
}

// ─── DesignTree.json スキーマ検証 ───

export function validateDesignTree(rfcDir) {
  const errors = [];
  const treePath = path.join(rfcDir, "DesignTree.json");

  if (!fs.existsSync(treePath)) {
    errors.push("DesignTree.json: file not found");
    return errors;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(treePath, "utf-8"));
  } catch (e) {
    errors.push("DesignTree.json: JSON parse failed — " + e.message);
    return errors;
  }

  if (data.version === undefined || typeof data.version !== "number" || data.version < 1) {
    errors.push("DesignTree.json.version: must be a number >= 1");
  }

  if (data.updatedAt && isNaN(Date.parse(data.updatedAt))) {
    errors.push("DesignTree.json.updatedAt: must be an ISO 8601 date string");
  }

  if (!Array.isArray(data.nodes)) {
    errors.push("DesignTree.json.nodes: must be an array");
  } else {
    errors.push(...validateNodeArray(data.nodes, "nodes", new Set()));
  }

  return errors;
}

function validateNodeArray(nodes, pathPrefix, seenIds) {
  const errors = [];
  nodes.forEach((node, i) => {
    const p = `${pathPrefix}[${i}]`;
    if (!node.id || typeof node.id !== "string") {
      errors.push(`${p}.id: must be a non-empty string`);
    } else if (seenIds.has(node.id)) {
      errors.push(`${p}.id: duplicate detected ("${node.id}")`);
    } else {
      seenIds.add(node.id);
    }
    if (!node.title || typeof node.title !== "string") {
      errors.push(`${p}.title: must be a non-empty string`);
    }
    if (!["open", "resolved"].includes(node.status)) {
      errors.push(`${p}.status: must be "open" or "resolved" (current: "${node.status}")`);
    }
    if (!Array.isArray(node.questions)) {
      errors.push(`${p}.questions: must be an array`);
    } else {
      node.questions.forEach((q, qi) => {
        if (!q.resolvedAt || typeof q.resolvedAt !== "string") {
          errors.push(`${p}.questions[${qi}].resolvedAt: required field`);
        }
        if (!q.answer || typeof q.answer !== "string") {
          errors.push(`${p}.questions[${qi}].answer: required field`);
        }
      });
    }
    if (!Array.isArray(node.children)) {
      errors.push(`${p}.children: must be an array`);
    } else {
      errors.push(...validateNodeArray(node.children, `${p}.children`, seenIds));
    }
  });
  return errors;
}

// ─── CheckList.md スキーマ検証 ───

export function validateChecklist(rfcDir) {
  const errors = [];
  const checklistPath = path.join(rfcDir, "CheckList.md");

  if (!fs.existsSync(checklistPath)) {
    errors.push("CheckList.md: file not found");
    return errors;
  }

  const content = fs.readFileSync(checklistPath, "utf-8");

  if (!content.includes("# RFC 要件チェックリスト")) {
    errors.push("CheckList.md: leading \"# RFC 要件チェックリスト\" not found");
  }

  return errors;
}

// ─── 統合バリデーション ───

/**
 * 3ファイル全てのスキーマを検証し、エラーメッセージの配列を返す。
 * エラーがない場合は空配列を返す。
 */
export function validateAll(rfcDir) {
  const errors = [];
  errors.push(...validateStatus(rfcDir));
  errors.push(...validateDesignTree(rfcDir));
  errors.push(...validateChecklist(rfcDir));
  return errors;
}

// ─── CLI エントリポイント ───
// インポートされた場合に副作用として実行されるのを防ぐガード

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const cliRfcDir = process.argv[2];
  if (!cliRfcDir) {
    console.error("Usage: check-all-schema.js <rfc-dir>");
    process.exit(1);
  }
  const resolved = path.resolve(cliRfcDir);
  const errors = validateAll(resolved);
  if (errors.length > 0) {
    console.log(JSON.stringify({ ok: false, errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true }));
}
