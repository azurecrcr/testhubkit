-- TestHub 数据库（Docker 首次启动时执行）
CREATE DATABASE IF NOT EXISTS testhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE testhub;

CREATE TABLE IF NOT EXISTS system_feedback (
    id CHAR(32) NOT NULL PRIMARY KEY,
    content TEXT NOT NULL,
    contact VARCHAR(120) NOT NULL DEFAULT '',
    page_url VARCHAR(500) NOT NULL DEFAULT '',
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    email_sent TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_created (created_at),
    INDEX idx_client_ip_created (client_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 敏感功能统一开关：is_locked=1 上锁（页面可密码解锁），0 全部开放
CREATE TABLE IF NOT EXISTS toolkit_lock_switch (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    is_locked TINYINT(1) NOT NULL DEFAULT 1,
    label VARCHAR(120) NOT NULL DEFAULT '敏感功能统一上锁',
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO toolkit_lock_switch (id, is_locked, label, updated_at) VALUES
    (1, 0, '敏感功能统一上锁', NOW());

CREATE TABLE IF NOT EXISTS prompt_submissions (
    id CHAR(32) NOT NULL PRIMARY KEY,
    client_ip VARCHAR(45) NOT NULL,
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    page_url VARCHAR(500) NOT NULL DEFAULT '',
    entry_type VARCHAR(20) NOT NULL,
    category VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    kicker VARCHAR(200) NOT NULL DEFAULT '',
    blurb VARCHAR(500) NOT NULL DEFAULT '',
    tags JSON,
    body MEDIUMTEXT NOT NULL,
    email_sent TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_ip_created (client_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jmeter_scenario_demo_seeds (
    seed_key VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
