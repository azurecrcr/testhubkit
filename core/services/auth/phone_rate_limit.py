"""手机号发码限流（独立方法，不改邮箱限流逻辑）。"""

from __future__ import annotations

import time
from datetime import datetime, timedelta

from core.config import sms_auth as cfg
from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.phone_identity import normalize_phone
from core.services.test_cases.mysql_db import get_connection


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def check_send_phone_code_allowed(
    *,
    phone: str,
    client_ip: str,
    action: str = "send_phone_code",
) -> None:
    ensure_auth_tables()
    phone = normalize_phone(phone)
    action = (action or "send_phone_code").strip() or "send_phone_code"
    ip = (client_ip or "").strip()[:45]
    interval = max(1, cfg.SMS_SEND_INTERVAL_SEC)
    daily_max = max(1, cfg.SMS_PHONE_DAILY_MAX)
    ip_hourly_max = max(1, cfg.SMS_IP_HOURLY_MAX)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT created_at FROM hub_auth_send_log
                WHERE email = %s AND action = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (phone, action),
            )
            row = cur.fetchone()
            if row and row.get("created_at"):
                last = row["created_at"]
                if isinstance(last, datetime):
                    if (datetime.now() - last).total_seconds() < interval:
                        raise ValueError(f"发送过于频繁，请 {interval} 秒后再试")

            day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM hub_auth_send_log
                WHERE email = %s AND action = %s AND created_at >= %s
                """,
                (phone, action, day_start.strftime("%Y-%m-%d %H:%M:%S")),
            )
            daily = int((cur.fetchone() or {}).get("c") or 0)
            if daily >= daily_max:
                raise ValueError(f"该手机号今日验证码发送次数已达上限（{daily_max} 次）")

            if ip:
                hour_ago = datetime.now() - timedelta(hours=1)
                cur.execute(
                    """
                    SELECT COUNT(*) AS c FROM hub_auth_send_log
                    WHERE client_ip = %s AND action = %s AND created_at >= %s
                    """,
                    (ip, action, hour_ago.strftime("%Y-%m-%d %H:%M:%S")),
                )
                ip_count = int((cur.fetchone() or {}).get("c") or 0)
                if ip_count >= ip_hourly_max:
                    raise ValueError("当前网络请求过于频繁，请稍后再试")
    finally:
        conn.close()


def record_send_phone_code(
    *,
    phone: str,
    client_ip: str,
    action: str = "send_phone_code",
) -> None:
    """复用 hub_auth_send_log.email 列存手机号；action 区分注册登录与改密，不影响邮箱 send_code。"""
    ensure_auth_tables()
    action = (action or "send_phone_code").strip() or "send_phone_code"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_auth_send_log (email, client_ip, action, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (normalize_phone(phone), (client_ip or "")[:45], action, _now_str()),
            )
    finally:
        conn.close()
