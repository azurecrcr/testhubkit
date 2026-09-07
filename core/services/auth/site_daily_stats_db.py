"""站点按日指标聚合（管理员日报专用；不改动既有 DAU/匿名查询调用方）。"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from core.services.auth.prompt_visibility_admin import ROLE_MANAGER
from core.services.test_cases.mysql_db import get_connection

_PUSH_LOG_SQL = """
CREATE TABLE IF NOT EXISTS hub_admin_daily_stats_push_log (
    stat_date DATE NOT NULL COMMENT '统计日（推送内容所属自然日）',
    status VARCHAR(16) NOT NULL DEFAULT 'running' COMMENT 'running|done|failed',
    register_count INT NOT NULL DEFAULT 0,
    login_dau INT NOT NULL DEFAULT 0,
    anon_uv INT NOT NULL DEFAULT 0,
    recipient_count INT NOT NULL DEFAULT 0,
    error_msg VARCHAR(500) NOT NULL DEFAULT '',
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    PRIMARY KEY (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='管理员站点日报推送幂等日志'
"""

_log_ready = False


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def normalize_stat_date(active_date: str) -> str:
    day = (active_date or "").strip()[:10]
    if len(day) != 10 or day[4] != "-" or day[7] != "-":
        return ""
    try:
        time.strptime(day, "%Y-%m-%d")
    except ValueError:
        return ""
    return day


def yesterday_stat_date() -> str:
    return time.strftime(
        "%Y-%m-%d",
        time.localtime(time.time() - 86400),
    )


def ensure_admin_daily_stats_push_log_table() -> None:
    global _log_ready
    if _log_ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_PUSH_LOG_SQL)
        _log_ready = True
    finally:
        conn.close()


def count_registrations_by_date(active_date: str) -> int:
    """统计某自然日新注册用户数（独立查询，不影响注册主流程）。"""
    day = normalize_stat_date(active_date)
    if not day:
        return 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM hub_users
                WHERE created_at >= %s
                  AND created_at < DATE_ADD(%s, INTERVAL 1 DAY)
                """,
                (day + " 00:00:00", day),
            )
            row = cur.fetchone() or {}
            return int(row.get("cnt") or 0)
    finally:
        conn.close()


def count_login_dau_by_date(active_date: str) -> int:
    """统计某自然日登录用户去重日活（独立 COUNT，不改 list_dau_by_date）。"""
    summary = summarize_login_activity_by_date(active_date)
    return int(summary.get("unique") or 0)


def summarize_login_activity_by_date(active_date: str) -> Dict[str, int]:
    """登录用户：total=访问次数合计(hit_count)，unique=去重用户数。"""
    day = normalize_stat_date(active_date)
    if not day:
        return {"total": 0, "unique": 0}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(DISTINCT user_id) AS uniq_cnt,
                       COALESCE(SUM(hit_count), 0) AS total_hits
                FROM hub_user_activity_daily
                WHERE active_date = %s
                """,
                (day,),
            )
            row = cur.fetchone() or {}
            return {
                "unique": int(row.get("uniq_cnt") or 0),
                "total": int(row.get("total_hits") or 0),
            }
    finally:
        conn.close()


def count_anon_uv_for_daily_stats(active_date: str) -> int:
    """日报用匿名去重 UV。"""
    summary = summarize_anon_activity_by_date(active_date)
    return int(summary.get("unique") or 0)


def summarize_anon_activity_by_date(active_date: str) -> Dict[str, int]:
    """离线访客：total=访问次数合计，unique=去重访客数。独立查询，不改 anon_activity_db API。"""
    day = normalize_stat_date(active_date)
    if not day:
        return {"total": 0, "unique": 0}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 确保匿名表存在（失败则 0）
            try:
                from core.services.auth.anon_activity_db import ensure_anon_activity_tables

                ensure_anon_activity_tables()
            except Exception:
                pass
            cur.execute(
                """
                SELECT COUNT(DISTINCT visitor_id) AS uniq_cnt,
                       COALESCE(SUM(hit_count), 0) AS total_hits
                FROM hub_anon_uv_daily
                WHERE active_date = %s
                """,
                (day,),
            )
            row = cur.fetchone() or {}
            return {
                "unique": int(row.get("uniq_cnt") or 0),
                "total": int(row.get("total_hits") or 0),
            }
    finally:
        conn.close()


def summarize_anon_clean_activity_by_date(active_date: str) -> Dict[str, int]:
    """
    离线访客「有效曝光」：按 last_path 去噪后的 unique/total。
    独立统计，不改写入埋点与其它接口。
    """
    day = normalize_stat_date(active_date)
    if not day:
        return {"total": 0, "unique": 0}
    try:
        from core.services.auth.anon_activity_db import ensure_anon_activity_tables
        from core.services.auth.anon_activity_tracker import is_clean_anon_exposure_path

        ensure_anon_activity_tables()
    except Exception:
        return {"total": 0, "unique": 0}

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT visitor_id, hit_count, last_path
                FROM hub_anon_uv_daily
                WHERE active_date = %s
                """,
                (day,),
            )
            rows = list(cur.fetchall() or [])
    finally:
        conn.close()

    uniq = set()
    total = 0
    for row in rows:
        r = row or {}
        path = str(r.get("last_path") or "")
        try:
            ok = is_clean_anon_exposure_path(path)
        except Exception:
            ok = False
        if not ok:
            continue
        vid = str(r.get("visitor_id") or "").strip().lower()
        if vid:
            uniq.add(vid)
        total += int(r.get("hit_count") or 0)
    return {"unique": len(uniq), "total": total}


