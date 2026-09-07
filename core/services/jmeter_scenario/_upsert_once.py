import sys
sys.path.insert(0,'/app')
from core.services.jmeter_scenario.demo_seed_db import upsert_default_demo_seed
print('upsert', upsert_default_demo_seed())
