#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE_NAME = 'CRYSTALIZE-Status.json';

function main() {
  const filePath = process.argv[2] || path.join(process.cwd(), DEFAULT_FILE_NAME);

  const resolvedPath = path.resolve(filePath);

  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read file: ${resolvedPath}`);
    console.error(err.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse JSON: ${resolvedPath}`);
    console.error(err.message);
    process.exit(1);
  }

  const sections = data && data.grill && Array.isArray(data.grill.sections)
    ? data.grill.sections
    : null;

  if (!sections) {
    console.error('No `grill.sections` array found in the given JSON file.');
    process.exit(1);
  }

  console.log('');
  for (const section of sections) {
    const id = section && section.id !== undefined ? section.id : '';
    const heading = section && section.heading !== undefined ? section.heading : '';
    const confirmedContent = section && section.confirmedContent !== undefined && section.confirmedContent !== null
      ? section.confirmedContent
      : '';

    console.log(`${id}: ${heading}\n    ->>> ${confirmedContent || 'Nothing'}\n`);
  }
}

main();
