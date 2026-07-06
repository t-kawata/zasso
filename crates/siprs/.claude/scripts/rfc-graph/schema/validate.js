/**
 * validate.js — スキーマディレクトリからJSON Schemaを読み込んで検証する汎用関数
 *
 * crud.js（P13-2）から呼び出されることを前提とする。
 * Ajv Draft 2020-12 を使用し、エラー時は3段テンプレート（エラーパス・期待値・実際の値）で構造化エラーを返す。
 */

const AjvDraft2020 = require("ajv/dist/2020");
const path = require("path");
const fs = require("fs");

/**
 * スキーマディレクトリのデフォルトパス
 * このファイルからの相対パスで解決する
 */
const DEFAULT_SCHEMAS_DIR = path.resolve(__dirname);

/**
 * スキーマに対する検証結果
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid — 検証が成功したか
 * @property {string[]} [errors] — 検証失敗時の3段テンプレートエラー配列
 */

/**
 * 指定されたデータをJSON Schemaで検証する
 *
 * @param {Object} data — 検証対象のデータ
 * @param {string} schemaFileName — スキーマファイル名（例: "node.schema.json"）
 * @param {string} [schemasDir] — スキーマファイルが格納されたディレクトリへの絶対パス
 * @returns {ValidationResult} 検証結果
 */
function validateAgainstSchema(data, schemaFileName, schemasDir) {
  // スキーマディレクトリの解決
  const resolvedSchemasDir = schemasDir || DEFAULT_SCHEMAS_DIR;
  const schemaFilePath = path.resolve(resolvedSchemasDir, schemaFileName);

  // スキーマファイルの存在確認
  if (!fs.existsSync(schemaFilePath)) {
    return {
      valid: false,
      errors: [
        `schemaFile: ${schemaFileName}`,
        `expected: 存在するスキーマファイル`,
        `actual: ${schemaFilePath} が見つかりません`,
      ],
    };
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaFilePath, "utf-8"));
  } catch (parseError) {
    return {
      valid: false,
      errors: [
        `schemaFile: ${schemaFileName}`,
        `expected: 有効なJSON`,
        `actual: JSONパースエラー — ${parseError.message}`,
      ],
    };
  }

  // Ajv インスタンスの作成
  // allErrors: true — 全エラーを収集（最初の1件で止めない）
  const ajv = new AjvDraft2020({ allErrors: true });

  // 依存スキーマを事前登録（ターゲットスキーマ以外の全スキーマ、$ref 解決のため）
  registerDependentSchemas(ajv, resolvedSchemasDir, schemaFileName);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (compileError) {
    return {
      valid: false,
      errors: [
        `schema: ${schemaFileName}`,
        `expected: 有効なJSON Schema`,
        `actual: スキーマコンパイルエラー — ${compileError.message}`,
      ],
    };
  }

  const isValid = validate(data);

  if (isValid) {
    return { valid: true };
  }

  // エラー情報を3段テンプレートで構造化
  const errors = validate.errors.map((err) => {
    const instancePath = err.instancePath || "/";
    const expectedMessage = err.message || "制約違反";
    const actualValue = JSON.stringify(
      instancePath === "/" ? data : getValueAtPath(data, instancePath)
    );
    return `${instancePath}: ${expectedMessage} (actual: ${actualValue})`;
  });

  return { valid: false, errors };
}

/**
 * オブジェクトからJSONポインタ形式のパスに対応する値を取得する
 *
 * @param {Object} obj — 検索対象のオブジェクト
 * @param {string} pathStr — JSONポインタ形式のパス（例: "/properties/name"）
 * @returns {*} 該当する値、または undefined
 */
function getValueAtPath(obj, pathStr) {
  if (pathStr === "" || pathStr === "/") {
    return obj;
  }

  const segments = pathStr.split("/").filter(Boolean);
  let current = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // 配列インデックスの処理
    const arrayIndex = /^\d+$/.test(segment) ? parseInt(segment, 10) : null;
    if (arrayIndex !== null && Array.isArray(current)) {
      current = current[arrayIndex];
    } else {
      current = current[segment];
    }
  }

  return current;
}

/**
 * ターゲットスキーマ以外の全 JSON Schema ファイルを Ajv に事前登録する
 *
 * graph.schema.json が node.schema.json / edge.schema.json を $ref 参照するため、
 * コンパイル前に依存スキーマを先に登録しておく必要がある。
 *
 * @param {object} ajv — Ajv インスタンス
 * @param {string} schemasDir — スキーマディレクトリへの絶対パス
 * @param {string} excludeFileName — 除外するスキーマファイル名（ターゲット自身）
 */
function registerDependentSchemas(ajv, schemasDir, excludeFileName) {
  let files;
  try {
    files = fs.readdirSync(schemasDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".schema.json") || file === excludeFileName) {
      continue;
    }
    const filePath = path.resolve(schemasDir, file);
    try {
      const schema = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      ajv.addSchema(schema);
    } catch {
      // 個別のスキーマ登録失敗は無視（compile 時に再検証される）
    }
  }
}

module.exports = { validateAgainstSchema };
