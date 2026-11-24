#!/usr/bin/env python3
"""Build src/data/media-index.json: metadata (id, title, level, audio URL) of the
recordings in the Centre for the Greek Language's multimedia bank
(https://www.greek-language.gr/certification/dbs/media/index.html).

The bank holds authentic Greek radio and TV recordings with full transcripts, each
graded by the Centre for listening comprehension. Only the index is stored in the
repository. The recordings and transcripts are not open-licensed, so the app streams
a recording and fetches its transcript on demand for personal study and never
redistributes them."""
import html, json, re, sys, time, urllib.request

BASE = "https://www.greek-language.gr/certification/dbs/media/"
LEVELS = {"Α1": "A1", "Α2": "A2", "Β1": "B1", "Β2": "B2", "Γ1": "C1", "Γ2": "C2"}
ROW = re.compile(
    r'<a href="/certification/dbs/media/show\.html\?id=(\d+)">(.*?)</a></td>\s*'
    r'<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>', re.S)
MP3 = re.compile(r'["\'](/certification/files/audio/[^"\']+\.mp3)["\']')

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # slow server: back off and retry
            print(f"retry {i+1} {url}: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise SystemExit(f"failed: {url}")

def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def main(out):
    first = get(BASE + "index.html")
    total = int(re.search(r"(\d+) εγγραφές", first).group(1))
    items = []
    for start in range(0, total, 20):
        page = first if start == 0 else get(f"{BASE}index.html?start={start}")
        for id_, title, level, skill, kind in ROW.findall(page):
            # Codes appear with Greek capital letters; normalise lookalike Latin letters.
            level = clean(level).replace("A", "Α").replace("B", "Β")
            if level not in LEVELS or clean(skill) != "ΚΠΛ" or clean(kind) != "Ήχος":
                continue  # only audio for listening; skips children's A1, texts and videos
            show = get(f"{BASE}show.html?id={id_}")
            m = MP3.search(show)
            if not m:
                print(f"no mp3 for {id_}", file=sys.stderr)
                continue
            items.append({"id": int(id_), "title": clean(title), "level": LEVELS[level],
                          "audio": "https://www.greek-language.gr" + urllib.parse.quote(m.group(1))})
        print(f"{min(start + 20, total)}/{total}: {len(items)} kept", file=sys.stderr)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"source": BASE + "index.html", "retrieved": time.strftime("%Y-%m-%d"),
                   "total_listed": total, "items": items}, f, ensure_ascii=False, indent=1)
        f.write("\n")

if __name__ == "__main__":
    import urllib.parse
    main(sys.argv[1] if len(sys.argv) > 1 else "src/data/media-index.json")
