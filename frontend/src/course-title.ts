export interface CourseTitle {
  course?: string;
  title: string;
  sections?: string;
  instructor?: string;
  schedule?: string;
}

function readableCase(value: string): string {
  // Preserve authored mixed case and recognizable short acronyms.
  if (value !== value.toUpperCase()) return value;
  const acronyms = new Set([
    "AI",
    "API",
    "CAD",
    "DSP",
    "EE",
    "GME",
    "ILSI",
    "I",
    "II",
    "III",
    "IV",
    "V",
  ]);
  const smallWords = new Set([
    "a",
    "an",
    "and",
    "at",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "with",
  ]);
  return value
    .split(/(\s+|[-/])/)
    .map((word, index) => {
      if (!/[A-Z]/.test(word) || acronyms.has(word)) return word;
      const lower = word.toLowerCase();
      return index > 0 && smallWords.has(lower)
        ? lower
        : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function parseCourseTitle(raw?: string): CourseTitle {
  const original = raw?.trim() || "Untitled";
  const normalized = original.replace(/\s+/g, " ");
  const withoutDate = normalized
    .replace(/\s*_\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, "")
    .trim();
  const course = withoutDate.match(
    /^([A-Z]{1,4}(?:\s+[A-Z]{1,2})?\s+\d{3}[A-Z]*(?:-\d+|\s+\d+)?)\s*-\s*(.+)$/,
  );
  if (!course) return { title: original };
  const section = course[2].match(
    /^(.*)\s*-\s*(\d{4,6}(?:\s*,\s*\d{4,6})*)(?:\s+(\([^)]*\)))?$/,
  );
  if (!section) return { title: original };
  const content = section[1].trim();
  // Spaced separators preserve hyphenated surnames; compact titles use the last dash.
  const instructorMatch = content.match(/^(.*)\s+-\s+(.+)$/);
  const divider = content.lastIndexOf("-");
  const heading = instructorMatch
    ? instructorMatch[1].trim()
    : divider >= 0
      ? content.slice(0, divider).trim()
      : content;
  const instructor = instructorMatch
    ? instructorMatch[2].trim()
    : divider >= 0
      ? content.slice(divider + 1).trim()
      : undefined;
  // Only treat a suffix as an instructor when it resembles a full name or surname + initial.
  if (
    instructor &&
    !/^[\p{L}.'’ -]+(?:,\s*[\p{L}.]+|\s+[\p{L}.'’ -]+)$/u.test(instructor)
  )
    return { title: original };
  if (!heading) return { title: original };
  return {
    course: course[1],
    title: readableCase(heading),
    sections: section[2]
      .split(",")
      .map((value) => value.trim())
      .join(", "),
    instructor,
    schedule: section[3],
  };
}
