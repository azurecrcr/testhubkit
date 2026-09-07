#!/usr/bin/env python3
"""Ensure catalog palette assets stay in jms-load-test bundle + rebuild."""

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/root/TestHub')
BUILD = ROOT / 'scripts/build_jms_load_test_bundle.py'
VER = '20260707v2style1'

CATALOG_JS = [
    'js/jms_hierarchy_rules.js',
    'js/jms_insert_context_v2.js',
    'js/jms_catalog_alias_map.js',
    'js/jmx_catalog_element.js',
    'js/jms_tg_catalog_element_tree.js',
    'js/jms_studio_catalog_bridge_v2.js',
    'js/jms_catalog_sampler_children.js',
    'js/jms_catalog_sampler_children_jmx.js',
    'js/jms_studio_catalog_bridge.js',
    'js/jms_catalog_refresh.js',
    'js/jms_catalog_context_append.js',
    'js/jms_catalog_element_editor_schema.js',
    'js/jms_catalog_post_add.js',
    'js/jms_catalog_card_toggle.js',
    'js/jms_catalog_element_editor_ui.js',
    'js/jms_catalog_menu_v2.js',
    'js/jms_tg_catalog_element_plan.js',
]

CATALOG_CSS = [
    'css/jms_catalog_menu_v2.css',
    'css/jms_catalog_element_tree.css',
    'css/jms_catalog_element_editor.css',
    'css/jms_catalog_element_tree_unify.css',
    'css/jms_catalog_element_plan.css',
]

MARKER = '# catalog-palette-bundle-v7'


def patch_build(text: str) -> str:
    if MARKER in text:
        print('build script already patched')
    else:
        anchor = '    if _export_sync not in js_all and (STATIC / _export_sync).is_file():'
        block = f"""    {MARKER}
    _catalog_js = {CATALOG_JS!r}
    _catalog_css = {CATALOG_CSS!r}
    for _cj in _catalog_js:
        if _cj not in js_all and (STATIC / _cj).is_file():
            js_all.append(_cj)
    for _cc in _catalog_css:
        if _cc not in css_all and (STATIC / _cc).is_file():
            css_all.append(_cc)

"""
        if anchor not in text:
            raise SystemExit('build script anchor missing')
        text = text.replace(anchor, block + anchor, 1)

    text = re.sub(
        r'^BUNDLE_VERSION = "[^"]+"',
        f'BUNDLE_VERSION = "{VER}"',
        text,
        count=1,
        flags=re.M,
    )
    return text


def main() -> int:
    if not BUILD.is_file():
        print(f'missing {BUILD}', file=sys.stderr)
        return 1
    BUILD.write_text(patch_build(BUILD.read_text(encoding='utf-8')), encoding='utf-8')
    print('patched build_jms_load_test_bundle.py')
    subprocess.run([sys.executable, str(BUILD)], check=True, cwd=str(ROOT))
    print('rebuilt bundle')
    manifest = ROOT / 'static/dist/jms-load-test/manifest.txt'
    if manifest.is_file():
        hits = [ln for ln in manifest.read_text(encoding='utf-8').splitlines() if 'jms_catalog' in ln or 'jmx_catalog' in ln]
        print('catalog manifest entries:', len(hits))
        for ln in hits[:8]:
            print(' ', ln)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
