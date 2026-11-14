/**
 * Deterministic lexical search with idf weighting.
 *
 * A flat substring score ranks every hit the same, so a caller cannot tell the
 * strongest answer from a weak one. The idf term keeps a hit that matches a
 * rare word above one that matches a word present in every rule.
 */

import { conceptBody } from '../context/assemble.mjs';

const TITLE_WEIGHT = 3;
const DESCRIPTION_WEIGHT = 2;
const BODY_WEIGHT = 1;
const BODY_TERM_CAP = 3;

export function searchConcepts({ bundle, query, limit = 20, commandPrefix = 'node "$OKF"' }) {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const documents = bundle.concepts.map((concept) => ({
    concept,
    title: String(concept.title ?? '').toLowerCase(),
    description: String(concept.description ?? '').toLowerCase(),
    body: conceptBody(concept).toLowerCase(),
  }));
  const idf = inverseDocumentFrequency(documents, terms);
  const rows = [];
  for (const document of documents) {
    let score = 0;
    let whyMatched = null;
    for (const term of terms) {
      const titleHits = countOccurrences(document.title, term);
      const descriptionHits = countOccurrences(document.description, term);
      const bodyHits = Math.min(countOccurrences(document.body, term), BODY_TERM_CAP);
      const weighted = titleHits * TITLE_WEIGHT + descriptionHits * DESCRIPTION_WEIGHT + bodyHits * BODY_WEIGHT;
      if (weighted === 0) continue;
      score += weighted * idf.get(term);
      if (!whyMatched || titleHits > 0) whyMatched = whyMatched ?? fieldOf(titleHits, descriptionHits, bodyHits);
    }
    if (score > 0) {
      rows.push({
        id: document.concept.id,
        type: document.concept.type,
        title: document.concept.title,
        score: Number(score.toFixed(3)),
        why_matched: whyMatched,
        snippet: snippet(document.description || document.body, terms),
        expand_command: `${commandPrefix} expand --id ${document.concept.id}`,
      });
    }
  }
  return rows.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, limit);
}

function inverseDocumentFrequency(documents, terms) {
  const idf = new Map();
  for (const term of terms) {
    const matches = documents.filter((document) => (
      document.title.includes(term) || document.description.includes(term) || document.body.includes(term)
    )).length;
    idf.set(term, Math.log(1 + documents.length / (1 + matches)));
  }
  return idf;
}

function fieldOf(titleHits, descriptionHits, bodyHits) {
  if (titleHits > 0) return 'title';
  if (descriptionHits > 0) return 'description';
  return bodyHits > 0 ? 'body' : 'none';
}

function countOccurrences(text, term) {
  if (!term) return 0;
  let count = 0;
  let index = text.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function tokenize(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).filter((term) => term.length > 0);
}

function snippet(text, terms) {
  const term = terms.find((entry) => text.includes(entry));
  if (!term) return text.slice(0, 120);
  const at = text.indexOf(term);
  return text.slice(Math.max(0, at - 40), at + 80).trim();
}
