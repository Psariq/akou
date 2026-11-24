// Greek spelling + accent lint for lesson JSON files.
// Usage: node scripts/library/spellcheck.mjs src/data/library/<file>.json [more files...]
// Names and rare valid words can be allowed with ALLOW=word1,word2 (lower case).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nspell from "nspell";

// Hunspell Greek dictionary (devDependency `dictionary-el`).
const dir = path.dirname(createRequire(import.meta.url).resolve("dictionary-el"));
const spell = nspell(fs.readFileSync(path.join(dir, "index.aff")), fs.readFileSync(path.join(dir, "index.dic")));

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const ACC = /[άέήίόύώΐΰΆΈΉΊΌΎΏ]/g;
// Monosyllables by synizesis, written without an accent.
const SYNIZESIS = new Set(
  "για γεια πια πιο γιος γιο γιοι γιους μια μιας δυο ποιος ποια ποιο ποιοι ποιες ποιους ποιον ποιας ποιανού νιος νια".split(" "),
);
const vowelGroups = (w) =>
  (w.toLowerCase().replace(/(αι|ει|οι|ου|υι|αυ|ευ|ηυ)(?![̈])/g, "a").match(/[αεηιουωάέήίόύώϊϋΐΰ]+/g) || []).reduce(
    (n, g) => n + [...g].length,
    0,
  );
const extra = new Set((process.env.ALLOW || "").split(",").filter(Boolean));

const problems = [];
const seen = new Map();
function checkText(where, text) {
  for (const m of text.matchAll(WORD)) {
    const w = m[0].replace(/['’]$/, "");
    if (!GREEK.test(w)) continue;
    const parts = w.split(/['’]/);
    for (const p of parts) {
      if (!p) continue;
      const lower = p.toLowerCase();
      if (/σ$/.test(p) || /ς./.test(p)) problems.push(`${where}: sigma «${p}»`);
      const accents = (p.match(ACC) || []).length;
      const vg = vowelGroups(p);
      // A second accent on the last syllable is right before an enclitic (το όνομά μου).
      if (accents > 2 || (accents === 2 && !/[άέήίόύώ][^αεηιουωάέήίόύώ]*$/.test(lower))) problems.push(`${where}: two accents «${p}»`);
      if (accents === 0 && vg >= 2 && !SYNIZESIS.has(lower) && p === lower && parts.length === 1)
        problems.push(`${where}: no accent «${p}»`);
      const key = p;
      if (extra.has(lower) || seen.has(key)) continue;
      const ok = spell.correct(p) || spell.correct(lower);
      seen.set(key, ok);
      if (!ok) problems.push(`${where}: unknown «${p}» → ${spell.suggest(p).slice(0, 3).join(", ")}`);
    }
  }
}

for (const f of process.argv.slice(2)) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const lessons = Array.isArray(data) ? data : data.lessons;
  for (const l of lessons) {
    const id = l.id;
    checkText(`${id} title`, l.title);
    l.segments.forEach((s, i) => checkText(`${id} seg${i}`, Array.isArray(s) ? s.join(" ") : s));
    (l.glossary || []).forEach((g) => checkText(`${id} glossary`, g[0] + " " + (g[2] || "")));
    (l.tasks || []).forEach((t, i) => {
      checkText(`${id} t${i + 1}`, [t.prompt, ...(t.options || []), ...(t.accept || []), ...(t.pairs || []).map((p) => p[0]), t.explain || ""].join(" "));
    });
    (l.words || []).forEach((g) => checkText(`${id} words`, g[0] + " " + g[1]));
  }
}
const uniq = [...new Set(problems)];
console.log(uniq.join("\n") || "no problems");
console.log(`\n${uniq.length} issue(s)`);
