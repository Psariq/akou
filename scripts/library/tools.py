"""Helpers for writing built-in library lessons (see docs/LIBRARY.md).
  python3 scripts/library/tools.py tokens FILE.json           -> distinct words per lesson (first appearance), and word counts
  python3 scripts/library/tools.py merge FILE.json GLOSS.txt  -> put glosses into the lessons' "words" (GLOSS.txt: '## <id>' then 'form|lemma|en|note' lines)
"""
import json, re, sys

WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*")

def text(l):
    return "\n".join(s[1] if isinstance(s, list) else s for s in l["segments"])

def tokens(l):
    seen, out = set(), []
    for m in WORD.finditer(text(l)):
        w = m.group(0)
        k = w.lower()
        if k in seen: continue
        seen.add(k); out.append(w)
    return out

cmd, f = sys.argv[1], sys.argv[2]
lessons = json.load(open(f, encoding="utf-8"))
if cmd == "tokens":
    for l in lessons:
        ws = tokens(l)
        n = len(text(l).split())
        print(f"## {l['id']}  ({n} words, {len(ws)} distinct)")
        print(" ".join(ws))
elif cmd == "merge":
    gl, cur = {}, None
    for line in open(sys.argv[3], encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip(): continue
        if line.startswith("## "):
            cur = line[3:].strip(); gl[cur] = []; continue
        parts = line.split("|")
        while len(parts) < 4: parts.append("")
        gl[cur].append([p.strip() for p in parts[:4]])
    for l in lessons:
        if l["id"] in gl:
            l["words"] = gl[l["id"]]
            have = {w[0].lower() for w in l["words"]}
            need = [w for w in tokens(l) if w.lower() not in have]
            extra = [w[0] for w in l["words"] if w[0].lower() not in {t.lower() for t in tokens(l)}]
            if need: print(l["id"], "MISSING:", " ".join(need))
            if extra: print(l["id"], "STRAY:", " ".join(extra))
    json.dump(lessons, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("merged")
