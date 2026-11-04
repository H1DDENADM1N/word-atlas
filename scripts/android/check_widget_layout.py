#!/usr/bin/env python3
"""Fail fast when a widget layout uses a class RemoteViews cannot inflate.

RemoteViews does not run a real LayoutInflater: it walks the tree against
``RemoteViews.sInflaterFilter`` and throws ``InflateException`` the moment it
meets a class outside that list. The launcher then shows the generic
"An error occurred when loading widget" placeholder, with nothing in logcat
that points at the offending tag — which is exactly how ``<View>`` slipped
into the fade strip once.

Run this before every build:

    python scripts/android/check_widget_layout.py
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAYOUT_DIR = ROOT / "android/app/src/main/res/layout"

# Candidates in RemoteViews.sInflaterFilter (AOSP, tag names without the
# "android.widget." prefix being optional).
ALLOWED = {
    "AdapterViewFlipper",
    "AnalogClock",
    "Button",
    "Chronometer",
    "FrameLayout",
    "GridLayout",
    "GridView",
    "ImageButton",
    "ImageView",
    "LinearLayout",
    "ListView",
    "ProgressBar",
    "RelativeLayout",
    "StackView",
    "TextClock",
    "TextView",
    "ViewFlipper",
    "ViewStub",
}

# Tags that are structural and never reach the inflater filter.
STRUCTURAL = {"merge", "include", "requestFocus"}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def check(path: Path) -> list[str]:
    problems: list[str] = []
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        return [f"{path.name}: not well-formed ({exc})"]

    for element in tree.iter():
        tag = local_name(element.tag)
        if tag in STRUCTURAL:
            continue
        if tag in ALLOWED:
            continue
        # "android.view.View" is deliberately NOT allowed: it looks harmless
        # but the filter rejects it, taking the whole card down with it.
        problems.append(
            f"{path.name}: <{tag}> is not inflatable by RemoteViews"
        )
    return problems


def main() -> int:
    layouts = sorted(LAYOUT_DIR.glob("widget_*.xml"))
    if not layouts:
        print(f"no widget layouts under {LAYOUT_DIR}")
        return 1

    problems: list[str] = []
    for layout in layouts:
        problems.extend(check(layout))

    if problems:
        print("RemoteViews whitelist check FAILED")
        for line in problems:
            print("  " + line)
        return 1

    names = ", ".join(p.name for p in layouts)
    print(f"RemoteViews whitelist check OK ({len(layouts)} layouts: {names})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
