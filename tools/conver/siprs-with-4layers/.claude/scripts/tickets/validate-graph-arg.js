#!/usr/bin/env node

/**
 * validate-graph-arg.js — Validate the GRAPH argument for /find-omissions
 *
 * Exits 0 if a readable GRAPH file path is provided.
 * Exits 2 (with message) if missing or not found.
 */

'use strict';

const fs = require('fs');
const path = require('path');

var arg = process.argv[2];

if (!arg) {
  console.error('[find-omissions] BLOCKED: No GRAPH path specified.');
  console.error('Usage: /find-omissions </path/to/*-GRAPH.json>');
  process.exit(2);
}

var resolved = path.resolve(arg);

if (!fs.existsSync(resolved)) {
  console.error('[find-omissions] BLOCKED: GRAPH file not found: ' + resolved);
  console.error('Verify the path and re-run /find-omissions with a valid GRAPH file.');
  process.exit(2);
}
