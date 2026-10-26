"""Skill cache: stop reloading 15k-token skill files every tick.

    python3 scripts/skill-cache.py status     CHANGED or ok for each skill file
    python3 scripts/skill-cache.py save       store the current hashes (after you re-read a changed skill and updated docs/skill-rules.md)

When every skill reads "ok", the loop reads docs/skill-rules.md once instead of invoking the skills,
and logs each skill as "[cache sha:abcd] <rule ids applied>". A CHANGED skill is invoked in full.
"""
import hashlib, json, os, sys

H = os.path.expanduser("~")
M = f"{H}/.claude/local-marketplaces/design-stack-marketplace/skills"
SKILLS = {
    "elite-thinking": f"{H}/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/655688fa-6c92-4c07-894e-8b19e21cb938/9dd2fe53-070e-4161-8898-aeadb2d1d7ee/skills/elite-thinking/SKILL.md",
    "brutalist": f"{M}/industrial-brutalist-ui/SKILL.md",
    "design-taste": f"{M}/design-taste-frontend/SKILL.md",
    "ui-ux-pro-max": f"{H}/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/.claude/skills/ui-ux-pro-max/SKILL.md",
    "impeccable": f"{M}/impeccable/SKILL.md",
    "stitch": f"{M}/stitch-design-taste/SKILL.md",
    "img2threejs": f"{M}/img2threejs/SKILL.md",
    "prompt-engineer": f"{H}/.claude/plugins/cache/fullstack-dev-skills/fullstack-dev-skills/0.4.15/skills/prompt-engineer/SKILL.md",
}
STORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "skill-cache.json")


def sha(p):
    try:
        return hashlib.sha256(open(p, "rb").read()).hexdigest()[:12]
    except OSError:
        return "missing"


cur = {k: sha(p) for k, p in SKILLS.items()}
if len(sys.argv) > 1 and sys.argv[1] == "save":
    json.dump(cur, open(STORE, "w"), indent=1)
    print("saved", cur)
else:
    old = json.load(open(STORE)) if os.path.exists(STORE) else {}
    bad = 0
    for k, v in cur.items():
        state = "ok" if old.get(k) == v and v != "missing" else ("MISSING" if v == "missing" else "CHANGED")
        bad += state != "ok"
        print(f"{k:16} {state:8} sha:{v}")
    print("ALL CACHED" if not bad else f"{bad} need a full read")
