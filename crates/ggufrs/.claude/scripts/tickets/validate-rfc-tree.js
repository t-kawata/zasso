/**
 * validate-rfc-tree.js — RFC-TREE.json スキーマ検証
 *
 * 検証項目:
 * 1. 必須フィールドの存在
 * 2. 各ノードの required フィールド + 値フォーマット
 * 3. 孤立ノードの検出（dependencyOn が存在しない childId を参照）
 * 4. 循環依存の検出（dependencyOn が循環: A→B→A）
 * 5. 最大3階層の制約（孫ノードに children がある場合エラー）
 *
 * エラーメッセージは AI が修正可能な形で出力する。
 */
const fs = require("fs");
const path = require("path");

/**
 * 依存グラフの循環を DFS で検出する。
 * @param {Map<string, string[]>} graph - childId → dependencyOn childId[]
 * @param {string[]} allIds - 全 childId の配列（トポロジカルソートにも使用）
 * @returns {string[]} 検出された循環パスの一覧
 */
function detectCycles(graph, allIds) {
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const parent = {};
  for (const id of allIds) { color[id] = WHITE; parent[id] = null; }

  function dfs(u) {
    color[u] = GRAY;
    for (const v of (graph.get(u) || [])) {
      if (!allIds.includes(v)) continue; // orphans are detected separately
      if (color[v] === GRAY) {
        // Found back edge — reconstruct the cycle
        const cyclePath = [];
        let cur = u;
        while (cur !== null) {
          cyclePath.unshift(cur);
          if (cur === v) break;
          cur = parent[cur];
        }
        cycles.push({ cycle: [...cyclePath, v].join(" → "), from: u, to: v });
      } else if (color[v] === WHITE) {
        parent[v] = u;
        dfs(v);
      }
    }
    color[u] = BLACK;
  }

  for (const id of allIds) {
    if (color[id] === WHITE) dfs(id);
  }
  return cycles;
}