def collect_site_daily_stats(active_date: str) -> Dict[str, Any]:
    day = normalize_stat_date(active_date)
    if not day:
        raise ValueError("无效的统计日期")
    register_count = count_registrations_by_date(day)
    login = summarize_login_activity_by_date(day)
    anon = summarize_anon_activity_by_date(day)
    anon_clean = summarize_anon_clean_activity_by_date(day)
    login_unique = int(login.get("unique") or 0)
    login_total = int(login.get("total") or 0)
    anon_unique = int(anon.get("unique") or 0)
    anon_total = int(anon.get("total") or 0)
    anon_clean_unique = int(anon_clean.get("unique") or 0)
    anon_clean_total = int(anon_clean.get("total") or 0)
    return {
        "stat_date": day,
        "register_count": register_count,
        # 兼容旧字段：去重日活
        "login_dau": login_unique,
        "anon_uv": anon_unique,
        "login_dau_unique": login_unique,
        "login_dau_total": login_total,
        "anon_uv_unique": anon_unique,
        "anon_uv_total": anon_total,
        "anon_uv_clean_unique": anon_clean_unique,
        "anon_uv_clean_total": anon_clean_total,
        "combined_reference": login_unique + anon_unique,
        "generated_at": _now_str(),
    }


def _fmt_daily_stats_dt(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            pass
    text = str(value).strip()
    return text[:19] if text else ""


def list_login_users_for_daily_stats(active_date: str) -> List[Dict[str, Any]]:
    """日报弹窗：某日登录活跃用户明细（独立查询，不改动 list_dau_by_date）。"""
    day = normalize_stat_date(active_date)
    if not day:
        return []
    try:
        from core.services.auth.user_activity_db import ensure_user_activity_tables

        ensure_user_activity_tables()
    except Exception:
        pass
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.user_id AS user_id,
                       u.email AS email,
                       u.display_name AS display_name,
                       d.hit_count AS hit_count,
                       d.first_seen_at AS first_seen_at,
                       d.last_seen_at AS last_seen_at,
                       d.last_path AS last_path
                FROM hub_user_activity_daily d
                LEFT JOIN hub_users u ON u.id = d.user_id
                WHERE d.active_date = %s
                ORDER BY d.hit_count DESC, d.last_seen_at DESC
                """,
                (day,),
            )
            rows = list(cur.fetchall() or [])
    finally:
        conn.close()

    out: List[Dict[str, Any]] = []
    for row in rows:
        r = row or {}
        email = str(r.get("email") or "").strip()
        name = str(r.get("display_name") or "").strip()
        out.append(
            {
                "user_id": str(r.get("user_id") or "").strip(),
                "email": email or "—",
                "display_name": name,
                "hit_count": int(r.get("hit_count") or 0),
                "first_seen_at": _fmt_daily_stats_dt(r.get("first_seen_at")),
                "last_seen_at": _fmt_daily_stats_dt(r.get("last_seen_at")),
                "last_path": str(r.get("last_path") or "").strip() or "—",
            }
        )
    return out


def list_anon_visitors_for_daily_stats(
    active_date: str,
    *,
    clean_only: bool = False,
) -> List[Dict[str, Any]]:
    """日报弹窗：某日离线访客明细（cookie 去重 + IP/地区；独立查询）。"""
    day = normalize_stat_date(active_date)
    if not day:
        return []
    try:
        from core.services.auth.anon_activity_db import ensure_anon_activity_tables

        ensure_anon_activity_tables()
    except Exception:
        pass
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT visitor_id, first_seen_at, last_seen_at, hit_count, client_ip, last_path
                FROM hub_anon_uv_daily
                WHERE active_date = %s
                ORDER BY hit_count DESC, last_seen_at DESC
                """,
                (day,),
            )
            rows = list(cur.fetchall() or [])
    finally:
        conn.close()

    if clean_only:
        try:
            from core.services.auth.anon_activity_tracker import is_clean_anon_exposure_path

            rows = [
                r
                for r in rows
                if is_clean_anon_exposure_path(str((r or {}).get("last_path") or ""))
            ]
        except Exception:
            rows = []

    ips = [str((r or {}).get("client_ip") or "").strip() for r in rows]
    try:
        from core.utils.ip_region import resolve_ip_regions_for_daily_stats

        region_map = resolve_ip_regions_for_daily_stats(ips)
    except Exception:
        region_map = {}

    out: List[Dict[str, Any]] = []
    for row in rows:
        r = row or {}
        vid = str(r.get("visitor_id") or "").strip().lower()
        ip = str(r.get("client_ip") or "").strip()
        out.append(
            {
                "visitor_id": vid,
                "visitor_short": (vid[:8] if len(vid) >= 8 else vid) or "—",
                "client_ip": ip or "—",
                "region": str(region_map.get(ip) or "") if ip else "",
                "hit_count": int(r.get("hit_count") or 0),
                "first_seen_at": _fmt_daily_stats_dt(r.get("first_seen_at")),
                "last_seen_at": _fmt_daily_stats_dt(r.get("last_seen_at")),
                "last_path": str(r.get("last_path") or "").strip() or "—",
            }
        )
    return out


