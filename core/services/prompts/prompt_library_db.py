from __future__ import annotations

import pymysql
from pymysql.cursors import DictCursor

from core.config.database import (
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS prompt_library_entries (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    entry_type VARCHAR(16) NOT NULL DEFAULT 'prompt',
    category VARCHAR(32) NOT NULL,
    kicker VARCHAR(200) NOT NULL DEFAULT '',
    title VARCHAR(200) NOT NULL,
    blurb VARCHAR(500) NOT NULL DEFAULT '',
    tags JSON NOT NULL,
    body LONGTEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_category (category),
    INDEX idx_type (entry_type),
    INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def get_connection():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
    )


def ensure_prompt_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()
