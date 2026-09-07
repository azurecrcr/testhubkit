"""Prepare a smoke-run copy of JMX: force 1 thread, 1 loop, disable heavy listeners."""

from __future__ import annotations

import copy
import xml.etree.ElementTree as ET


def _local_tag(el: ET.Element) -> str:
    tag = el.tag
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _set_prop(parent: ET.Element, prop_tag: str, name: str, value: str) -> None:
    for child in parent:
        if _local_tag(child) == prop_tag and child.get("name") == name:
            child.text = value
            return
    node = ET.SubElement(parent, prop_tag, name=name)
    node.text = value


def prepare_jmx_for_smoke(jmx_text: str) -> str:
    root = ET.fromstring(jmx_text)
    for el in root.iter():
        tag = _local_tag(el)
        if tag == "ThreadGroup":
            _set_prop(el, "stringProp", "ThreadGroup.num_threads", "1")
            _set_prop(el, "stringProp", "ThreadGroup.ramp_time", "1")
            _set_prop(el, "boolProp", "ThreadGroup.scheduler", "false")
            _set_prop(el, "stringProp", "ThreadGroup.duration", "")
            _set_prop(el, "stringProp", "ThreadGroup.delay", "")
        if tag == "stringProp" and el.get("name") == "LoopController.loops":
            el.text = "1"
        if tag == "boolProp" and el.get("name") == "LoopController.continue_forever":
            el.text = "false"
        if tag in ("BackendListener",):
            el.set("enabled", "false")
        if tag == "ResultCollector":
            el.set("enabled", "false")

    body = ET.tostring(root, encoding="unicode")
    if jmx_text.lstrip().startswith("<?xml"):
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + body
    return body
