const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/course-title.ts");

test("splits course code, title, sections, and instructor, dropping the record date", async () => {
  const { parseCourseTitle } = await load();
  assert.deepEqual(
    parseCourseTitle(
      "ECE 383P-Ultrafast and Nonlinear Optics-David Burghoff-19250_10/12/2026",
    ),
    {
      course: "ECE 383P",
      title: "Ultrafast and Nonlinear Optics",
      sections: "19250",
      instructor: "David Burghoff",
      schedule: undefined,
    },
  );
});

test("keeps multiple sections and spaced instructor separators", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "SSE 380 - INTRO TO SEMICONDUCTORS - AKINWANDE, D - 15560 _10/12/2026",
  );
  assert.equal(parsed.course, "SSE 380");
  assert.equal(parsed.title, "Intro to Semiconductors");
  assert.equal(parsed.instructor, "AKINWANDE, D");
  assert.equal(parsed.sections, "15560");

  const multi = parseCourseTitle(
    "ECE 385J-Brain-Computer Interaction-Jose Millan-19275, 16845_10/12/2026",
  );
  assert.equal(multi.sections, "19275, 16845");
});

test("captures a parenthesized schedule after the sections", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "CS 343H - Artificial Intelligence (HON) - Volkan Isler - 55340 (MW 5-6:30)",
  );
  assert.equal(parsed.schedule, "(MW 5-6:30)");
  assert.equal(parsed.sections, "55340");
});

test("titles that do not look like course recordings pass through unchanged", async () => {
  const { parseCourseTitle } = await load();
  assert.deepEqual(parseCourseTitle("Welcome Orientation"), {
    title: "Welcome Orientation",
  });
  assert.deepEqual(parseCourseTitle(undefined), { title: "Untitled" });
  assert.deepEqual(parseCourseTitle("   "), { title: "Untitled" });
});

test("readable casing keeps acronyms and lowercases small words", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "EE 360C - ALGORITHMS AND DSP OF THE FUTURE - Smith, J - 12345",
  );
  assert.equal(parsed.title, "Algorithms and DSP of the Future");
});
