# Άκου – Greek reading & listening trainer

A small installable web app (PWA) for learners of Modern Greek at about A2–B2:

- **Reading:** a ≈5-minute text adapted to your level, then ≈5 minutes of tasks.
- **Listening:** a 2–3-minute script read aloud by your device's Greek voice (replay allowed), then ≈5 minutes of tasks.
- **Tasks:** main idea, details, true/false, inference, vocabulary matching, a grammar gap fill, and a short written answer that is graded by AI with corrections.
- **Texts from:** graded texts and original radio/TV recordings from the Centre for the Greek Language, Greek Wikipedia (simplified), AI-written everyday dialogues, and, only when you choose it, current Greek news. You can also paste a link to a specific article.
- **Progress:** an estimated CEFR level for reading and listening, a chart over time, accuracy by task type, streaks, minutes, words from your texts, and estimated API cost.

Sessions start instantly from a **lesson library**: 92 built-in lessons (60 of them with word translations included), plus lessons the app generates in the background and keeps on your device.

There is no server. The app is static files; it calls the Anthropic API directly from your browser with **your own API key**, and stores everything on your device.

## Setup

1. **Create a capped API key** (the in-app *Setup guide* has the same steps):
   1. Sign in at [console.anthropic.com](https://console.anthropic.com) and add credit. API usage is billed separately from a Claude.ai subscription.
   2. Create a workspace just for this app, open it and set a monthly **Spend limit** ([docs](https://platform.claude.com/docs/en/manage-claude/workspaces)).
   3. Create an API key **in that workspace** (workspace-scoped keys can only access that workspace).
   4. Open the app → *Settings* → paste the key → *Test & save*. Optionally protect it with a passphrase.
2. **Install it on your phone:** open the site, then *Share → Add to Home Screen* (iPhone) or *⋮ → Install app* (Android Chrome).
3. **Greek voice:** if *Settings → Greek voice* finds none, install one in your OS text-to-speech settings (see the in-app guide).

## Deploy (free static hosting)

A workflow in `.github/workflows/deploy.yml` tests, builds and publishes to **GitHub Pages** on every push to `main`. In the repository go to *Settings → Pages → Build and deployment → Source: GitHub Actions*. GitHub Pages is free for public repositories; for a private repository it needs a paid GitHub plan. Alternatively, any static host works (Cloudflare Pages, Netlify): build command `npm run build`, output directory `dist`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (level estimate, grading, encryption, parsing)
npm run build      # type-check + production build into dist/
```

End-to-end smoke test (production build, phone viewport; Anthropic API, Wikipedia and speech are mocked, so no key or cost):

```bash
npm run build && npx vite preview --port 4173 &
node e2e/smoke.mjs   # requires the `playwright` package with Chromium
```

## Writing

Every exercise ends with a short written answer (2–3 sentences), graded by AI with corrections. The grader also judges which CEFR level the writing shows; these judgements are averaged into a **writing estimate** (rougher than reading/listening, especially above B1).

Every 4th exercise (configurable: 3rd / 4th / 6th / never) asks for a **longer answer** instead.

| Level | Normal answer | Longer answer |
|---|---|---|
| A2 | 15–30 words | 40–70 words |
| B1 | 20–40 words | 70–110 words |
| B2+ | 30–50 words | 110–160 words |

While typing, a counter shows how many words are still needed ("12 words to go"), then "within the target" or "a bit over" (a hint, never a block). The grader gets the same word target. Ranges are the app's own choice, not official exam figures. At most one per sitting (exercises less than 2 hours apart). Longer answers count double for the writing estimate. Logic: `src/lib/writing.ts`.

## Extra practice for weak areas

A task type (grammar, vocabulary, details, inference) counts as weak when less than 60% of your last 10 answers of that type were right (at least 4 answers, reading and listening together). Exercises then get up to 2 extra questions per weak type, at most 3 in total, inserted before the writing task and made from the same text. Extras count for *accuracy by task type* (so they stop once you improve) but **not** for the exercise score or the CEFR estimate. They're prepared in the background (one small request per lesson, max 20 per day) and can be switched off in Settings. Logic: `src/lib/practice.ts`.

## Monthly placement test

In the last 7 days of each month (and, if missed, until the 7th of the next) the home screen offers a placement test; it can also be started from *Progress*, once per month. Reading (+ one longer writing task) and listening are separate parts and can be done on different days.

- **Adaptive, 2 texts per skill:** text 1 at the current level; text 2 one level higher if ≥ 60% was right, otherwise one lower. Graded texts from the Centre's text bank where possible; for listening, an original recording from its multimedia bank first (played at natural speed). 6 questions per text plus one extra detail and one inference question. No word help, translations or key words.
- **Result:** the level that best fits both scores under the app's expected-score model (least squares), at most one level beyond what was tested; writing = the CEFR level the longer answer shows. Shown next to the current estimates; **you choose** "Apply new levels" or "Keep current levels".
- Texts are prepared in the background during the window (text 1 and both possible text 2s). Logic: `src/lib/placement.ts`.

## Tap a word to translate it

In reading texts and transcripts every word can be tapped. A sheet shows the dictionary form, the meaning **in this text**, a short grammar note and a button to hear the word.

- The 60 library lessons (`src/data/library/`) ship with their glosses: no API call. For every other lesson, Claude writes a gloss for each distinct word form once, in the background, a couple of lessons ahead of time. Stored on the device (`src/lib/glosses.ts`); the cost is added to the session that uses the lesson.
- A word without a gloss yet is looked up on its own (one small request) and remembered.
- Tapped words appear under *Progress → Words you looked up*.
- Safety cap: at most 20 gloss generations per 24 hours.

## Sources and licences

| Source | Licence / terms | How Άκου uses it |
|---|---|---|
| [Greek Wikipedia](https://el.wikipedia.org) | CC BY-SA 4.0 (per the site's API, checked Nov 2026) | 8 built-in lessons adapted from articles (`src/data/open/wikipedia.json`, attribution per lesson; the adaptations are CC BY-SA 4.0 too). At runtime, articles are loaded directly from the browser and simplified by AI. |
| [Text bank (Τράπεζα κειμένων)](https://www.greek-language.gr/certification/dbs/teachers/index.html) of the Centre for the Greek Language (ΚΕΓ) | © ΚΕΓ; **not** an open licence. The site states the texts may be used for teaching and to prepare learners for the certification exams, and may be modified or simplified. | Only an index (id, title, CEFR level, skill) is stored in the repo (`src/data/textbank-index.json`, rebuilt with `scripts/build-textbank-index.py`). Texts are fetched on demand by Claude's web-fetch tool for the learner's personal study and kept only on their device. |
| [Multimedia bank (Τράπεζα πολυμεσικού υλικού)](https://www.greek-language.gr/certification/dbs/media/index.html) of the Centre for the Greek Language | © ΚΕΓ and the broadcasters; no reuse terms stated. Collected by the Centre, graded by level, for listening comprehension. | 110 authentic radio/TV recordings (A2 7, B1 21, B2 29, C1 34, C2 19). Only an index (id, title, level, mp3 address) is in the repo (`src/data/media-index.json`, rebuilt with `scripts/build-media-index.py`). The mp3 is streamed from the Centre's site when played; Claude fetches the transcript on demand. Nothing is redistributed. |
| Current news sites | Publishers' copyright | Only when “News” is chosen or a link is pasted; fetched for personal study, never used for background lessons. |
| AI-written texts | — | 84 built-in fictional lessons: 24 starters (`src/data/starter/`) and the 60-lesson library with word translations (`src/data/library/`, written in Claude Code), plus occasional listening dialogues. |

Considered and not used (checked Nov 2026):
- Children's story platforms with Greek translations: Global Storybooks "Ιστορίες για την Ελλάδα" (40 stories, CC BY / CC BY-NC, no Greek audio yet), StoryWeaver (61 Greek books). Volunteer translations for children, no more reliable than AI text.
- Greek Wikivoyage (CC BY-SA 4.0, 1,436 articles, 8 active users): native text but list-heavy; would need AI adaptation.
- Greek school textbooks (ebooks.edu.gr): free for school use, not an open licence, written for Greek children.
- University of Athens «Κείμενα για νέους σε απλά ελληνικά» (4 volumes, free distribution): written for learners aged 11–15; servers didn't respond when checked.
- Commercial graded readers with free samples (Greek Easy Readers, ReadNative, PollyStop): all rights reserved, partly AI-made.

Earlier: Greek Wikinews (CC BY 4.0, but only ~3,100 articles, one active user and some unreliable recent articles), Tatoeba (sentences, not texts), Mozilla Common Voice (CC0 sentences with audio, but not connected texts).

## Lesson library

- **Built-in lessons:** 92 in total, all free and available offline:
  - 8 adapted from Greek Wikipedia (used first)
  - a 60-lesson library with word translations included: 22 reading and 22 listening at A2, 8 and 8 at B1
  - 24 starters (4 reading and 4 listening at each of A2, B1 and B2)

  All except the Wikipedia ones were written by AI (Claude) and are fictional. None were reviewed by a native speaker.
- **1 lesson in 4 is a graded text** while built-in lessons last: after 3 sessions of a mode on other texts, the next one comes from the Centre for the Greek Language, written with the API. It is prepared in the background one session ahead.
- **Original recordings for graded listening:** a graded listening lesson (and the placement test's listening part) uses an authentic radio/TV recording from the Centre's multimedia bank if one is left at your level; the lesson plays the real mp3 instead of text-to-speech, starting at natural speed. Claude copies the transcript word for word, and the app checks that against the fetched page (at least 90% of the words in sentences found verbatim, `src/lib/transcript.ts`); a recording that fails is skipped from then on and a graded text is used instead. When no recording is left at a level, graded listening falls back to text-bank texts read by text-to-speech.
- **Restock reminder:** when fewer than **10** unused built-in lessons are left at your level for reading or listening, the Practice screen says so (you can snooze it for a week). The same check runs on the placement result after new levels are applied. Restocking is done in Claude Code: see [docs/LIBRARY.md](docs/LIBRARY.md).
- **Stock on your device:** when fewer than **2** unused lessons (built-in or generated) are left at your current level for a mode, the app generates new ones in the background (one at a time) until there are **3**. Generation uses the model from Settings; it typically takes a few minutes per lesson.
- **Background sources:** the graded text bank (about 60%, matched to your level and to reading/listening) and Wikipedia; listening also uses AI-written dialogues now and then. If a source fails, the next one is tried. News is never used in the background.
- **Choosing a lesson** (with source “Mixed”): exact level first, then the nearest level (at most one away, easier preferred). Within a level: fresh news lessons, then other generated ones, then built-in ones; a graded text that isn't due yet comes last. Lessons you've done are never repeated; news lessons expire after 4 days.
- With a specific source (Graded / Wiki / News / Everyday), a ready lesson from that source is used if there is one; otherwise one is generated on the spot. A pasted link is always generated on the spot.
- **Limits:** without a server, refilling only happens while the app is open (phones pause web apps in the background). Background generation is capped at 12 lessons per 24 hours as a cost safeguard. Rules live in `src/lib/library.ts` and `src/useRefill.ts`.

## Security model

Without a server, the API key has to live in the browser. What limits the risk:

- **Damage cap:** use a workspace-scoped key with a monthly spend limit. Worst case if the key leaks is that limit; you can disable or delete the key in the Console at any time.
- **No third-party code at runtime:** everything is bundled; no CDNs, analytics or ads.
- **Content Security Policy** (added to the production build in `vite.config.ts`): scripts only from the app itself; network connections only to `api.anthropic.com` and `el.wikipedia.org`; audio only from `www.greek-language.gr` (original recordings; these requests carry no key or learning data).
- **Untrusted text is never rendered as HTML.** Fetched articles and AI output are displayed as plain text by React.
- **The key is never part of a prompt**, so a malicious web page can't make the model reveal it. Prompts tell the model to treat fetched pages as data.
- **Optional passphrase:** the key is stored AES-GCM-encrypted (PBKDF2-SHA-256, 600k iterations) and unlocked per visit. This protects against someone reading the browser's storage; it does not protect against malicious code running in the unlocked app, and short PINs can be brute-forced offline.
- **Backups** (export/import JSON) never include the key.

## How the level estimate works (and its limits)

Each text is generated for a CEFR level slightly above your current estimate. After a session, your score is compared with the score expected from someone exactly at your estimate on a text of that level; the estimate moves up or down accordingly (an Elo-style update whose steps shrink as sessions accumulate). See `src/lib/cefr.ts`.

This is **not** an official CEFR assessment (official Greek certification is the *Πιστοποίηση Ελληνομάθειας* by the Centre for the Greek Language). AI-generated texts vary in difficulty, and only reading and listening are covered.

## Cost

Each exercise involves several Messages API calls: writing the lesson (in the background or on the spot), word translations for the whole text, grading of the written answer, and sometimes extra practice, single-word lookups or a news search. Costs are estimated from the returned token counts and list prices (`src/lib/pricing.ts`); your Anthropic Console shows the real bill. The model is selectable in Settings (Claude Opus 5.5 by default; Sonnet 5.5 and Haiku 5.5 are cheaper).

*Progress → Where the API cost goes* breaks the spend down by job (last 7 days, this month, all tracked) and shows the cost per exercise done. Every response is logged when it arrives (`src/lib/ledger.ts`, on the device only), so it also counts failed attempts and work that is never used; lessons that are ready but not used yet, and lessons dropped unused, are listed separately.

Not used: the Message Batches API (50% off for work no one waits for). Its endpoints refuse requests from browsers (CORS preflight answered with “Disallowed CORS origin” for every origin tested, Nov 2026, while `/v1/messages` allows them), so it would need a server.

## Content and copyright

- Wikipedia texts are adapted from Greek Wikipedia (CC BY-SA 4.0); the app links to the source article.
- News articles belong to their publishers. The app fetches them for your personal study and shows an adapted version with a link to the original; don't republish the adaptations.
- AI adaptations can contain mistakes; check the original for facts.

## Project layout

```
src/lib/       cefr.ts (estimate) · grading.ts · claude.ts (API calls) · prompts.ts
               sources.ts (Wikipedia, topics) · tts.ts (speech) · storage.ts · crypto.ts · stats.ts · pricing.ts
src/components SessionView (reading/listening flow) · Tasks · Player · Stats · LevelChart · SettingsView · Guide · Unlock
public/        manifest, icons, service worker (offline app shell)
src/data/library  built-in lessons with word translations (restocking: docs/LIBRARY.md)
scripts/library   tools for writing them: word list, merging translations, Greek spelling check
e2e/smoke.mjs  end-to-end test with mocked APIs
```
