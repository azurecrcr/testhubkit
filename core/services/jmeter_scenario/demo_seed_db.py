"""JMeter 压测场景演示种子（数据库存储，供页面加载测试 JMX 导出）。"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import pymysql
from pymysql.cursors import DictCursor

from core.config.database import (
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

DEMO_SEED_KEY = "demo_jmeter_full_components"

_ORDER_CHAIN_DEMO_YAML = (
    Path(__file__).resolve().parents[3]
    / "static"
    / "data"
    / "jmeter_templates"
    / "order_chain_demo.yaml"
)

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS jmeter_scenario_demo_seeds (
    seed_key VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    yaml_content LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_updated (updated_at)
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


def ensure_demo_seed_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def _default_demo_yaml() -> str:
    if _ORDER_CHAIN_DEMO_YAML.is_file():
        return _ORDER_CHAIN_DEMO_YAML.read_text(encoding="utf-8")
    return """name: JMeter 元件全量演示
base_url: https://httpbin.org
env: dev
build: "${BUILD_ID}"
default_headers:
  Accept: application/json
  X-Demo-Global: omniflow
variables:
  GLOBAL_TOKEN: demo-token-001
  PLAN_A_BUILD: build-a
  PLAN_B_BUILD: build-b
  PLAN_C_TRACE: trace-c
influxdb:
  enabled: true
  url: http://127.0.0.1:8086/write?db=jmeter
  measurement: jmeter
  application: jmeter-components-demo
  tags:
    scenario: jmeter-components-demo
    env: dev
thread_groups:
      - name: 线程组A1-HTTP默认值与请求头
        load:
          users: 3
          spawn_rate: 1
          duration_sec: 90
          loops: -1
        variables:
          TG_A1_ROLE: reader
        influxdb:
          tags:
            scenario: plan-a-tg1
        listeners:
          view_results_tree: true
          aggregate_report: false
        http_managers:
          selected_types:
            - http_defaults
            - header_manager
            - counter
          http_defaults:
            enabled: true
            protocol: https
            domain: httpbin.org
            port: "443"
            path: /
            connect_timeout: "5000"
            response_timeout: "10000"
            implementation: HttpClient4
            content_encoding: UTF-8
            follow_redirects: true
            auto_redirects: false
            use_keepalive: true
          header_manager:
            enabled: true
            headers:
              X-Plan-A: plan-a
              Authorization: "Bearer ${GLOBAL_TOKEN}"
          counter:
            enabled: true
            start: "1"
            increment: "1"
            maximum: "9999"
            format: ""
            variable_name: seq_a1
            per_user: true
        steps:
          - name: A1-GET-查询与状态断言
            method: GET
            path: /get
            query:
              seq: "${seq_a1}"
              role: "${TG_A1_ROLE}"
            headers:
              X-Step-Id: a1-get
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: contains
                value: httpbin.org
              - type: not_contains
                value: "__not_found_marker__"
              - type: duration
                value: 8000
            step_listeners:
              view_results_tree: true
            constant_timer:
              enabled: true
              delay_ms: 200
          - name: A1-POST-JSON与提取
            method: POST
            path: /post
            headers:
              Content-Type: application/json
            body: '{"plan":"A","seq":"${seq_a1}","token":"${GLOBAL_TOKEN}"}'
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: json
                value: $.json.plan
                expected: A
            extract:
              json_path: $.json.seq
              var: last_seq_a1
          - name: A1-PUT-表单参数
            method: PUT
            path: /put
            body_type: form
            form_params:
              plan: A
              seq: "${seq_a1}"
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: contains
                value: form
      - name: 线程组A2-Cookie缓存与CSV
        load:
          users: 2
          spawn_rate: 1
          duration_sec: 60
          loops: 3
        variables:
          TG_A2_ROLE: writer
        listeners:
          view_results_tree: false
          aggregate_report: true
        http_managers:
          selected_types:
            - cookie_manager
            - cache_manager
            - csv_data_set
          cookie_manager:
            enabled: true
            clear_each_iteration: true
            controlled_by_thread_group: false
            cookies:
              - name: demo_session
                value: sess-a2
                domain: httpbin.org
                path: /
          cache_manager:
            enabled: true
            clear_each_iteration: true
            use_expires: true
          csv_data_set:
            enabled: true
            filename: data/demo_users.csv
            file_encoding: UTF-8
            variable_names: user,pass
            ignore_first_line: true
            delimiter: ","
            quoted_data: false
            recycle: true
            stop_thread: false
            share_mode: shareMode.group
        steps:
          - name: A2-GET-CSV变量
            method: GET
            path: /get
            query:
              user: "${user}"
              pass: "${pass}"
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: xpath
                value: //url
              - type: size
                value: 40
                operator: ge
            user_parameters:
              enabled: true
              per_iteration: false
              params:
                - key: csv_hint
                  value: from-csv
          - name: A2-DELETE-用户参数
            method: DELETE
            path: /delete
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: xml
                value: //origin
            step_listeners:
              aggregate_report: true
            constant_timer:
              enabled: true
              delay_ms: 150
      - name: 线程组B1-断言大全
        load:
          users: 2
          spawn_rate: 2
          duration_sec: 60
          loops: -1
        listeners:
          view_results_tree: true
          aggregate_report: true
        http_managers:
          selected_types:
            - http_defaults
          http_defaults:
            enabled: true
            protocol: https
            domain: httpbin.org
            port: "443"
            path: /
        steps:
          - name: B1-GET-全断言单请求
            method: GET
            path: /get
            query:
              demo: full-assert
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: contains
                value: args
              - type: not_contains
                value: error_page
              - type: json
                value: $.url
                expected: "https://httpbin.org/get?demo=full-assert"
              - type: xml
                value: //args
              - type: xpath
                value: //args
              - type: size
                value: 80
                operator: ge
              - type: duration
                value: 6000
            step_listeners:
              view_results_tree: true
              aggregate_report: true
            constant_timer:
              enabled: true
              delay_ms: 100
            user_parameters:
              enabled: true
              params:
                - key: assert_case
                  value: all-in-one
          - name: B1-PATCH-编码与头
            method: PATCH
            path: /patch
            encoding: UTF-8
            headers:
              X-B1: patch-demo
            body: '{"patch":true}'
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: json
                value: $.json.patch
                expected: "true"
      - name: 线程组B2-多方法多体
        load:
          users: 4
          spawn_rate: 2
          duration_sec: 120
          loops: 2
        http_managers:
          selected_types:
            - counter
            - header_manager
          counter:
            enabled: true
            start: "100"
            increment: "2"
            maximum: "500"
            variable_name: seq_b2
            per_user: false
          header_manager:
            enabled: true
            headers:
              X-Plan-B: plan-b
        steps:
          - name: B2-POST-JSON
            method: POST
            path: /post
            body: '{"seq":"${seq_b2}","plan":"B"}'
            assert_status: 200
          - name: B2-POST-表单
            method: POST
            path: /post
            body_type: form
            form_params:
              seq: "${seq_b2}"
              plan: B
            assert_status: 200
            assertions:
              - type: contains
                value: form
          - name: B2-POST-Multipart
            method: POST
            path: /post
            body_type: multipart
            multipart:
              fields:
                note: multipart-demo
                seq: "${seq_b2}"
              files: []
            assert_status: 200
            assertions:
              - type: status
                value: 200
              - type: duration
                value: 8000
            step_listeners:
              view_results_tree: true
      - name: 线程组C1-链路提取
        load:
          users: 1
          spawn_rate: 1
          duration_sec: 45
          loops: -1
        listeners:
          aggregate_report: true
        steps:
          - name: C1-登录占位
            method: POST
            path: /post
            body: '{"action":"login","trace":"${PLAN_C_TRACE}"}'
            assert_status: 200
            extract:
              json_path: $.json.trace
              var: trace_id
          - name: C1-带Trace查询
            method: GET
            path: /get
            query:
              trace: "${trace_id}"
            assert_status: 200
            assertions:
              - type: json
                value: $.args.trace
                expected: "${PLAN_C_TRACE}"
            constant_timer:
              enabled: true
              delay_ms: 250
      - name: 线程组C2-监听器分工
        load:
          users: 2
          spawn_rate: 1
          duration_sec: 60
          loops: -1
        listeners:
          view_results_tree: true
        http_managers:
          selected_types:
            - csv_data_set
            - cache_manager
          csv_data_set:
            enabled: true
            filename: data/plan_c_ids.csv
            file_encoding: UTF-8
            variable_names: cid
            ignore_first_line: false
            delimiter: ","
            recycle: true
            share_mode: shareMode.thread
          cache_manager:
            enabled: true
            clear_each_iteration: false
            use_expires: true
        steps:
          - name: C2-察看结果树采样
            method: GET
            path: /uuid
            assert_status: 200
            step_listeners:
              view_results_tree: true
            user_parameters:
              enabled: true
              params:
                - key: cid_ref
                  value: "${cid}"
          - name: C2-聚合报告采样
            method: GET
            path: /headers
            assert_status: 200
            step_listeners:
              aggregate_report: true
            assertions:
              - type: size
                value: 100
                operator: le
              - type: not_contains
                value: "___missing___"
