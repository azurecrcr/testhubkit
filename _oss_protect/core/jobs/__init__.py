"""后台任务（守护线程、定时任务等）。"""

from core.jobs.openim_cleanup import start_openim_cleanup_thread
from core.jobs.visual_attachments_cleanup import start_visual_attachments_cleanup_thread
from core.jobs.cm_trash_cleanup import start_cm_trash_cleanup_thread
from core.jobs.admin_daily_stats_push import start_admin_daily_stats_push_thread
from core.jobs.auth_security_log_retention import start_auth_security_log_retention_thread

__all__ = [
    "start_openim_cleanup_thread",
    "start_visual_attachments_cleanup_thread",
    "start_cm_trash_cleanup_thread",
    "start_admin_daily_stats_push_thread",
    "start_auth_security_log_retention_thread",
]
