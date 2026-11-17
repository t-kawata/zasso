#!/usr/bin/env node
/**
 * The skill's CLI entry.
 *
 * The engine owns every command; this file only binds the process lifecycle
 * and supplies the sibling bundle root when the caller does not pass one.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../okf-core/cli.mjs';

const argv = process.argv.slice(2);
const hasRoot = argv.some((argument) => argument === '--root' || argument.startsWith('--root='));
if (!hasRoot) argv.push('--root', join(fileURLToPath(new URL('..', import.meta.url)), 'okf'));

process.exitCode = await main(argv);