function validateRfcTree(data) {
  const errors = [];

  // --- トップレベル必須フィールド ---
  const required = ["canonicalRfcPath", "canonicalRfcTitle", "generatedAt", "rfcUnderstanding", "draftTree", "finalTree"];
  for (const f of required) {
    if (!data[f] && data[f] !== "") errors.push(`Missing required field: ${f}`);
  }
  if (data.generatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(data.generatedAt)) {
    errors.push(`generatedAt must be YYYY-MM-DD, got: ${data.generatedAt}`);
  }
  if (data.language && !["rust", "go", "typescript"].includes(data.language)) {
    errors.push(`language must be rust, go, or typescript, got: ${data.language}`);
  }

  // --- 各ツリーの検証 ---
  for (const treeName of ["draftTree", "finalTree"]) {
    const tree = data[treeName];
    if (!Array.isArray(tree)) continue;

    const allIds = tree.map(c => c.childId).filter(Boolean);

    for (let i = 0; i < tree.length; i++) {
      const node = tree[i];
      const label = `${treeName}[${i}]`;

      // childId: 2桁0埋め
      if (!node.childId || !/^\d{2}$/.test(node.childId)) {
        errors.push(`${label}.childId: must be 2 zero-padded digits (01-99), got: "${node.childId}"`);
      }
      // directoryName: 必須
      if (!node.directoryName) {
        errors.push(`${label}.directoryName: required. Expected format: "{childId}-{kebab-name}"`);
      } else if (node.childId && !node.directoryName.startsWith(node.childId)) {
        errors.push(`${label}.directoryName: should start with childId "${node.childId}", got: "${node.directoryName}"`);
      }
      // namespaceUnit: 必須
      if (!node.namespaceUnit) {
        errors.push(`${label}.namespaceUnit: required. Choose from: crate, module, package`);
      }
      // ioSchema: 必須
      if (!node.ioSchema) {
        errors.push(`${label}.ioSchema: required. Describe the public API boundary`);
      }
      // decouplingMethod: 必須
      if (!node.decouplingMethod) {
        errors.push(`${label}.decouplingMethod: required. How does this decouple from siblings?`);
      }
      // rfcEvidence: 必須
      if (!node.rfcEvidence) {
        errors.push(`${label}.rfcEvidence: required. Which section of the canonical RFC is this based on?`);
      }

      // 孫ノードの検証
      if (node.children) {
        for (let j = 0; j < node.children.length; j++) {
          const gc = node.children[j];
          const gcl = `${label}.children[${j}]`;

          // grandchildId: 2桁0埋め
          if (!gc.grandchildId || !/^\d{2}$/.test(gc.grandchildId)) {
            errors.push(`${gcl}.grandchildId: must be 2 zero-padded digits (01-99), got: "${gc.grandchildId}"`);
          }
          // directoryName: 必須
          if (!gc.directoryName) {
            errors.push(`${gcl}.directoryName: required. Expected format: "{grandchildId}-{kebab-name}"`);
          }
          // parentEvidence: 必須（孫固有）
          if (!gc.parentEvidence) {
            errors.push(`${gcl}.parentEvidence: required. Why does this grandchild belong under this parent (child)?`);
          }
          // namespaceUnit: 必須
          if (!gc.namespaceUnit) {
            errors.push(`${gcl}.namespaceUnit: required`);
          }
          // ioSchema: 必須
          if (!gc.ioSchema) {
            errors.push(`${gcl}.ioSchema: required`);
          }
          // rfcEvidence: 必須
          if (!gc.rfcEvidence) {
            errors.push(`${gcl}.rfcEvidence: required`);
          }

          // ★ 最大3階層 制約: 孫ノードにさらに children があればエラー
          if (gc.children && Array.isArray(gc.children) && gc.children.length > 0) {
            errors.push(`${gcl}.children: max depth is 3 (canonical → child → grandchild). Grandchild "${gc.directoryName}" has ${gc.children.length} sub-nodes, which would create a 4th level. Remove children from this grandchild or restructure the tree.`);
          }
        }
      }
    }

    // --- 孤立ノード検出: dependencyOn が存在しない childId を参照していないか ---
    if (allIds.length > 0) {
      const idSet = new Set(allIds);
      for (const child of tree) {
        if (child.dependencyOn) {
          for (const depId of child.dependencyOn) {
            if (!idSet.has(depId)) {
              const validIdsStr = allIds.length > 0 ? allIds.join(", ") : "(none)";
              errors.push(
                `Orphan reference in ${treeName}: child "${child.childId}" (${child.directoryName||child.name||"?"}) ` +
                `depends on childId "${depId}" which does not exist in the tree. ` +
                `Valid childIds in this tree: [${validIdsStr}]. ` +
                `Fix: either add a child with childId="${depId}" to the tree, or remove "${depId}" from child "${child.childId}"'s dependencyOn.`
              );
            }
          }
        }
      }
    }

    // --- 循環依存検出 ---
    if (allIds.length > 0) {
      const graph = new Map();
      for (const child of tree) {
        graph.set(child.childId, child.dependencyOn || []);
      }
      const cycles = detectCycles(graph, allIds);
      for (const c of cycles) {
        errors.push(
          `Circular dependency detected in ${treeName}: ${c.cycle}. ` +
          `The dependency graph must be a DAG (Directed Acyclic Graph). ` +
          `Fix: remove or reorder the dependency so that '${c.to}' does not depend (directly or transitively) on '${c.from}'.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function main() {
  const p = process.argv[2];
  if (!p) {
    console.log(JSON.stringify({ valid: false, errors: ["Usage: node validate-rfc-tree.js <RFC_TREE_PATH>"] }));
    process.exit(1);
  }
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    console.log(JSON.stringify({ valid: false, errors: [`File not found: ${resolved}`] }));
    process.exit(1);
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch (e) { console.log(JSON.stringify({ valid: false, errors: [`Invalid JSON: ${e.message}`] })); process.exit(1); }
  const result = validateRfcTree(data);
  console.log(JSON.stringify(result));
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) main();
module.exports = { validateRfcTree };
