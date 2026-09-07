"""IP 归属地解析（日报离线访客展示用；失败静默回退为空）。"""
from __future__ import annotations

import ipaddress
import threading
import time
from typing import Dict, Iterable, List

import requests

_lock = threading.Lock()
_cache: Dict[str, str] = {}
_CACHE_MAX = 4096
_bg_lock = threading.Lock()
_bg_pending: set[str] = set()


def _is_private_or_special(ip: str) -> str | None:
    try:
        obj = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if obj.is_loopback:
        return "本机"
    if obj.is_private or obj.is_link_local or obj.is_reserved:
        return "内网"
    if obj.is_multicast:
        return "组播"
    return None


def _normalize_ip(ip: str) -> str:
    return (ip or "").strip()


def _compose_region(country: str = "", region: str = "", city: str = "") -> str:
    parts: List[str] = []
    for item in (country, region, city):
        text = str(item or "").strip()
        if not text or text in ("XX", "未知", "内网IP"):
            continue
        if text in parts:
            continue
        parts.append(text)
    return " · ".join(parts)


def _lookup_ip_api_batch(ips: List[str], *, timeout: float = 4.5) -> Dict[str, str]:
    """ip-api.com 批量查询（免费层 HTTP，中文）。"""
    if not ips:
        return {}
    payload = [{"query": ip} for ip in ips]
    url = "http://ip-api.com/batch?fields=status,message,country,regionName,city,query&lang=zh-CN"
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        if resp.status_code != 200:
            return {}
        rows = resp.json()
        if not isinstance(rows, list):
            return {}
    except Exception:
        return {}

    out: Dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        query = _normalize_ip(str(row.get("query") or ""))
        if not query:
            continue
        if str(row.get("status") or "") != "success":
            out[query] = ""
            continue
        out[query] = _compose_region(
            str(row.get("country") or ""),
            str(row.get("regionName") or ""),
            str(row.get("city") or ""),
        )
    return out


def _lookup_pconline_one(ip: str) -> str:
    """备用：太平洋网络 whois（单条）。"""
    try:
        resp = requests.get(
            "https://whois.pconline.com.cn/ipJson.jsp",
            params={"ip": ip, "json": "true"},
            timeout=2.8,
            headers={"User-Agent": "TestHubDailyStats/1.0"},
        )
        if resp.status_code != 200:
            return ""
        try:
            data = resp.json()
        except Exception:
            data = None
            for enc in ("utf-8", "gbk", "gb2312"):
                try:
                    data = resp.content.decode(enc)
                    import json

                    data = json.loads(data)
                    break
                except Exception:
                    data = None
        if not isinstance(data, dict):
            return ""
        addr = str(data.get("addr") or "").strip()
        if addr:
            return " ".join(addr.split())
        return _compose_region(
            str(data.get("pro") or ""),
            str(data.get("city") or ""),
            str(data.get("region") or ""),
        )
    except Exception:
        return ""


