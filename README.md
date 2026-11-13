# Άκου – Greek reading & listening trainer

A small installable web app (PWA) for learners of Modern Greek at about A2–B2:

- **Reading:** a ≈5-minute text adapted to your level, then ≈5 minutes of tasks.
- **Listening:** a 2–3-minute script read aloud by your device's Greek voice (replay allowed), then ≈5 minutes of tasks.
- **Tasks:** main idea, details, true/false, inference, vocabulary matching, a grammar gap fill, and a short written answer that is graded by AI with corrections.
- **Texts from:** graded texts from the Centre for the Greek Language's text bank, Greek Wikipedia (simplified), AI-written everyday dialogues, and, only when you choose it, current Greek news. You can also paste a link to a specific article.
- **Progress:** an estimated CEFR level for reading and listening, a chart over time, accuracy by task type, streaks, minutes, words from your texts, and estimated API cost.

Sessions start instantly from a **lesson library**: 24 built-in starter lessons (4 reading + 4 listening at each of A2, B1, B2), plus lessons the app generates in the background and keeps on your device.

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

## Tap a word to translate it

In reading texts and transcripts every word can be tapped. A sheet shows the dictionary form, the meaning **in this text**, a short grammar note and a button to hear the word.

- For every lesson (built-in and generated), Claude writes a gloss for each distinct word form once, in the background, a couple of lessons ahead of time. Stored on the device (`src/lib/glosses.ts`); the cost is added to the session that uses the lesson.
- A word without a gloss yet is looked up on its own (one small request) and remembered.
- Tapped words appear under *Progress → Words you looked up*.
- Safety cap: at most 20 gloss generations per 24 hours.

## Sources and licences

| Source | Licence / terms | How Άκου uses it |
|---|---|---|
| [Greek Wikipedia](https://el.wikipedia.org) | CC BY-SA 4.0 (per the site's API, checked Nov 2026) | 8 built-in lessons adapted from articles (`src/data/open/wikipedia.json`, attribution per lesson; the adaptations are CC BY-SA 4.0 too). At runtime, articles are loaded directly from the browser and simplified by AI. |
| [Text bank (Τράπεζα κειμένων)](https://www.greek-language.gr/certification/dbs/teachers/index.html) of the Centre for the Greek Language (ΚΕΓ) | © ΚΕΓ; **not** an open licence. The site states the texts may be used for teaching and to prepare learners for the certification exams, and may be modified or simplified. | Only an index (id, title, CEFR level, skill) is stored in the repo (`src/data/textbank-index.json`, rebuilt with `scripts/build-textbank-index.py`). Texts are fetched on demand by Claude's web-fetch tool for the learner's personal study and kept only on their device. |
| Current news sites | Publishers' copyright | Only when “News” is chosen or a link is pasted; fetched for personal study, never used for background lessons. |
| AI-written texts | — | 24 built-in fictional lessons (`src/data/starter/`) and occasional listening dialogues. |

Considered and not used: Greek Wikinews (CC BY 4.0, but only ~3,100 articles, one active user and some unreliable recent articles), Tatoeba (sentences, not texts), Mozilla Common Voice (CC0 sentences with audio, but not connected texts).

## Lesson library

- **Built-in lessons:** 8 adapted from Greek Wikipedia (used first) and 24 written by AI (Claude), fictional and not reviewed by a native speaker. They cost nothing and work offline.
- **Stock on your device:** when fewer than **2** unused lessons are left at your current level for a mode, the app generates new ones in the background (one at a time) until there are **3**. Generation uses the model from Settings; it typically takes a few minutes per lesson.
- **Background sources:** the graded text bank (about 60%, matched to your level and to reading/listening) and Wikipedia; listening also uses AI-written dialogues now and then. If a source fails, the next one is tried. News is never used in the background.
- **Choosing a lesson** (with source “Mixed”): exact level first, then the nearest level (at most one away, easier preferred). Within a level: fresh news lessons, then other generated ones, then starters. Lessons you've done are never repeated; news lessons expire after 4 days.
- With a specific source (Graded / Wiki / News / Everyday), a ready lesson from that source is used if there is one; otherwise one is generated on the spot. A pasted link is always generated on the spot.
- **Limits:** without a server, refilling only happens while the app is open (phones pause web apps in the background). Background generation is capped at 12 lessons per 24 hours as a cost safeguard. Rules live in `src/lib/library.ts` and `src/useRefill.ts`.

## Security model

Without a server, the API key has to live in the browser. What limits the risk:

- **Damage cap:** use a workspace-scoped key with a monthly spend limit. Worst case if the key leaks is that limit; you can disable or delete the key in the Console at any time.
- **No third-party code at runtime:** everything is bundled; no CDNs, analytics or ads.
- **Content Security Policy** (added to the production build in `vite.config.ts`): scripts only from the app itself; network connections only to `api.anthropic.com` and `el.wikipedia.org`.
- **Untrusted text is never rendered as HTML.** Fetched articles and AI output are displayed as plain text by React.
- **The key is never part of a prompt**, so a malicious web page can't make the model reveal it. Prompts tell the model to treat fetched pages as data.
- **Optional passphrase:** the key is stored AES-GCM-encrypted (PBKDF2-SHA-256, 600k iterations) and unlocked per visit. This protects against someone reading the browser's storage; it does not protect against malicious code running in the unlocked app, and short PINs can be brute-forced offline.
- **Backups** (export/import JSON) never include the key.

## How the level estimate works (and its limits)

Each text is generated for a CEFR level slightly above your current estimate. After a session, your score is compared with the score expected from someone exactly at your estimate on a text of that level; the estimate moves up or down accordingly (an Elo-style update whose steps shrink as sessions accumulate). See `src/lib/cefr.ts`.

This is **not** an official CEFR assessment (official Greek certification is the *Πιστοποίηση Ελληνομάθειας* by the Centre for the Greek Language). AI-generated texts vary in difficulty, and only reading and listening are covered.

## Cost

Each session makes 2–3 Messages API calls (news search/fetch if that source is used, lesson generation, grading of the written answer). The app estimates the cost of each session from the returned token counts and list prices (`src/lib/pricing.ts`) and shows a monthly total. Your Anthropic Console shows the real bill. The model is selectable in Settings (Claude Opus 5.5 by default; Sonnet 5.5 and Haiku 5.5 are cheaper).

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
e2e/smoke.mjs  end-to-end test with mocked APIs
```
