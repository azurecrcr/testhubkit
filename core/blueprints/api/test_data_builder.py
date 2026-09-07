"""测试数据构建：服务端代发 HTTP，避免浏览器 CORS，并支持按字段递增批量请求。"""

from __future__ import annotations

import copy
import json
import os
import time
from typing import Any
from urllib.parse import urlparse

import requests
from flask import Blueprint, jsonify, request

MAX_BATCH = 500
REQUEST_TIMEOUT_SEC = 30
# 勾选 full_log 时单条响应正文上限（避免超大页面拖垮内存）
FULL_LOG_BODY_MAX = 200_000

# 命中下列主域（及子域）时视为「常见正规平台」：单次请求次数上限见 PROTECTED_PLATFORM_MAX_REPEAT。
# 自托管且需关闭此策略时，可设置环境变量 TEST_DATA_BUILDER_DISABLE_DOMAIN_GUARD=1（慎用）。
_BLOCKED_APEX: frozenset[str] = frozenset(
    {
        # 阿里
        "alibaba.com",
        "alibabagroup.com",
        "aliyun.com",
        "aliyuncs.com",
        "taobao.com",
        "tmall.com",
        "1688.com",
        "alipay.com",
        "dingtalk.com",
        "cainiao.com",
        "fliggy.com",
        "ele.me",
        "antfin.com",
        "alipayobjects.com",
        # 腾讯
        "tencent.com",
        "qq.com",
        "wechat.com",
        "qcloud.com",
        "myqcloud.com",
        "tencentcloudapi.com",
        "wegame.com",
        "gtimg.cn",
        "idqqimg.com",
        # 字节
        "bytedance.com",
        "douyin.com",
        "toutiao.com",
        "feishu.cn",
        "larksuite.com",
        "larkoffice.com",
        "tiktok.com",
        "capcut.com",
        "ixigua.com",
        "huoshan.com",
        "snssdk.com",
        "pstatp.com",
        "byteimg.com",
        "byted-static.com",
        # 铁路 / 支付 / 运营商
        "12306.cn",
        "95516.com",
        "unionpay.com",
        "unionpayintl.com",
        "10086.cn",
        "chinamobile.com",
        "189.cn",
        "10010.com",
        # 其它常见大厂与国民级应用
        "baidu.com",
        "bcebos.com",
        "bdstatic.com",
        "jd.com",
        "jdcloud.com",
        "jdpay.com",
        "meituan.com",
        "dianping.com",
        "sankuai.com",
        "163.com",
        "netease.com",
        "126.com",
        "yeah.net",
        "weibo.com",
        "sina.com.cn",
        "xiaomi.com",
        "mi.com",
        "huawei.com",
        "hicloud.com",
        "vmall.com",
        "honor.cn",
        "pinduoduo.com",
        "yangkeduo.com",
        "oppo.com",
        "vivo.com.cn",
        "bilibili.com",
        "hdslb.com",
        "douyu.com",
        "huya.com",
        "ctrip.com",
        "trip.com",
        "didi.cn",
        "didiglobal.com",
        "360.cn",
        "qihoo.com",
        "so.com",
        "58.com",
        "ganji.com",
        "sohu.com",
        "iqiyi.com",
        "youku.com",
        "suning.com",
        "cmbchina.com",
        "icbc.com.cn",
        "ccb.com",
        "abchina.com",
        "boc.cn",
        "bankcomm.com",
        "psbc.com",
        "spdb.com.cn",
        "citicbank.com",
        "pingan.com",
        "zhihu.com",
        "douban.com",
        "kuaishou.com",
        "kwai.com",
        "autonavi.com",
        "amap.com",
        "gaode.com",
    }
)


PROTECTED_PLATFORM_MAX_REPEAT = 5


def get_protected_platform_domains() -> list[str]:
    """供页面注入，与后端校验使用同一批主域列表。"""
    return sorted(_BLOCKED_APEX)


def _domain_guard_enabled() -> bool:
    v = (os.environ.get("TEST_DATA_BUILDER_DISABLE_DOMAIN_GUARD") or "").strip().lower()
    return v not in ("1", "true", "yes", "on")


