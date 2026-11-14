/**
 * Authoring commands write a bundle from a model.
 */

import { writeConcept } from '../authoring/write.mjs';
import { writeDirectoryIndexes } from '../authoring/index.mjs';
import { writeLog } from '../authoring/log.mjs';

export function writeBundle({ outDir, concepts, logEntries = [] }) {
  for (const concept of concepts) writeConcept({ outDir, concept });
  writeLog({ outDir, entries: logEntries });
  return { concepts: concepts.length, logEntries: logEntries.length };
}

export function writeIndexes({ bundle, outDir }) {
  writeDirectoryIndexes({ bundle, outDir });
}

export function writeBundleLog({ outDir, entries }) {
  writeLog({ outDir, entries });
}

export { writeConcept };