def _remember(ip: str, region: str) -> None:
    if not str(region or "").strip():
        return
    with _lock:
        if len(_cache) >= _CACHE_MAX:
            for k in list(_cache.keys())[: _CACHE_MAX // 2]:
                _cache.pop(k, None)
        _cache[ip] = region


def _memory_get(ip: str) -> str | None:
    with _lock:
        if ip in _cache:
            return _cache.get(ip)
    return None


def resolve_ip_regions(
    ips: Iterable[str],
    *,
    allow_fallback: bool = True,
    timeout: float = 4.5,
) -> Dict[str, str]:
    """批量解析 IP -> 地区文案（完整路径，可供后台补齐使用）。"""
    need: List[str] = []
    result: Dict[str, str] = {}
    seen = set()

    for raw in ips:
        ip = _normalize_ip(raw)
        if not ip or ip in seen:
            continue
        seen.add(ip)
        special = _is_private_or_special(ip)
        if special is not None:
            result[ip] = special
            continue
        cached = _memory_get(ip)
        if cached is not None and cached != "":
            result[ip] = cached
            continue
        need.append(ip)

    for i in range(0, len(need), 100):
        chunk = need[i : i + 100]
        got = _lookup_ip_api_batch(chunk, timeout=timeout)
        if allow_fallback:
            missing = [ip for ip in chunk if not str(got.get(ip) or "")]
            # 后台可多补一些，但仍限流
            for ip in missing[:20]:
                got[ip] = _lookup_pconline_one(ip)
        for ip in chunk:
            region = str(got.get(ip) or "")
            result[ip] = region
            _remember(ip, region)

    return result


def _background_fill_regions(ips: List[str]) -> None:
    """后台补齐未命中归属地，写入内存 + MySQL，不阻塞接口。"""
    try:
        # 优先国内备用源（服务器上 ip-api 常超时），再尝试批量
        filled: Dict[str, str] = {}
        remain: List[str] = []
        for ip in ips:
            special = _is_private_or_special(ip)
            if special is not None:
                filled[ip] = special
                continue
            cached = _memory_get(ip)
            if cached:
                filled[ip] = cached
                continue
            remain.append(ip)

        # 先试一小批 ip-api
        if remain:
            got = _lookup_ip_api_batch(remain[:100], timeout=3.0)
            for ip, region in got.items():
                if str(region or "").strip():
                    filled[ip] = region
            remain = [ip for ip in remain if not str(filled.get(ip) or "").strip()]

        # pconline 多轮补齐（后台执行，不挡接口）
        round_n = 0
        while remain and round_n < 4:
            round_n += 1
            batch = remain[:50]
            remain = remain[50:]
            for ip in batch:
                region = _lookup_pconline_one(ip)
                if region:
                    filled[ip] = region
                time.sleep(0.04)

        to_save = {ip: reg for ip, reg in filled.items() if str(reg or "").strip()}
        for ip, reg in to_save.items():
            _remember(ip, reg)
        if to_save:
            from core.services.auth.ip_region_cache_db import save_ip_regions_to_db

            save_ip_regions_to_db(to_save)
    except Exception:
        return
    finally:
        with _bg_lock:
            for ip in ips:
                _bg_pending.discard(ip)


def _schedule_background_fill(ips: List[str]) -> None:
    if not ips:
        return
    to_bg: List[str] = []
    with _bg_lock:
        for ip in ips:
            if ip in _bg_pending:
                continue
            _bg_pending.add(ip)
            to_bg.append(ip)
    if not to_bg:
        return
    threading.Thread(
        target=_background_fill_regions,
        args=(to_bg,),
        name="ip-region-bg-fill",
        daemon=True,
    ).start()


def resolve_ip_regions_for_daily_stats(ips: Iterable[str]) -> Dict[str, str]:
    """
    日报离线访客专用快路径：只读内存 / MySQL 缓存，不阻塞外呼；
    未命中的交给后台补齐，避免首次接口被 IP 库拖慢。
    """
    result: Dict[str, str] = {}
    seen = set()
    candidates: List[str] = []
    need_lookup: List[str] = []

    for raw in ips:
        ip = _normalize_ip(raw)
        if not ip or ip in seen:
            continue
        seen.add(ip)
        candidates.append(ip)
        special = _is_private_or_special(ip)
        if special is not None:
            result[ip] = special
            continue
        cached = _memory_get(ip)
        if cached:
            result[ip] = cached
            continue
        need_lookup.append(ip)

    if need_lookup:
        try:
            from core.services.auth.ip_region_cache_db import load_ip_regions_from_db

            db_hits = load_ip_regions_from_db(need_lookup)
        except Exception:
            db_hits = {}
        still: List[str] = []
        for ip in need_lookup:
            region = str(db_hits.get(ip) or "").strip()
            if region:
                result[ip] = region
                _remember(ip, region)
            else:
                still.append(ip)
        need_lookup = still

    _schedule_background_fill(need_lookup)

    for ip in candidates:
        if ip not in result:
            result[ip] = ""
    return result


def resolve_ip_region(ip: str) -> str:
    ip = _normalize_ip(ip)
    if not ip:
        return ""
    return resolve_ip_regions([ip]).get(ip, "")
