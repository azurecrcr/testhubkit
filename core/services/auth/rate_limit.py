from __future__ import annotations

import re
import time
from datetime import datetime, timedelta

from core.services.auth.auth_db import ensure_auth_tables
from core.services.test_cases.mysql_db import get_connection

EMAIL_SEND_INTERVAL_SEC = 60
EMAIL_DAILY_MAX = 10
IP_HOURLY_MAX = 30

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not _EMAIL_RE.match(e) or len(e) > 255:
        raise ValueError("请输入有效的邮箱地址")
    return e


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def check_send_code_allowed(*, email: str, client_ip: str) -> None:
    ensure_auth_tables()
    email = normalize_email(email)
    ip = (client_ip or "").strip()[:45]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT created_at FROM hub_auth_send_log
                WHERE email = %s AND action = 'send_code'
                ORDER BY created_at DESC LIMIT 1
                """,
                (email,),
            )
            row = cur.fetchone()
            if row and row.get("created_at"):
                last = row["created_at"]
                if isinstance(last, datetime):
                    delta = datetime.now() - last
                    if delta.total_seconds() < EMAIL_SEND_INTERVAL_SEC:
                        raise ValueError(f"发送过于频繁，请 {EMAIL_SEND_INTERVAL_SEC} 秒后再试")

            day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM hub_auth_send_log
                WHERE email = %s AND action = 'send_code' AND created_at >= %s
                """,
                (email, day_start.strftime("%Y-%m-%d %H:%M:%S")),
            )
            daily = int((cur.fetchone() or {}).get("c") or 0)
            if daily >= EMAIL_DAILY_MAX:
                raise ValueError(f"该邮箱今日验证码发送次数已达上限（{EMAIL_DAILY_MAX} 次）")

            if ip:
                hour_ago = datetime.now() - timedelta(hours=1)
                cur.execute(
                    """
                    SELECT COUNT(*) AS c FROM hub_auth_send_log
                    WHERE client_ip = %s AND action = 'send_code' AND created_at >= %s
                    """,
                    (ip, hour_ago.strftime("%Y-%m-%d %H:%M:%S")),
                )
                ip_count = int((cur.fetchone() or {}).get("c") or 0)
                if ip_count >= IP_HOURLY_MAX:
                    raise ValueError("当前网络请求过于频繁，请稍后再试")
    finally:
        conn.close()


def record_send_code(*, email: str, client_ip: str) -> None:
    ensure_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_auth_send_log (email, client_ip, action, created_at)
                VALUES (%s, %s, 'send_code', %s)
                """,
                (normalize_email(email), (client_ip or "")[:45], _now_str()),
            )
    finally:
        conn.close()