def list_manager_user_ids_for_daily_stats() -> List[str]:
    """列出全部 manager 用户 id（日报收件人专用）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM hub_users
                WHERE LOWER(TRIM(IFNULL(role, ''))) = %s
                ORDER BY created_at ASC, id ASC
                """,
                (ROLE_MANAGER,),
            )
            rows = cur.fetchall() or []
        out: List[str] = []
        for row in rows:
            uid = str((row or {}).get("id") or "").strip()
            if len(uid) == 32 and uid.isalnum():
                out.append(uid)
        return out
    finally:
        conn.close()


def try_claim_daily_stats_push(stat_date: str, *, force: bool = False) -> bool:
    """
    幂等占坑：成功占到返回 True。
    force=True 时覆盖任意状态；force=False 时仅允许新建或重试 failed。
    """
    day = normalize_stat_date(stat_date)
    if not day:
        return False
    ensure_admin_daily_stats_push_log_table()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if force:
                cur.execute(
                    """
                    INSERT INTO hub_admin_daily_stats_push_log
                        (stat_date, status, register_count, login_dau, anon_uv,
                         recipient_count, error_msg, started_at, finished_at)
                    VALUES (%s, 'running', 0, 0, 0, 0, '', %s, NULL)
                    ON DUPLICATE KEY UPDATE
                        status = 'running',
                        error_msg = '',
                        started_at = VALUES(started_at),
                        finished_at = NULL
                    """,
                    (day, now),
                )
                return True
            try:
                cur.execute(
                    """
                    INSERT INTO hub_admin_daily_stats_push_log
                        (stat_date, status, register_count, login_dau, anon_uv,
                         recipient_count, error_msg, started_at, finished_at)
                    VALUES (%s, 'running', 0, 0, 0, 0, '', %s, NULL)
                    """,
                    (day, now),
                )
                return True
            except Exception:
                cur.execute(
                    """
                    UPDATE hub_admin_daily_stats_push_log
                    SET status = 'running',
                        error_msg = '',
                        started_at = %s,
                        finished_at = NULL
                    WHERE stat_date = %s AND status = 'failed'
                    """,
                    (now, day),
                )
                return int(cur.rowcount or 0) > 0
    finally:
        conn.close()


def mark_daily_stats_push_done(
    stat_date: str,
    *,
    register_count: int,
    login_dau: int,
    anon_uv: int,
    recipient_count: int,
) -> None:
    day = normalize_stat_date(stat_date)
    if not day:
        return
    ensure_admin_daily_stats_push_log_table()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_admin_daily_stats_push_log
                SET status = 'done',
                    register_count = %s,
                    login_dau = %s,
                    anon_uv = %s,
                    recipient_count = %s,
                    error_msg = '',
                    finished_at = %s
                WHERE stat_date = %s
                """,
                (
                    int(register_count or 0),
                    int(login_dau or 0),
                    int(anon_uv or 0),
                    int(recipient_count or 0),
                    now,
                    day,
                ),
            )
    finally:
        conn.close()


def mark_daily_stats_push_failed(stat_date: str, error_msg: str) -> None:
    day = normalize_stat_date(stat_date)
    if not day:
        return
    ensure_admin_daily_stats_push_log_table()
    now = _now_str()
    err = (error_msg or "").strip()[:500]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_admin_daily_stats_push_log
                SET status = 'failed',
                    error_msg = %s,
                    finished_at = %s
                WHERE stat_date = %s
                """,
                (err, now, day),
            )
    finally:
        conn.close()
