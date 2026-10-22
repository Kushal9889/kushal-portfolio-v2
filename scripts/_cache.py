"""Result cache for the page checks: same build, same answer, no rerun.

A report is reused when it was written for the current .next/BUILD_ID and
no --force flag is given. Rebuild, or pass --force, to run it again.
"""
import json, os, sys

V2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def build_id():
    try:
        return open(os.path.join(V2, ".next", "BUILD_ID")).read().strip()
    except OSError:
        return "unknown"


def reuse(path, widths):
    if "--force" in sys.argv or not os.path.exists(path):
        return None
    try:
        r = json.load(open(path))
    except ValueError:
        return None
    if r.get("build") == build_id() and r.get("widths") == list(widths):
        return r
    return None
