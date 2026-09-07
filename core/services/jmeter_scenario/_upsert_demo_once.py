import sys
sys.path.insert(0,'/app')
from core.services.jmeter_scenario.demo_seed_db import upsert_default_demo_seed,get_demo_seed,DEMO_SEED_KEY
r=upsert_default_demo_seed(); d=get_demo_seed(DEMO_SEED_KEY); y=d['payload']['yaml']
print('upsert',r,'title',d['title'],'len',len(y),'name_ok',('订单创建链路' in y))