"""


def _demo_title() -> str:
    return "全元件压测全景（功能全覆盖·2并发）"


def _demo_description() -> str:
    return (
        "全元件压测全景：SetUp + 主压测线程组（2 并发）+ Post，覆盖工作台全部 JMeter 元件与挂载区。"
        "覆盖全部配置元件、五种逻辑控制器挂载区、断言/处理器/监听器/提取器。"
        "用于 JMX 导出验证与压测造数页面功能展示。"
    )


def upsert_default_demo_seed() -> str:
    """插入或更新默认演示种子，返回 inserted|updated|unchanged。"""
    ensure_demo_seed_table()
    yaml_text = _default_demo_yaml()
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT yaml_content FROM jmeter_scenario_demo_seeds WHERE seed_key=%s",
                (DEMO_SEED_KEY,),
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    """
                    INSERT INTO jmeter_scenario_demo_seeds
                        (seed_key, title, description, yaml_content, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (DEMO_SEED_KEY, _demo_title(), _demo_description(), yaml_text, now, now),
                )
                return "inserted"
            if (row.get("yaml_content") or "") == yaml_text:
                return "unchanged"
            cur.execute(
                """
                UPDATE jmeter_scenario_demo_seeds
                SET title=%s, description=%s, yaml_content=%s, updated_at=%s
                WHERE seed_key=%s
                """,
                (_demo_title(), _demo_description(), yaml_text, now, DEMO_SEED_KEY),
            )
            return "updated"
    finally:
        conn.close()


def seed_default_demo_if_missing() -> int:
    result = upsert_default_demo_seed()
    return 1 if result == "inserted" else 0


def get_demo_seed(seed_key: str) -> Optional[Dict[str, Any]]:
    ensure_demo_seed_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT seed_key, title, description, yaml_content, created_at, updated_at
                FROM jmeter_scenario_demo_seeds
                WHERE seed_key=%s
                """,
                (seed_key,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "seed_key": row["seed_key"],
                "title": row["title"],
                "payload": {"yaml": row["yaml_content"]},
                "created_at": str(row["created_at"]),
                "updated_at": str(row["updated_at"]),
            }
    finally:
        conn.close()
