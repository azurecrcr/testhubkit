#!/usr/bin/env python3
"""Generate minimal JMX element templates from saveservice.properties."""
import json
import re
from pathlib import Path

JMETER_HOME = Path("/opt/jmeter")
SAVE = JMETER_HOME / "bin/saveservice.properties"
OUT = Path(__file__).resolve().parent / "jmeter_element_templates.json"

SKIP_SUFFIXES = ("Gui", "Panel", "Model", "Property", "Wrapper", "Visualizer", "ControlPanel")
SKIP_EXACT = {"Argument", "Arguments", "ArgumentsPanel", "NamePanel", "ObsoleteGui"}

GUICLASS_OVERRIDES = {
    "HTTPSamplerProxy": "HttpTestSampleGui",
    "HTTPSampler": "HttpTestSampleGui",
    "HTTPSampler2": "HttpTestSampleGui",
    "GenericController": "LogicControllerGui",
    "SimpleController": "LogicControllerGui",
    "LoopController": "LoopControlPanel",
    "RandomController": "RandomControlGui",
    "ResultCollector": "ViewResultsFullVisualizer",
    "BeanShellSampler": "BeanShellSamplerGui",
    "BeanShellPreProcessor": "TestBeanGUI",
    "BeanShellPostProcessor": "TestBeanGUI",
    "BeanShellAssertion": "TestBeanGUI",
    "BeanShellTimer": "TestBeanGUI",
    "DebugSampler": "TestBeanGUI",
    "TestAction": "TestActionGui",
}


def parse_saveservice():
    testclass = {}
    guiclass = {}
    if not SAVE.is_file():
        return testclass, guiclass
    for raw in SAVE.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        alias_part, fqcn = line.split("=", 1)
        aliases = [a.strip() for a in alias_part.split(",") if a.strip()]
        fqcn = fqcn.strip()
        primary = aliases[0]
        if any(primary.endswith(s) for s in SKIP_SUFFIXES) or primary in SKIP_EXACT:
            if primary.endswith("Gui") or primary.endswith("Panel"):
                base = re.sub(r"(Gui|Panel)$", "", primary)
                guiclass[base] = primary
                for a in aliases:
                    guiclass[a.replace("Gui", "").replace("Panel", "")] = primary
            continue
        for a in aliases:
            testclass[a] = fqcn
    return testclass, guiclass


def resolve_guiclass(alias, guiclass_map):
    if alias in GUICLASS_OVERRIDES:
        return GUICLASS_OVERRIDES[alias]
    for key in (alias, alias.replace("Proxy", "")):
        if key in guiclass_map:
            return guiclass_map[key]
    if alias.endswith("Controller"):
        return alias + "Gui"
    return alias + "Gui"


def minimal_xml(alias, guiclass, testname="NEW"):
    esc = testname.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
    return (
        f'<{alias} guiclass="{guiclass}" testclass="{alias}" testname="{esc}" enabled="true">\n'
        f'</{alias}>'
    )


def main():
    testclass, guiclass_map = parse_saveservice()
    templates = {}
    for alias in sorted(testclass.keys()):
        gui = resolve_guiclass(alias, guiclass_map)
        templates[alias] = {
            "alias": alias,
            "testclass": alias,
            "guiclass": gui,
            "class": testclass[alias],
            "jmx_fragment": minimal_xml(alias, gui, "NEW"),
        }
    # plugin aliases from catalog
    for alias, gui in [
        ("Dummy Sampler", "DummySamplerGui"),
        ("PerfMon Metrics Collector", "PerfMonGui"),
    ]:
        if alias not in templates:
            safe = alias.replace(" ", "")
            templates[alias] = {
                "alias": alias,
                "testclass": alias,
                "guiclass": gui,
                "class": "",
                "jmx_fragment": minimal_xml(alias, gui, "NEW"),
            }
    OUT.write_text(json.dumps({"version": "1", "templates": templates}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, "count", len(templates))


if __name__ == "__main__":
    main()
