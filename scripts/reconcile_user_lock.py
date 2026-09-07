#!/usr/bin/env python3
import os
import sys

os.chdir("/app")
sys.path.insert(0, "/app")

from core.services.test_cases.page_generation_lock_service import (
    get_user_page_gen_lock,
    reconcile_user_page_gen_lock,
)

uid = "f5aa0fbed2194970bf8e5db6a91b57df"
print("before reconcile:", get_user_page_gen_lock(uid))
print("reconciled:", reconcile_user_page_gen_lock(uid))
print("after reconcile:", get_user_page_gen_lock(uid))
