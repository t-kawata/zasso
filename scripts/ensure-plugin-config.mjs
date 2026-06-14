#!/usr/bin/env node
/**
 * プラグインインストール後に .claude/settings.json を更新する。
 * enabledPlugins と extraKnownMarketplaces の両方にエントリを追加する。
 *
 * Usage:
 *   node scripts/ensure-plugin-config.mjs <plugin-key> <marketplace-name> <github-repo>
 *
 * Example:
 *   node scripts/ensure-plugin-config.mjs \
 *       context-mode@context-mode context-mode mksglu/context-mode
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error(`Usage: ${process.argv[1]} <plugin-key> <marketplace-name> <github-repo>`);
    process.exit(1);
  }

  const [pluginKey, marketplaceName, githubRepo] = args;

  const settingsPath = join(__dirname, "..", ".claude", "settings.json");

  if (!existsSync(settingsPath)) {
    console.error(`Settings file not found: ${settingsPath}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(settingsPath, "utf-8"));
  let changed = false;

  // enabledPlugins の更新
  data.enabledPlugins ??= {};
  if (!data.enabledPlugins[pluginKey]) {
    data.enabledPlugins[pluginKey] = true;
    changed = true;
  }

  // extraKnownMarketplaces の更新
  data.extraKnownMarketplaces ??= {};
  if (!data.extraKnownMarketplaces[marketplaceName]) {
    data.extraKnownMarketplaces[marketplaceName] = {
      source: { source: "github", repo: githubRepo },
    };
    changed = true;
  }

  if (changed) {
    writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n");
    console.log(`Updated ${settingsPath}: ${pluginKey} enabled`);
  } else {
    console.log(`${pluginKey} is already configured in ${settingsPath}`);
  }
}

main();
