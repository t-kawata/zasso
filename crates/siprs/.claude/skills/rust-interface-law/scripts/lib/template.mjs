import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './redact.mjs';

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;

export function loadTemplateCatalog({ root, interface: interfaceName }) {
  const manifestPath = join(root, interfaceName, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, findings: [{ kind: 'missing-template', message: 'template manifest missing: ' + manifestPath }] };
  }
  return {
    ok: true,
    catalog: JSON.parse(readFileSync(manifestPath, 'utf8')),
    root: join(root, interfaceName),
  };
}

export function renderTemplatePlan({ interface: interfaceName, unit, values = {}, catalog, root }) {
  const loaded = catalog
    ? { ok: true, catalog, root }
    : loadTemplateCatalog({ root, interface: interfaceName });
  if (!loaded.ok) return { ok: false, files: [], findings: loaded.findings };

  const files = [];
  const findings = [];
  const resolvedValues = {
    crate: values.crate,
    package: values.package,
    interface: values.interface ?? interfaceName,
    unit: values.unit ?? unit,
  };

  for (const file of loaded.catalog.files ?? []) {
    const templatePath = join(loaded.root, file.template);
    if (!existsSync(templatePath)) {
      findings.push({ kind: 'missing-template', path: file.path, message: 'template file missing: ' + file.template });
      continue;
    }
    const template = readFileSync(templatePath, 'utf8');
    const unresolved = [];
    const content = template.replace(PLACEHOLDER, (whole, key) => {
      const value = resolvedValues[key];
      if (value === undefined || value === null || value === '') {
        unresolved.push(key);
        return whole;
      }
      return String(value);
    });

    if (unresolved.length > 0) {
      findings.push({
        kind: 'unresolved-placeholder',
        path: file.path,
        placeholders: [...new Set(unresolved)],
        message: 'template has unresolved placeholders',
      });
      continue;
    }

    files.push({
      path: file.path,
      mode: file.mode ?? 'create',
      marker: file.marker ?? null,
      rules: file.rules ?? [],
      template: file.template,
      template_sha256: sha256(template),
      content,
    });
  }

  if (findings.length > 0) return { ok: false, files: [], findings };

  return {
    ok: true,
    findings: [],
    files,
    plan: {
      schema: 'rust-interface-law.template/v1',
      package: values.package ?? unit,
      interface: interfaceName,
      unit,
      files,
    },
  };
}

export function reconcileTemplatePlan({ plan, root }) {
  const findings = [];
  const files = (plan.files ?? []).map((file) => {
    const target = join(root, file.path);
    if (!existsSync(target)) return { ...file, mode: 'create' };
    const existing = readFileSync(target, 'utf8');
    if (file.marker && existing.split('\n').filter((line) => line.trim() === file.marker.trim()).length === 1) {
      return { ...file, mode: 'append' };
    }
    findings.push({
      kind: 'merge-required',
      path: file.path,
      message: 'existing file requires manual merge',
    });
    return { ...file, mode: 'merge-required' };
  });
  return { ...plan, files, findings, ok: findings.length === 0 };
}

export function checkGeneratedEquality({ plan, root }) {
  const findings = [];
  for (const file of plan.files ?? []) {
    const target = join(root, file.path);
    if (!existsSync(target)) {
      findings.push({ kind: 'missing-generated-file', path: file.path });
      continue;
    }
    const actual = readFileSync(target, 'utf8');
    if (actual !== file.content) {
      findings.push({ kind: 'generated-drift', path: file.path });
    }
    if (!String(file.content).includes('RULE: ')) {
      findings.push({ kind: 'missing-rule-annotation', path: file.path });
    }
  }
  return { ok: findings.length === 0, findings };
}
