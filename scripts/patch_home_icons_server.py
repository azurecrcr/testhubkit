#!/usr/bin/env python3
"""Run on server: resize icons to 96x96 and patch home_dashboard + tools_registry."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess

    subprocess.check_call(["pip3", "install", "pillow", "-q"])
    from PIL import Image

ROOT = Path("/root/TestHub")
ICONS = ROOT / "static" / "images" / "home" / "icons"
CACHE = "20260525"
TARGET = 96


def resize_icons() -> None:
    for p in sorted(ICONS.glob("icon-*.png")):
        img = Image.open(p).convert("RGBA")
        w, h = img.size
        if (w, h) != (TARGET, TARGET):
            img = img.resize((TARGET, TARGET), Image.LANCZOS)
            img.save(p, "PNG", optimize=True)
        print(p.name, f"{w}x{h} -> {TARGET}x{TARGET}")


def patch_home_dashboard() -> None:
    home = ROOT / "templates/partials/home_dashboard.html"
    ht = home.read_text(encoding="utf-8")
    old_tool = (
        '                                <div class="hf-home-tool-card__icon flex h-12 w-12 shrink-0 '
        'items-center justify-center text-2xl leading-none">{{ tool.icon }}</div>'
    )
    new_tool = (
        '                                <div class="hf-home-tool-card__icon flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden p-0">\n'
        "                                    {% if tool.icon_image is defined and tool.icon_image %}\n"
        f'                                    <img src="{{{{ tool.icon_image }}}}?v={CACHE}" alt="" class="h-full w-full object-cover" width="48" height="48" loading="lazy" decoding="async" />\n'
        "                                    {% else %}\n"
        '                                    <span class="text-2xl leading-none" aria-hidden="true">{{ tool.icon }}</span>\n'
        "                                    {% endif %}\n"
        "                                </div>"
    )
    old_prompts = (
        '                            <div class="hf-home-tool-card__icon flex h-12 w-12 shrink-0 '
        'items-center justify-center text-2xl leading-none">✨</div>'
    )
    new_prompts = f"""                            <div class="hf-home-tool-card__icon flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden p-0">
                                <img src="/static/images/home/icons/icon-prompts.png?v={CACHE}" alt="" class="h-full w-full object-cover" width="48" height="48" loading="lazy" decoding="async" />
                            </div>"""
    if old_tool not in ht:
        raise SystemExit("tool icon block not found (already patched?)")
    ht = ht.replace(old_tool, new_tool, 1)
    if old_prompts not in ht:
        raise SystemExit("prompts icon block not found")
    ht = ht.replace(old_prompts, new_prompts, 1)
    home.write_text(ht, encoding="utf-8")
    print("patched", home)


def patch_registry() -> None:
    reg = ROOT / "core/config/tools_registry.py"
    rt = reg.read_text(encoding="utf-8")
    pairs = [
        (
            '"id": "test-cases",',
            '"icon_image": "/static/images/home/icons/icon-test-cases.png",\n        ',
        ),
        (
            '"id": "doc-tools",',
            '"icon_image": "/static/images/home/icons/icon-doc-tools.png",\n        ',
        ),
        (
            '"id": "api-scenario-studio",',
            '"icon_image": "/static/images/home/icons/icon-api-scenario-studio.png",\n        ',
        ),
        (
            '"id": "media-data-hub",',
            '"icon_image": "/static/images/home/icons/icon-media-data-hub.png",\n        ',
        ),
    ]
    for needle, insert in pairs:
        key = insert.strip().split("\n")[0]
        if key in rt:
            print("skip", needle)
            continue
        if needle not in rt:
            raise SystemExit(f"id not found: {needle}")
        rt = rt.replace(needle, insert + needle, 1)
    reg.write_text(rt, encoding="utf-8")
    print("patched", reg)


if __name__ == "__main__":
    resize_icons()
    patch_home_dashboard()
    patch_registry()
