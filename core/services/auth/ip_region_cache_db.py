"""IP 归属地 MySQL 缓存（仅站点日报离线访客列表使用，不影响其它模块）。"""
from __future__ import annotations

import time
from typing import Dict, Iterable, List

from core.services.test_cases.mysql_db import get_connection

_CACHE_SQL = """
CREATE TABLE IF NOT EXISTS hub_ip_region_cache (
    client_ip VARCHAR(45) NOT NULL COMMENT '客户端IP',
    region VARCHAR(191) NOT NULL DEFAULT '' COMMENT '归属地文案',
    updated_at DATETIME NOT NULL COMMENT '最近写入时间',
    PRIMARY KEY (client_ip),
    INDEX idx_hub_ip_region_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='日报离线访客 IP 归属地缓存'
"""

_ready = False


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def ensure_ip_region_cache_table() -> None:
    global _ready
    if _ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_CACHE_SQL)
        _ready = True
    finally:
        conn.close()


def load_ip_regions_from_db(ips: Iterable[str]) -> Dict[str, str]:
    """只读已缓存的非空归属地；失败返回空 dict。"""
    uniq: List[str] = []
    seen = set()
    for raw in ips:
        ip = str(raw or "").strip()
        if not ip or ip in seen:
            continue
        seen.add(ip)
        uniq.append(ip[:45])
    if not uniq:
        return {}
    try:
        ensure_ip_region_cache_table()
    except Exception:
        return {}
    out: Dict[str, str] = {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 分批 IN，避免超长
            for i in range(0, len(uniq), 200):
                chunk = uniq[i : i + 200]
                placeholders = ", ".join(["%s"] * len(chunk))
                cur.execute(
                    f"""
                    SELECT client_ip, region
                    FROM hub_ip_region_cache
                    WHERE client_ip IN ({placeholders})
                      AND region <> ''
                    """,
                    chunk,
                )
                for row in cur.fetchall() or []:
                    ip = str((row or {}).get("client_ip") or "").strip()
                    region = str((row or {}).get("region") or "").strip()
                    if ip and region:
                        out[ip] = region
    except Exception:
        return out
    finally:
        conn.close()
    return out


def save_ip_regions_to_db(mapping: Dict[str, str]) -> None:
    """仅写入非空归属地；失败静默。"""
    rows = []
    now = _now_str()
    for ip, region in (mapping or {}).items():
        ip_s = str(ip or "").strip()[:45]
        region_s = str(region or "").strip()[:191]
        if not ip_s or not region_s:
            continue
        rows.append((ip_s, region_s, now))
    if not rows:
        return
    try:
        ensure_ip_region_cache_table()
    except Exception:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO hub_ip_region_cache (client_ip, region, updated_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    region = VALUES(region),
                    updated_at = VALUES(updated_at)
                """,
                rows,
            )
    except Exception:
        return
    finally:
        conn.close()
