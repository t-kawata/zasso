export function checkTrust({ pinned = {}, actual = {} }) {
  const mismatches = [];
  for (const [file, hash] of Object.entries(pinned)) {
    if (actual[file] !== hash) mismatches.push(file);
  }
  for (const file of Object.keys(actual)) {
    if (!(file in pinned)) mismatches.push(file);
  }
  return {
    ok: mismatches.length === 0,
    code: mismatches.length === 0 ? 0 : 90,
    mismatches,
  };
}
