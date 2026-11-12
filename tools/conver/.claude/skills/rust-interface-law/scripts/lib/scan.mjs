const SCANS = {
  'scan/stubs': (input) => count(input.text, /\[::STUB::\]/g),
  'scan/test-weakening': (input) => {
    const before = count(input.before, /\bassert[!]?\s*\(/g);
    const after = count(input.after, /\bassert[!]?\s*\(/g);
    return before > after ? 1 : 0;
  },
  'scan/english': (input) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(String(input.text ?? '')) ? 1 : 0,
  'scan/secrets': (input) => /(password\s*=|-----BEGIN|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/.test(String(input.text ?? '')) ? 1 : 0,
};

export function runScan(id, input = {}) {
  const scan = SCANS[id];
  if (!scan) throw new Error('unknown scan: ' + id);
  const count = scan(input);
  return {
    ok: count === 0,
    findings: count === 0 ? [] : [{ scan: id, count }],
  };
}

function count(value, pattern) {
  return (String(value ?? '').match(pattern) ?? []).length;
}
