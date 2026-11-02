/**
 * Chapter coverage.
 *
 * A numbered specification chapter is a unit of design. The package catalog is the
 * set of directories that can implement those units. A chapter the catalog never
 * names is a chapter no directory will implement, so the gate refuses to publish a
 * manifest while one exists.
 *
 * The check reads only the two artefacts the gate already holds: the heading tree
 * and the package responsibilities. It deliberately does not consult the pulse or
 * the spec_defects list. A pulse candidate may be settled with a prose default, and
 * that settlement is not an owner: only a package responsibility can name the
 * directory that will carry the chapter.
 */

/** The chapter numbering this specification uses: `S00`, `S01`, ... */
const NUMBERED_CHAPTER_RE = /^(S\d{2})\b/;

/** Chapters are the level-2 headings, the same anchor the document is segmented at. */
const CHAPTER_HEADING_LEVEL = 2;

/**
 * Find numbered chapters no package responsibility names.
 *
 * @param {{ headings?: Array<object>, packages?: Array<object> }} input
 * @returns {{ ok: boolean, uncovered: Array<object>, required_chapter_count: number,
 *             uncovered_chapter_count: number, errors: Array<string> }}
 */
export function checkChapterCoverage({ headings = [], packages = [] } = {}) {
  const chapters = collectNumberedChapters(headings);
  const responsibilities = collectResponsibilities(packages);

  const uncovered = chapters
    .filter(({ sectionId }) => !responsibilityNamesChapter(responsibilities, sectionId))
    .map(({ heading, sectionId }) => ({
      heading_id: heading.id,
      section_id: sectionId,
      title: heading.text,
    }));

  return {
    ok: uncovered.length === 0,
    uncovered,
    required_chapter_count: chapters.length,
    uncovered_chapter_count: uncovered.length,
    errors: uncovered.map(
      (chapter) =>
        `numbered chapter "${chapter.title}" is not named by any package responsibility; a spec_defect entry does not assign an owner`
    ),
  };
}

/** The level-2 headings that carry an `Sxx` chapter number, with that number. */
function collectNumberedChapters(headings) {
  const chapters = [];
  for (const heading of headings ?? []) {
    if (heading?.level !== CHAPTER_HEADING_LEVEL || typeof heading.text !== 'string') {
      continue;
    }
    const number = heading.text.match(NUMBERED_CHAPTER_RE);
    if (number) {
      chapters.push({ heading, sectionId: number[1] });
    }
  }
  return chapters;
}

/** Every responsibility line the catalog declares, as one searchable text. */
function collectResponsibilities(packages) {
  return (packages ?? [])
    .flatMap((pkg) => (Array.isArray(pkg?.responsibilities) ? pkg.responsibilities : []))
    .join('\n');
}

/** True when a responsibility names the chapter, not a longer number such as S180. */
function responsibilityNamesChapter(responsibilities, sectionId) {
  return new RegExp(`(^|[^A-Za-z0-9_])${sectionId}(?![0-9])`).test(responsibilities);
}
