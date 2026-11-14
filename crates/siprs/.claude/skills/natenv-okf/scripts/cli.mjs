#!/usr/bin/env node
/**
 * The skill's CLI entry.
 *
 * The engine owns every command; this file only binds the process lifecycle
 * so the engine's exit code becomes the process's exit code.
 */

import { main } from '../okf-core/cli.mjs';

process.exitCode = await main();
