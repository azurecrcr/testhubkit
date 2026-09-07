#!/usr/bin/env python3
import sys
sys.path.insert(0, '/root/TestHub')
from core.services.test_cases.requirement_case_db import list_requirement_cases
rows = list_requirement_cases('1')
print('count', len(rows))
for r in rows[:20]:
    print(r.get('page_name'), '|', r.get('lanhu_page_id'), '|', r.get('lanhu_doc_id'))
