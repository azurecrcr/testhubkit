"""阿里云短信 AccessKey：MySQL 优先；环境变量仅作迁移期回退（勿写入开源仓库）。"""



import os
from datetime import datetime
from typing import Any, Optional

from core.services.feedback.feedback_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS aliyun_sms_credentials (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    access_key_id VARCHAR(128) NOT NULL DEFAULT '',
    access_key_secret VARCHAR(256) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_aliyun_sms_credentials_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()
    migrate_env_credentials_if_empty()


def _env_credentials() -> dict[str, str]:
    return {
        "access_key_id": (os.environ.get("ALIYUN_ACCESS_KEY_ID") or "").strip(),
        "access_key_secret": (os.environ.get("ALIYUN_ACCESS_KEY_SECRET") or "").strip(),
    }


def get_stored_aliyun_sms_credentials() -> Optional[dict[str, str]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT access_key_id, access_key_secret
                FROM aliyun_sms_credentials
                WHERE id = 1
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return None
            kid = (row.get("access_key_id") or "").strip()
            secret = (row.get("access_key_secret") or "").strip()
            if not kid and not secret:
                return None
            return {"access_key_id": kid, "access_key_secret": secret, "source": "database"}
    finally:
        conn.close()


def save_aliyun_sms_credentials(access_key_id: str, access_key_secret: str) -> None:
    kid = (access_key_id or "").strip()
    secret = (access_key_secret or "").strip()
    if not kid or not secret:
        raise ValueError("阿里云 AccessKey 不完整")
    if len(kid) > 128 or len(secret) > 256:
        raise ValueError("阿里云 AccessKey 过长")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            cur.execute(
                """
                INSERT INTO aliyun_sms_credentials (id, access_key_id, access_key_secret, updated_at)
                VALUES (1, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    access_key_id = VALUES(access_key_id),
                    access_key_secret = VALUES(access_key_secret),
                    updated_at = VALUES(updated_at)
                """,
                (kid, secret, now),
            )
    finally:
        conn.close()


def migrate_env_credentials_if_empty() -> bool:
    """库内为空且环境变量有值时，一次性写入数据库。返回是否发生迁移。"""
    stored = get_stored_aliyun_sms_credentials()
    if stored and stored.get("access_key_id") and stored.get("access_key_secret"):
        return False
    env = _env_credentials()
    if not (env["access_key_id"] and env["access_key_secret"]):
        return False
    save_aliyun_sms_credentials(env["access_key_id"], env["access_key_secret"])
    return True


def get_aliyun_sms_credentials() -> dict[str, str]:
    """优先 MySQL；未配置时回退环境变量（便于本地临时调试，勿提交密钥）。"""
    try:
        stored = get_stored_aliyun_sms_credentials()
        if stored and stored.get("access_key_id") and stored.get("access_key_secret"):
            return {
                "access_key_id": stored["access_key_id"],
                "access_key_secret": stored["access_key_secret"],
                "source": "database",
            }
    except Exception:
        pass
    env = _env_credentials()
    return {
        "access_key_id": env["access_key_id"],
        "access_key_secret": env["access_key_secret"],
        "source": "environment",
    }


def is_aliyun_sms_credentials_ready() -> bool:
    creds = get_aliyun_sms_credentials()
    return bool(creds.get("access_key_id") and creds.get("access_key_secret"))


def credentials_public_status() -> dict[str, Any]:
    """供管理端展示：不回传 secret 明文。"""
    creds = get_aliyun_sms_credentials()
    kid = creds.get("access_key_id") or ""
    secret = creds.get("access_key_secret") or ""
    masked = ""
    if kid:
        masked = kid[:4] + "****" + kid[-4:] if len(kid) > 8 else "****"
    return {
        "configured": bool(kid and secret),
        "source": creds.get("source") or "",
        "access_key_id_masked": masked,
    }


def upsert_aliyun_sms_credentials_from_admin(
    access_key_id: str,
    access_key_secret: str,
) -> dict[str, Any]:
    """管理端保存：Secret 留空则保留原 Secret；两项都空则不改动。"""
    kid = (access_key_id or "").strip()
    secret = (access_key_secret or "").strip()
    existing = get_stored_aliyun_sms_credentials() or {}
    if not kid and not secret:
        return {
            "updated": False,
            "configured": bool(existing.get("access_key_id") and existing.get("access_key_secret")),
            "access_key_id": existing.get("access_key_id") or "",
            "source": existing.get("source") or "",
        }
    if not kid:
        raise ValueError("请填写 AccessKey ID")
    if not secret:
        secret = (existing.get("access_key_secret") or "").strip()
        if not secret:
            raise ValueError("请填写 AccessKey Secret")
    save_aliyun_sms_credentials(kid, secret)
    return {
        "updated": True,
        "configured": True,
        "access_key_id": kid,
        "source": "database",
    }
