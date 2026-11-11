export function parseToml(text) {
  const root = {};
  let current = root;

  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('[[') && line.endsWith(']]')) {
      const name = line.slice(2, -2).trim();
      const parts = name.split('.');
      let parent = root;
      for (const part of parts.slice(0, -1)) {
        parent[part] ??= {};
        parent = parent[part];
      }
      const key = parts[parts.length - 1];
      parent[key] ??= [];
      current = {};
      parent[key].push(current);
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const parts = line.slice(1, -1).trim().split('.');
      let parent = root;
      for (const part of parts) {
        parent[part] ??= {};
        parent = parent[part];
      }
      current = parent;
      continue;
    }

    const equals = line.indexOf('=');
    if (equals < 0) continue;
    const key = line.slice(0, equals).trim();
    current[key] = parseValue(line.slice(equals + 1).trim());
  }

  return root;
}

function parseValue(text) {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return splitArray(inner).map((item) => parseValue(item.trim()));
  }
  const number = Number(text);
  return Number.isNaN(number) ? text : number;
}

function splitArray(inner) {
  const items = [];
  let current = '';
  let quoted = false;
  for (const char of inner) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  items.push(current);
  return items.filter((item) => item.trim() !== '');
}
