# Built-in lesson library: how to restock

The app ships with a library of ready-made lessons in `src/data/library/`. Each lesson includes its word translations, so it costs nothing on the API key: no lesson writing and no translation calls. When fewer than **10** unused built-in lessons are left at the learner's level for reading or for listening, the app shows a reminder ("Built-in lessons are running low"). The reminder appears on the Practice screen and on the placement-test result after new levels are applied.

The app cannot write library lessons itself because it has no server. Restocking is done in Claude Code on this repository. The new lessons go live with the next publish to `main`.

## What is in the library now

| Mode | A2 | B1 |
|---|---|---|
| Reading | 22 (`lib-reading-A2-01`…`22`) | 8 (`lib-reading-B1-01`…`08`) |
| Listening | 22 (`lib-listening-A2-01`…`22`) | 8 (`lib-listening-B1-01`…`08`) |

There are also older built-in lessons without bundled translations: 8 based on Wikipedia articles (`src/data/open`) and 4 per mode and level at A2, B1 and B2 (`src/data/starter`). The reminder counts these too.

## How lessons are picked (why restocking matters)

- **Built-in lessons first.** At the learner's level, the app uses unused built-in lessons before writing new ones with the API.
- **1 lesson in 4 is a graded text** from the Centre for the Greek Language (written with the API), while built-in lessons last (`GRADED_EVERY = 4` in `src/lib/library.ts`). The graded text is prepared in the background one session before it is due. Until it is due, it waits in the stock.
- **When built-in lessons run out** at a level (fewer than 2 left), the normal refill starts and every lesson is written with the API key. At the current prices that is roughly $0.37 per lesson, plus translations.

## Restock procedure (for Claude Code)

Ask Claude Code something like: *"Add 20 B1 lessons to the library (10 reading, 10 listening), following docs/LIBRARY.md."* Then follow these steps.

### 1. Decide what is needed

Check which levels the learner is at (the reminder names them) and how many lessons are left. Write lessons in batches of 4 per file.

### 2. Write the lesson file

Name the file `src/data/library/<mode>-<level>-NN.json`, continuing the numbering, e.g. `reading-B1-04.json`. Continue the ids too: `lib-reading-B1-09` follows `lib-reading-B1-08`. The files are read in name order, and lessons inside a file in array order.

Each file is a JSON array of lessons:

```json
{
  "id": "lib-listening-B1-05",
  "mode": "listening",
  "level": "B1",
  "title": "Ένας λογαριασμός με έκπληξη",
  "title_en": "A surprising bill",
  "topic": "customer service, phone call, bills",
  "segments": [["Υπάλληλος", "Εξυπηρέτηση πελατών, καλημέρα σας. …"], ["Κώστας", "…"]],
  "glossary": [["η δόση", "instalment", "η δόση (f.)"], …],
  "tasks": [ … 7 tasks, see below … ],
  "words": []
}
```

- **segments:**
  - Reading: plain strings, one per paragraph.
  - Listening: `[speaker, text]` pairs. Use a label such as `"Ανακοίνωση"` for a single voice.
- **glossary:** `[Greek, English, note]`. At least 6 key words.
- **tasks:** exactly 7, in this skill order: gist, detail, detail, inference, vocabulary, grammar, writing. Look at any existing file for the exact shape. Usually:
  1. `multiple_choice` (gist): 4 options, `answer` is the index of the correct option.
  2. `multiple_choice` (detail).
  3. `true_false` (detail): `answer` 0 = true, 1 = false.
  4. `true_false` (inference): the answer must follow from the text without being stated in it.
  5. `vocab_match`: exactly 4 `pairs`.
  6. `gap_fill` (grammar): one sentence from the text with exactly one `___` and the lemma in brackets. The `accept` forms must appear in the text.
  7. `short_answer` (writing): `explain` holds a model answer.
- **Length (words):**
  - Reading: A2 150–210, B1 220–300, B2 290–370.
  - Listening: A2 120–170, B1 170–240, B2 230–300.

  The values come from `wordRange` in `src/lib/prompts.ts`. The tests allow ±10%.

Quality rules that the tests cannot check:

- Natural, correct Modern Greek at the stated CEFR level. Use everyday topics and vary the text types: dialogues, announcements, interviews, emails, articles.
- Facts must be true: places, history, health advice. Invented people and businesses are fine. Don't present invented events about real people or organisations as fact.
- Distractors must be plausible and not obviously shorter or longer than the answer. Two tests check this across the whole built-in set:
  - the correct option is the longest less than 35% of the time
  - no answer is more than 1.6× the average distractor length

  Options are shuffled when shown, so the stored answer position doesn't matter.
- Don't repeat topics already in the library. Check the `topic` fields first.

### 3. Word translations

```sh
python3 scripts/library/tools.py tokens src/data/library/listening-B1-02.json
```

This lists every distinct word form per lesson (and the word count). Write a gloss file outside the repo with one line per form, translated **as used in this text**:

```
## lib-listening-B1-05
δόσεις|η δόση|instalments|acc. pl.
πήρα|παίρνω|I got, I received|past, 1st sg.
```

Format: `form|dictionary form|meaning|grammar note`. Then merge it into the lesson file:

```sh
python3 scripts/library/tools.py merge src/data/library/listening-B1-02.json /path/to/glosses.txt
```

The merge prints `MISSING:` for words without a translation and `STRAY:` for entries not in the text. Fix both and merge again. Merging replaces the whole `words` array and reformats the file.

### 4. Spelling check

```sh
node scripts/library/spellcheck.mjs src/data/library/listening-B1-02.json
```

This checks the file against the Hunspell Greek dictionary (devDependency `dictionary-el`), plus accent and final-sigma rules. Names, loanwords (τάμπλετ, φρέντο) and some valid words missing from the dictionary (ιστολόγιο) are flagged too: check each flag, don't just silence it. An accent added before an enclitic (`Μύρισέ το`) is correct.

### 5. Tests, build, e2e

```sh
npx vitest run           # includes src/lib/libraryData.test.ts: format, length, tasks, translations
npm run build
npx vite preview --port 4173 &  node e2e/smoke.mjs
```

The e2e script asserts how many lessons are ready at B1 ("14 lessons ready at your level") and how many are left in the placement reminder check. Update those numbers when adding B1 lessons.

### 6. Publish

Commit to the work branch. Publishing to `main` (which deploys the app) only happens after the owner confirms.

## Size

The library is bundled into the app's main script. On 24 November 2026, the 60 lessons took the script from 104 KB to 266 KB gzipped. The service worker caches it after the first load. Each further 60 lessons will add roughly the same amount. If the library grows past a few hundred lessons, load the files lazily (non-eager `import.meta.glob`) instead.

## Where the code is

- `src/lib/libraryData.ts`: loads `src/data/library/*.json`; `bundledGlosses()`.
- `src/lib/library.ts`:
  - `STARTER` (all built-in lessons)
  - `builtInLeft()`, `LOW_LIBRARY`
  - the graded-text quota (`sessionsSinceGraded`, `gradedDue`, `gradedPrepareNow`)
- `src/lib/glosses.ts`: bundled translations are used before stored or generated ones.
- `src/components/LibraryNote.tsx`: the reminder. "Remind me in a week" hides it for 7 days; it comes back earlier if the level changes.
- `src/useRefill.ts`: background work; prepares the graded text for every 4th lesson.
