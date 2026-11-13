/**
 * End-to-end smoke test against the PRODUCTION build (CSP active), in a phone-sized
 * browser, with the Anthropic API, Wikipedia and speech synthesis mocked.
 * No real API calls are made and no key is needed.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node e2e/smoke.mjs            # needs the `playwright` package and Chromium
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

// require() so a globally installed Playwright (NODE_PATH) is found too.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const segmentsReading = [
  { speaker: "", text: "Η Μαρία ζει στη Θεσσαλονίκη και δουλεύει σε ένα μικρό αρτοποιείο κοντά στο λιμάνι." },
  { speaker: "", text: "Κάθε πρωί ξυπνάει στις πέντε. Ψήνει ψωμί, κουλούρια και τυρόπιτες. Οι πελάτες έρχονται νωρίς, πριν πάνε στη δουλειά." },
  { speaker: "", text: "Την περασμένη εβδομάδα έγινε απεργία στα πλοία και το λιμάνι ήταν άδειο. Η Μαρία πούλησε λιγότερα, αλλά δεν στεναχωρήθηκε." },
];
const segmentsListening = [
  { speaker: "Νίκος", text: "Γεια σου Ελένη! Πάμε στο νησί το Σάββατο;" },
  { speaker: "Ελένη", text: "Θα ήθελα, αλλά λένε ότι θα έχει απεργία στα πλοία." },
  { speaker: "Νίκος", text: "Τότε πάμε την Κυριακή. Θα κλείσω δωμάτιο σήμερα." },
];

function lesson(segments, title) {
  return {
    title,
    title_en: "Test title",
    topic: "everyday life",
    level: "B1",
    segments,
    glossary: [
      { greek: "το αρτοποιείο", english: "bakery", note: "το αρτοποιείο (n.)" },
      { greek: "η απεργία", english: "strike", note: "η απεργία (f.)" },
    ],
    tasks: [
      { type: "multiple_choice", skill: "gist", prompt: "Ποιο είναι το θέμα;", prompt_en: "What is the topic?", options: ["Η δουλειά της Μαρίας", "Ένα ταξίδι", "Ένα σχολείο", "Ο καιρός"], correct_index: 0, accepted_answers: [], pairs: [], explanation: "The text describes Maria's work." },
      { type: "multiple_choice", skill: "detail", prompt: "Τι ώρα ξυπνάει;", prompt_en: "What time does she wake up?", options: ["Στις έξι", "Στις πέντε", "Στις επτά", "Στις οκτώ"], correct_index: 1, accepted_answers: [], pairs: [], explanation: "«ξυπνάει στις πέντε»" },
      { type: "true_false", skill: "detail", prompt: "Το λιμάνι ήταν γεμάτο.", prompt_en: "The port was full.", options: ["Σωστό", "Λάθος"], correct_index: 1, accepted_answers: [], pairs: [], explanation: "«το λιμάνι ήταν άδειο»" },
      { type: "true_false", skill: "inference", prompt: "Η Μαρία είναι ήρεμος άνθρωπος.", prompt_en: "Maria is a calm person.", options: ["Σωστό", "Λάθος"], correct_index: 0, accepted_answers: [], pairs: [], explanation: "«δεν στεναχωρήθηκε»" },
      { type: "vocab_match", skill: "vocabulary", prompt: "Αντιστοίχισε.", prompt_en: "Match.", options: [], correct_index: -1, accepted_answers: [], pairs: [{ greek: "η απεργία", english: "strike" }, { greek: "το λιμάνι", english: "port" }, { greek: "ψήνει", english: "bakes" }, { greek: "άδειο", english: "empty" }], explanation: "" },
      { type: "gap_fill", skill: "grammar", prompt: "Η Μαρία ___ (πουλάω) λιγότερα.", prompt_en: "Maria sold less.", options: [], correct_index: -1, accepted_answers: ["πούλησε"], pairs: [], explanation: "Αόριστος: πούλησε." },
      { type: "short_answer", skill: "writing", prompt: "Θα ήθελες να δουλεύεις σε αρτοποιείο; Γιατί;", prompt_en: "Would you like to work in a bakery? Why?", options: [], correct_index: -1, accepted_answers: [], pairs: [], explanation: "Ναι, γιατί μου αρέσει το φρέσκο ψωμί." },
    ],
  };
}

const grading = {
  results: [{ task_id: "t7", score: 0.8, feedback: "Good answer; watch the verb ending.", corrected_answer: "Ναι, γιατί μου αρέσει το ψωμί." }],
  overall_comment: "Well done. Practise the aorist of -άω verbs.",
};

const newsReply = `TITLE: Απεργία στα πλοία την Πέμπτη
URL: https://www.ertnews.gr/eidiseis/test
PUBLISHER: ΕΡΤ
DATE: 2026-11-12
FACTS:
${"Οι ναυτεργάτες κήρυξαν απεργία 24 ωρών την Πέμπτη. Τα πλοία θα μείνουν δεμένα στα λιμάνια. ".repeat(5)}`;

const calls = { news: 0, lesson: 0, grading: 0, models: 0, wiki: 0 };

function msg(text, extra = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 3000, output_tokens: 2500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...extra },
  };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

async function mockApis(page) {
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.pathname.startsWith("/v1/models")) {
      calls.models++;
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }) });
    }
    const body = req.postDataJSON();
    // Current SDKs send the key as "Authorization: Bearer"; older ones used "x-api-key".
    const h = req.headers();
    if (h.authorization !== "Bearer sk-ant-test-key" && h["x-api-key"] !== "sk-ant-test-key") throw new Error("API key missing from request");
    if (h["anthropic-dangerous-direct-browser-access"] !== "true") throw new Error("browser-access header missing");
    let out;
    if (body.tools) {
      calls.news++;
      out = msg(newsReply, { server_tool_use: { web_search_requests: 1, web_fetch_requests: 1 } });
    } else if (body.output_config?.format?.schema?.properties?.tasks) {
      calls.lesson++;
      const listening = body.messages[0].content.includes("listening");
      out = msg(JSON.stringify(lesson(listening ? segmentsListening : segmentsReading, listening ? "Ταξίδι στο νησί" : "Το αρτοποιείο της Μαρίας")));
    } else {
      calls.grading++;
      out = msg(JSON.stringify(grading));
    }
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(out) });
  });

  await page.route("https://el.wikipedia.org/**", async (route) => {
    calls.wiki++;
    const u = new URL(route.request().url());
    let body;
    if (u.searchParams.get("generator") === "random") {
      body = { query: { pages: [{ title: "Θεσσαλονίκη", length: 90000 }, { title: "Μικρό", length: 300 }] } };
    } else if (u.searchParams.get("list") === "search") {
      body = { query: { search: [{ title: "Θεσσαλονίκη", size: 90000 }] } };
    } else {
      body = { query: { pages: [{ title: "Θεσσαλονίκη", fullurl: "https://el.wikipedia.org/wiki/Θεσσαλονίκη", extract: "Η Θεσσαλονίκη είναι η δεύτερη μεγαλύτερη πόλη της Ελλάδας. ".repeat(60) }] } };
    }
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  });
}

// Fake speech synthesis: one Greek voice; each sentence "finishes" after 30 ms.
const FAKE_TTS = () => {
  const voice = { name: "Test Ελληνικά", lang: "el-GR", voiceURI: "test-el", default: true, localService: true };
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ""; this.rate = 1; this.pitch = 1; this.onend = null; this.onerror = null; }
  }
  let timer = null;
  const synth = {
    spoken: [],
    getVoices: () => [voice],
    addEventListener() {},
    removeEventListener() {},
    speak(u) { synth.spoken.push(u.text); timer = setTimeout(() => u.onend && u.onend({}), 30); },
    cancel() { clearTimeout(timer); },
    pause() {}, resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
};

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function answerTasks(page, { wrongGap = false } = {}) {
  // 1 gist (correct = first option)
  await page.getByRole("button", { name: "Η δουλειά της Μαρίας" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Correct.").waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  // 2 detail (choose wrong on purpose)
  await page.getByRole("button", { name: "Στις έξι" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Not quite.").waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  // 3 true/false
  await page.getByRole("button", { name: "Λάθος" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // 4 inference
  await page.getByRole("button", { name: "Σωστό" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // 5 vocab match
  const map = { "η απεργία": "strike", "το λιμάνι": "port", "ψήνει": "bakes", "άδειο": "empty" };
  for (const [g, e] of Object.entries(map)) await page.getByLabel(`Meaning of ${g}`).selectOption(e);
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("4 of 4 right.").waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  // 6 gap fill (accent missing -> partial credit)
  await page.getByLabel("Your answer (Greek)").fill(wrongGap ? "πουλησε" : "πούλησε");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText(wrongGap ? "Almost." : "Correct.").waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  // 7 writing
  await page.getByLabel(/Your answer in Greek/).fill("Ναι, γιατί μου αρέσει πολύ το ψωμί.");
  await page.getByRole("button", { name: "Save answer" }).click();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(FAKE_TTS);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
await mockApis(page);

try {
  console.log("Home without key");
  await page.goto(BASE);
  await page.getByText("One-time setup").waitFor();
  assert(await page.getByRole("button", { name: /Reading/ }).isDisabled(), "sessions disabled without key");
  await page.screenshot({ path: SHOTS + "01-home-nokey.png", fullPage: true });

  console.log("Save key");
  await page.getByRole("button", { name: "Enter key" }).click();
  await page.getByLabel("API key").fill("sk-ant-test-key");
  await page.getByRole("button", { name: "Test & save" }).click();
  await page.getByText("Key works and is saved on this device.").waitFor();
  assert(calls.models === 1, "key tested via models endpoint");
  const stored = await page.evaluate(() => localStorage.getItem("akou.apikey.v1"));
  assert(stored.includes("sk-ant-test-key"), "key stored (plain, as chosen)");

  console.log("Reading session (Everyday source)");
  await page.goto(BASE + "#/");
  await page.getByRole("button", { name: "Everyday" }).click();
  await page.getByRole("button", { name: /^Reading/ }).click();
  await page.getByRole("heading", { name: "Το αρτοποιείο της Μαρίας" }).waitFor();
  assert(calls.lesson === 1 && calls.news === 0 && calls.wiki === 0, "AI source used only the lesson call");
  await page.getByRole("button", { name: "Show word help" }).click();
  await page.screenshot({ path: SHOTS + "02-reading.png", fullPage: true });
  await page.getByRole("button", { name: /Go to the questions/ }).click();
  await page.screenshot({ path: SHOTS + "03-task.png", fullPage: true });
  await answerTasks(page, { wrongGap: true });
  await page.getByText("Score").waitFor();
  assert(calls.grading === 1, "written answer sent for grading");
  const scoreText = await page.locator(".level-big").textContent();
  // 1 + 0 + 1 + 1 + 1 + 0.75 + 0.8 = 5.55 / 7 = 79%
  assert(scoreText === "79%", `score is 79% (got ${scoreText})`);
  await page.getByText("Corrected:").waitFor();
  await page.getByText("Practise the aorist").waitFor();
  await page.screenshot({ path: SHOTS + "04-results.png", fullPage: true });

  console.log("Listening session (Wikipedia source)");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Wikipedia" }).click();
  await page.getByRole("button", { name: /^Listening/ }).click();
  await page.getByRole("heading", { name: "Ταξίδι στο νησί" }).waitFor();
  assert(calls.wiki >= 2, "Wikipedia was queried");
  const goBtn = page.getByRole("button", { name: /Go to the questions/ });
  assert(await goBtn.isDisabled(), "questions locked until the audio was played");
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(() => window.speechSynthesis.spoken.length >= 4);
  await page.getByRole("button", { name: "Play" }).waitFor(); // finished -> back to Play
  const spoken = await page.evaluate(() => window.speechSynthesis.spoken);
  assert(spoken[0] === "Γεια σου Ελένη!" && spoken.length === 5, `spoken sentence by sentence (${spoken.length} sentences)`);
  await page.screenshot({ path: SHOTS + "05-listening.png", fullPage: true });
  await goBtn.click();
  await answerTasks(page);
  await page.getByText("Score").waitFor();
  await page.getByText("Adapted and simplified by AI from Greek Wikipedia").waitFor();

  console.log("News via pasted URL");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByText("Use a specific Greek article").click();
  await page.getByLabel("Article URL").fill("https://www.ertnews.gr/eidiseis/test");
  await page.getByRole("button", { name: "Read it" }).click();
  await page.getByRole("heading", { name: "Το αρτοποιείο της Μαρίας" }).waitFor();
  assert(calls.news === 1, "news fetch call made");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Leave session" }).click();

  console.log("Progress screen");
  await page.goto(BASE + "#/stats");
  await page.getByRole("heading", { name: "Estimated CEFR level" }).waitFor();
  assert((await page.locator(".chart circle").count()) === 2, "chart shows one point per session");
  await page.screenshot({ path: SHOTS + "06-stats.png", fullPage: true });
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem("akou.sessions.v1")).length);
  assert(sessions === 2, "two sessions recorded (abandoned one not saved)");

  console.log("Passphrase lock");
  await page.goto(BASE + "#/settings");
  await page.getByRole("button", { name: "Replace key" }).click();
  await page.getByLabel("API key").fill("sk-ant-test-key");
  await page.getByLabel("Protect it with a passphrase").check();
  await page.getByLabel("Passphrase (at least 6").fill("blue olive tree");
  await page.getByLabel("Repeat passphrase").fill("blue olive tree");
  await page.getByRole("button", { name: "Test & save" }).click();
  await page.getByText("Key works and is saved on this device.").waitFor();
  const enc = await page.evaluate(() => localStorage.getItem("akou.apikey.v1"));
  assert(!enc.includes("sk-ant"), "stored key is encrypted");
  await page.reload();
  await page.getByRole("heading", { name: "Unlock your API key" }).waitFor();
  await page.getByLabel("Passphrase").fill("wrong");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByText("Wrong passphrase.").waitFor();
  await page.getByLabel("Passphrase").fill("blue olive tree");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByText("unlocked now").waitFor();
  await page.goto(BASE + "#/");
  assert(!(await page.getByRole("button", { name: /^Reading/ }).isDisabled()), "unlocked: sessions enabled");

  console.log("Backup excludes key");
  await page.goto(BASE + "#/settings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const path = await dl.path();
  const { readFileSync } = await import("node:fs");
  const backup = readFileSync(path, "utf8");
  assert(!backup.includes("sk-ant") && backup.includes('"sessions"'), "backup has sessions and no key");

  console.log("Library: starter lesson is instant (no API call)");
  const lessonCallsBefore = calls.lesson;
  await page.goto(BASE + "#/");
  await page.getByText("4 lessons ready at your level").first().waitFor();
  const t0 = Date.now();
  await page.getByRole("button", { name: /^Reading/ }).click();
  await page.getByRole("heading", { name: "Το καφενείο του χωριού" }).waitFor();
  const instantMs = Date.now() - t0;
  assert(calls.lesson === lessonCallsBefore, "starter lesson used without generating");
  assert(instantMs < 3000, `starter lesson opened in ${instantMs} ms`);
  await page.getByText("starter", { exact: true }).waitFor();
  await page.screenshot({ path: SHOTS + "08-starter.png", fullPage: true });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Leave session" }).click();

  console.log("Library: background refill at a level with no starters (C1)");
  await page.evaluate(() => {
    localStorage.setItem("akou.progress.v1", JSON.stringify({ reading: { theta: 4.9, n: 5 }, listening: { theta: 4.9, n: 5 } }));
  });
  await page.goto(BASE + "#/");
  await page.reload();
  await page.getByLabel("Passphrase").fill("blue olive tree"); // the key was locked earlier in this test
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("akou.stock.v1") || "{}");
    return (s.reading || []).length === 3 && (s.listening || []).length === 3;
  }, null, { timeout: 30000 });
  await page.getByText("3 lessons ready at your level").nth(1).waitFor();
  await page.screenshot({ path: SHOTS + "09-refilled.png", fullPage: true });
  assert(calls.lesson === lessonCallsBefore + 6, `refill generated 3 + 3 lessons (${calls.lesson - lessonCallsBefore})`);
  const levels = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("akou.stock.v1"));
    return [...s.reading, ...s.listening].map((i) => i.lesson.level);
  });
  assert(levels.every((l) => l === "C1"), "generated lessons carry the requested level (C1)");
  await page.waitForTimeout(500);
  assert(calls.lesson === lessonCallsBefore + 6, "refill stops at 3 per mode");

  console.log("Library: refilled lesson is used instantly");
  await page.getByRole("button", { name: /^Listening/ }).click();
  await page.getByRole("heading", { name: "Ταξίδι στο νησί" }).waitFor();
  assert(calls.lesson === lessonCallsBefore + 6, "no generation when a stocked lesson exists");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Leave session" }).click();

  console.log("Dark mode render");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(BASE + "#/stats");
  await page.getByRole("heading", { name: "Estimated CEFR level" }).waitFor();
  await page.screenshot({ path: SHOTS + "07-stats-dark.png", fullPage: true });

  const relevant = consoleErrors.filter((e) => !/favicon/i.test(e));
  assert(relevant.length === 0, `no console errors / CSP violations${relevant.length ? ": " + relevant.join(" | ") : ""}`);
  console.log("\nALL CHECKS PASSED", calls);
} catch (e) {
  await page.screenshot({ path: SHOTS + "failure.png", fullPage: true }).catch(() => {});
  console.error(e);
  console.error("console errors:", consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
