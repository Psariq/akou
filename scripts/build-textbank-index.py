#!/usr/bin/env python3
"""Build src/data/textbank-index.json: metadata (id, title, level, skill) of the
Centre for the Greek Language's text bank for learners of Greek
(https://www.greek-language.gr/certification/dbs/teachers/index.html).

Only the index is stored in the repository. The texts themselves are not open-licensed,
so the app fetches a text on demand for personal study and never redistributes it."""
import html, json, re, sys, time, urllib.request

BASE = "https://www.greek-language.gr/certification/dbs/teachers/index.html"
LEVELS = {"Α1": "A1", "Α2": "A2", "Β1": "B1", "Β2": "B2", "Γ1": "C1", "Γ2": "C2"}
SKILLS = {"ΚΓΛ": "reading", "ΚΠΛ": "listening"}
ROW = re.compile(
    r'<a href="/certification/dbs/teachers/show\.html\?id=(\d+)">(.*?)</a></td>\s*'
    r'<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>', re.S)

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # slow server: back off and retry
            print(f"retry {i+1} {url}: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise SystemExit(f"failed: {url}")

def main(out):
    first = get(BASE)
    total = int(re.search(r"(\d+) εγγραφές", first).group(1))
    items = []
    for start in range(0, total, 20):
        page = first if start == 0 else get(f"{BASE}?start={start}")
        for id_, title, level, skill in ROW.findall(page):
            level, skill = level.strip(), skill.strip()
            # Codes appear with Greek capital letters; normalise lookalike Latin letters.
            level = level.replace("A", "Α").replace("B", "Β")
            if level not in LEVELS or skill not in SKILLS:
                continue  # skip children's A1, professional A2, "language use" items
            items.append({"id": int(id_), "title": html.unescape(title).strip(),
                          "level": LEVELS[level], "skill": SKILLS[skill]})
        print(f"{start + 20}/{total}: {len(items)} kept", file=sys.stderr)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"source": BASE, "retrieved": time.strftime("%Y-%m-%d"), "total_listed": total,
                   "items": items}, f, ensure_ascii=False, indent=1)
        f.write("\n")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "src/data/textbank-index.json")
