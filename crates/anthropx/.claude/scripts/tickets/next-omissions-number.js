/**
 * OMISSIONS ファイルの次番号を採番する。
 *
 * 既存の OMISSIONS-<3桁>.json ファイルをディレクトリから走査し、
 * 最大番号 + 1 を返す。1件もなければ 1 を返す。
 *
 * Usage: node next-omissions-number.js <directory-path>
 * Output: {"success":true,"nextNumber":1}
 */

const fs = require("fs");
const path = require("path");

const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;

function findNextNumber(dirPath) {
  const resolved = path.resolve(dirPath);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: "Directory not found: " + dirPath };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { success: false, error: "Not a directory: " + dirPath };
  }

  let maxNumber = 0;
  const files = fs.readdirSync(resolved);

  for (const file of files) {
    const match = file.match(OMISSION_FILE_RE);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  }

  return { success: true, nextNumber: maxNumber + 1 };
}

function main() {
  const dirPath = process.argv[2];
  if (!dirPath) {
    console.log(
      JSON.stringify({
        success: false,
        error: "Usage: node next-omissions-number.js <directory-path>",
      }),
    );
    process.exit(1);
  }

  const result = findNextNumber(dirPath);
  if (!result.success) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { findNextNumber };