def _hostname_matches_blocked_apex(hostname: str) -> bool:
    hn = hostname.lower().rstrip(".")
    if not hn or hn == "localhost":
        return False
    for apex in _BLOCKED_APEX:
        if hn == apex or hn.endswith("." + apex):
            return True
    return False


def _deep_get(obj: dict, path: str) -> Any:
    cur: Any = obj
    for p in path.strip().split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def _deep_set(obj: dict, path: str, value: Any) -> None:
    parts = path.strip().split(".")
    if not parts or not parts[0]:
        raise ValueError("字段路径不能为空")
    cur = obj
    for p in parts[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[parts[-1]] = value


def _coerce_value(hint: Any, val: int) -> Any:
    if isinstance(hint, bool):
        return bool(val)
    if isinstance(hint, str):
        return str(val)
    if isinstance(hint, float):
        return float(val)
    return val


def _tdb_deep_delete(obj: dict, path: str) -> None:
    """多字段造数专用：从 body 中删除指定路径（与前端 Python 导出一致）。"""
    parts = path.strip().split(".")
    if not parts or not parts[0]:
        return
    cur: Any = obj
    for p in parts[:-1]:
        if not isinstance(cur, dict) or p not in cur:
            return
        cur = cur[p]
    if isinstance(cur, dict):
        cur.pop(parts[-1], None)


def _tdb_value_for_field(cfg: dict[str, Any], index: int) -> int:
    range_min = int(cfg["range_min"])
    range_max = int(cfg["range_max"])
    if cfg.get("loop"):
        span = max(1, range_max - range_min + 1)
        return range_min + (index % span)
    return range_min + index


def _tdb_field_exhausted(cfg: dict[str, Any], index: int) -> bool:
    if cfg.get("loop"):
        return False
    return _tdb_value_for_field(cfg, index) > int(cfg["range_max"])


def _tdb_field_should_stop_batch(cfg: dict[str, Any], index: int) -> bool:
    return _tdb_field_exhausted(cfg, index) and not cfg.get("omit_carry")


def _tdb_normalize_run_fields(
    data: dict[str, Any],
) -> tuple[list[str], list[dict[str, Any]], str, int, int]:
    """解析 variable_paths / field_configs，兼容旧版单字段请求。"""
    try:
        range_min = int(data.get("range_min", 1))
        range_max = int(data.get("range_max", 1))
    except (TypeError, ValueError):
        range_min, range_max = 1, 1

    variable_path = (data.get("variable_path") or "").strip()
    paths: list[str] = []
    raw_paths = data.get("variable_paths")
    if isinstance(raw_paths, list):
        paths = [str(p).strip() for p in raw_paths if str(p).strip()]
    if not paths and variable_path:
        paths = [variable_path]

    configs: list[dict[str, Any]] = []
    raw_cfgs = data.get("field_configs")
    if isinstance(raw_cfgs, list):
        for item in raw_cfgs:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path") or "").strip()
            if not path:
                continue
            try:
                rmin = int(item.get("range_min", 1))
                rmax = int(item.get("range_max", 1))
            except (TypeError, ValueError):
                raise ValueError(f"字段「{path}」的下限与上限须为整数")
            loop_on = bool(item.get("loop"))
            configs.append(
                {
                    "path": path,
                    "range_min": rmin,
                    "range_max": rmax,
                    "loop": loop_on,
                    "omit_carry": (not loop_on) and bool(item.get("omit_carry")),
                }
            )

    if not configs and paths:
        primary = paths[0]
        configs = [
            {
                "path": primary,
                "range_min": range_min,
                "range_max": range_max,
                "loop": False,
                "omit_carry": False,
            }
        ]
    elif not configs and variable_path:
        paths = [variable_path]
        configs = [
            {
                "path": variable_path,
                "range_min": range_min,
                "range_max": range_max,
                "loop": False,
                "omit_carry": False,
            }
        ]

    cfg_by_path = {c["path"]: c for c in configs}
    if paths:
        ordered_cfgs = [cfg_by_path[p] for p in paths if p in cfg_by_path]
        if not ordered_cfgs:
            ordered_cfgs = configs
    else:
        ordered_cfgs = configs
        paths = [c["path"] for c in ordered_cfgs]

    primary = paths[0] if paths else variable_path
    rmin0 = ordered_cfgs[0]["range_min"] if ordered_cfgs else range_min
    rmax0 = ordered_cfgs[0]["range_max"] if ordered_cfgs else range_max
    return paths, ordered_cfgs, primary, rmin0, rmax0


def _tdb_prepare_body_for_index(
    body_template: dict[str, Any],
    variable_paths: list[str],
    field_configs: list[dict[str, Any]],
    index: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """按索引构建请求体与各字段递增值（与前端 Python 导出逻辑一致）。"""
    cfg_by_path = {c["path"]: c for c in field_configs}
    body = copy.deepcopy(body_template)
    field_values: dict[str, Any] = {}
    for path in variable_paths:
        cfg = cfg_by_path.get(path)
        if not cfg:
            continue
        if _tdb_field_exhausted(cfg, index) and cfg.get("omit_carry"):
            _tdb_deep_delete(body, path)
            field_values[path] = None
            continue
        val = _tdb_value_for_field(cfg, index)
        type_hint = _deep_get(body_template, path)
        coerced = _coerce_value(type_hint, val) if type_hint is not None else val
        _deep_set(body, path, coerced)
        field_values[path] = coerced
    return body, field_values


def register_routes(bp: Blueprint) -> None:
    @bp.post("/test-data-builder/run")
    def run_batch():
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        token = (data.get("token") or "").strip()
        method = (data.get("method") or "POST").strip().upper()
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            method = "POST"

        try:
            repeat_count = int(data.get("repeat_count", 1))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "invalid_count", "message": "请求次数必须是整数"}), 400

        try:
            variable_paths, field_configs, variable_path, range_min, range_max = _tdb_normalize_run_fields(data)
        except ValueError as e:
            return jsonify({"ok": False, "error": "invalid_range", "message": str(e)}), 400

        if not url:
            return jsonify({"ok": False, "error": "missing_url", "message": "请填写 URL"}), 400
        if not token:
            return jsonify({"ok": False, "error": "missing_token", "message": "请填写 Token"}), 400
        if not variable_path:
            return jsonify({"ok": False, "error": "missing_path", "message": "请填写要递增的字段路径"}), 400
        for cfg in field_configs:
            if int(cfg["range_min"]) > int(cfg["range_max"]):
                return jsonify(
                    {
                        "ok": False,
                        "error": "range_order",
                        "message": f"字段「{cfg['path']}」的下限不能大于上限",
                    }
                ), 400
        if repeat_count < 1:
            return jsonify({"ok": False, "error": "bad_count", "message": "请求次数至少为 1"}), 400

        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return jsonify({"ok": False, "error": "bad_scheme", "message": "仅支持 http/https"}), 400

        host = parsed.hostname or ""
        is_protected = (
            bool(host)
            and _domain_guard_enabled()
            and _hostname_matches_blocked_apex(host)
        )
        max_allowed = PROTECTED_PLATFORM_MAX_REPEAT if is_protected else MAX_BATCH
        if repeat_count > max_allowed:
            if is_protected:
                return jsonify(
                    {
                        "ok": False,
                        "error": "protected_domain_limit",
                        "message": (
                            "检测到目标为常见正规平台地址。此类地址不允许高频访问，"
                            f"单次「请求次数」最多为 {PROTECTED_PLATFORM_MAX_REPEAT}。请调低次数，或使用自有测试环境。"
                        ),
                    }
                ), 400
            return jsonify({"ok": False, "error": "too_many", "message": f"单次最多 {MAX_BATCH} 次"}), 400

        raw_headers = data.get("headers")
        if isinstance(raw_headers, dict):
            headers = {str(k).strip(): str(v).strip() for k, v in raw_headers.items() if str(k).strip()}
        elif isinstance(raw_headers, str):
            try:
                obj = json.loads(raw_headers) if raw_headers.strip() else {}
                if not isinstance(obj, dict):
                    raise ValueError("headers 须为 JSON 对象")
                headers = {str(k).strip(): str(v).strip() for k, v in obj.items() if str(k).strip()}
            except (json.JSONDecodeError, ValueError) as e:
                return jsonify({"ok": False, "error": "bad_headers", "message": f"请求头 JSON 无效：{e}"}), 400
        else:
            headers = {}

        headers["Authorization"] = f"Bearer {token}"

        body_template = data.get("body")
        if body_template is None:
            body_obj: dict[str, Any] = {}
        elif isinstance(body_template, dict):
            body_obj = body_template
        elif isinstance(body_template, str):
            try:
                body_obj = json.loads(body_template) if body_template.strip() else {}
                if not isinstance(body_obj, dict):
                    return jsonify({"ok": False, "error": "bad_body", "message": "请求体须为 JSON 对象"}), 400
            except json.JSONDecodeError as e:
                return jsonify({"ok": False, "error": "bad_json", "message": f"请求体不是合法 JSON：{e}"}), 400
        else:
            return jsonify({"ok": False, "error": "bad_body", "message": "请求体格式无效"}), 400

        try:
            delay_ms = max(0, int(data.get("delay_ms", 0)))
        except (TypeError, ValueError):
            delay_ms = 0

        full_log = bool(data.get("full_log"))

        results: list[dict[str, Any]] = []
        stopped_early: dict[str, Any] | None = None
        for i in range(repeat_count):
            exhausted = next((c for c in field_configs if _tdb_field_should_stop_batch(c, i)), None)
            if exhausted is not None:
                stopped_early = {
                    "reason": "range_exhausted",
                    "completed": i,
                    "field_path": exhausted["path"],
                    "message": (
                        f"字段「{exhausted['path']}」已超过上限 {exhausted['range_max']}，"
                        f"在第 {i} 次前停止（共成功 {i} 次）。"
                    ),
                }
                break

            try:
                body, field_values = _tdb_prepare_body_for_index(body_obj, variable_paths, field_configs, i)
            except (ValueError, TypeError) as e:
                return jsonify({"ok": False, "error": "set_path_failed", "message": str(e)}), 400

            primary_value = field_values.get(variable_path)
            if primary_value is None and variable_paths:
                primary_value = field_values.get(variable_paths[0])

            try:
                req_kw: dict[str, Any] = {"headers": headers, "timeout": REQUEST_TIMEOUT_SEC, "allow_redirects": True}
                if method == "GET":
                    resp = requests.get(url, **req_kw)
                else:
                    req_kw["json"] = body
                    resp = requests.request(method, url, **req_kw)
                text = resp.text
                if full_log:
                    if len(text) > FULL_LOG_BODY_MAX:
                        text = text[:FULL_LOG_BODY_MAX] + "...[truncated]"
                    body_preview = text
                else:
                    body_preview = text
                    if len(body_preview) > 4000:
                        body_preview = body_preview[:4000] + "...[truncated]"
                row: dict[str, Any] = {
                    "index": i + 1,
                    "value": primary_value,
                    "field_values": field_values,
                    "status_code": resp.status_code,
                    "ok_http": 200 <= resp.status_code < 300,
                    "body_preview": body_preview,
                }
                if full_log:
                    row["request_url"] = url
                    row["request_method"] = method
                    row["request_headers"] = dict(headers)
                    row["request_body"] = None if method == "GET" else body
                results.append(row)
            except requests.RequestException as e:
                err_row: dict[str, Any] = {
                    "index": i + 1,
                    "value": primary_value,
                    "field_values": field_values,
                    "status_code": None,
                    "ok_http": False,
                    "error": str(e),
                }
                if full_log:
                    err_row["request_url"] = url
                    err_row["request_method"] = method
                    err_row["request_headers"] = dict(headers)
                    err_row["request_body"] = body if method != "GET" else None
                results.append(err_row)
            if delay_ms and i < repeat_count - 1 and (not stopped_early or i < repeat_count - 1):
                time.sleep(delay_ms / 1000.0)

        return jsonify(
            {
                "ok": True,
                "summary": {
                    "sent": len(results),
                    "variable_path": variable_path,
                    "variable_paths": variable_paths,
                    "range_min": range_min,
                    "range_max": range_max,
                    "requested": repeat_count,
                },
                "stopped_early": stopped_early,
                "results": results,
            }
        )
