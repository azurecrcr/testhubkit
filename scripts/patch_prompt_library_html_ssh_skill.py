#!/usr/bin/env python3
"""在 prompt_library.html 注入 hf-ssh-key-deploy-skill 脚本块与 PROMPTS 兜底条目。"""
from __future__ import annotations

import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
HTML = BASE / "templates" / "prompt_library.html"
SKILL = BASE / "ssh-key-deploy" / "SKILL.md"
MARKER_START = '    <script type="text/plain" id="hf-ssh-key-deploy-skill">'
MARKER_END = "    </script>\n\n    <script type=\"text/plain\" id=\"hf-smoke-skill\">"
ENTRY_ID = "ssh_deploy1"


def main() -> None:
    body = SKILL.read_text(encoding="utf-8").replace("\r\n", "\n").strip()
    html = HTML.read_text(encoding="utf-8")

    block = MARKER_START + "\n" + body + "\n" + MARKER_END
    if MARKER_START in html:
        html = re.sub(
            r'    <script type="text/plain" id="hf-ssh-key-deploy-skill">.*?</script>\s*\n\s*<script type="text/plain" id="hf-smoke-skill">',
            block,
            html,
            count=1,
            flags=re.DOTALL,
        )
    else:
        html = html.replace(
            '    <script type="text/plain" id="hf-smoke-skill">',
            block,
            1,
        )

    if 'var elSshDeploy = document.getElementById("hf-ssh-key-deploy-skill");' not in html:
        html = html.replace(
            '    var elSmoke = document.getElementById("hf-smoke-skill");',
            '    var elSshDeploy = document.getElementById("hf-ssh-key-deploy-skill");\n'
            '    var HF_SSH_KEY_DEPLOY_SKILL_TEXT = elSshDeploy ? elSshDeploy.textContent.replace(/^\\uFEFF/, "").trim() : "";\n'
            "    var elSmoke = document.getElementById(\"hf-smoke-skill\");",
            1,
        )

    new_line = (
        '        { id: "ssh_deploy1", category: "smoke", kicker: "运维 · SSH 密钥部署", '
        'title: "SSH 公钥部署（Cursor）", tags: ["SSH", "ed25519", "Cursor Agent", "免密登录", "Posh-SSH", "authorized_keys"], '
        'blurb: "按主机生成 ed25519 密钥，系统原生弹窗收集账号密码，写入 authorized_keys，支持 Windows / macOS / Linux 免密登录。", '
        "text: HF_SSH_KEY_DEPLOY_SKILL_TEXT },\n"
        '        { id: "smoke1", category: "smoke", kicker: "冒烟 · Cursor Agent", title: "冒烟测试（Cursor）", tags: ["SSH", "docker", "pytest", "Allure", "Git", "Machine"], blurb: "远端容器冒烟：YAML 选机、Machine 环境变量、git fetch 网络重试、pull/ff-only、Allure 同步与静态报告。", text: HF_SMOKE_SKILL_TEXT }'
    )
    if ENTRY_ID not in html.split("var PROMPTS = [", 1)[-1].split("];", 1)[0]:
        html = html.replace(
            '        { id: "smoke1", category: "smoke", kicker: "冒烟 · Cursor Agent", title: "冒烟测试（Cursor）", tags: ["SSH", "docker", "pytest", "Allure", "Git", "Machine"], blurb: "远端容器冒烟：YAML 选机、Machine 环境变量、git fetch 网络重试、pull/ff-only、Allure 同步与静态报告。", text: HF_SMOKE_SKILL_TEXT }',
            new_line,
            1,
        )

    HTML.write_text(html, encoding="utf-8", newline="\n")
    print("patched", HTML)


if __name__ == "__main__":
    main()
