from core.services.jmeter_scenario.demo_seed_db import get_demo_seed

d = get_demo_seed("demo_jmeter_full_components")
y = d["payload"]["yaml"]
print(d["title"])
print("yaml_len", len(y))
print("http_methods", y.count("method:"))
print("test_plans", y.count("- name: 计划"))
