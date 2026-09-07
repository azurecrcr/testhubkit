"""一次性删除 JMeter 压测演示种子（demo_jmeter_full_components）。"""
from core.services.jmeter_scenario.demo_seed_db import DEMO_SEED_KEY, get_connection


def main() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM jmeter_scenario_demo_seeds WHERE seed_key=%s",
                (DEMO_SEED_KEY,),
            )
            print(f"deleted_rows={cur.rowcount}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
