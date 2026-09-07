"""通过 SMTP 发送建议通知（可选；使用自有 163 等邮箱，非 SendGrid 类按量 API）。"""

from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from core.config import feedback as cfg


def send_feedback_notification(
    *,
    feedback_id: str,
    content: str,
    contact: str,
    page_url: str,
    client_ip: str = "",
    user_id: str | None = None,
) -> None:
    if not cfg.is_feedback_email_enabled():
        return

    subject = f"[TestHub 投稿/建议] {feedback_id[:8]}"
    body = (
        f"收到新的系统建议（ID: {feedback_id}）\n\n"
        f"提交 IP: {client_ip or '（未知）'}\n"
        f"登录用户 ID: {user_id or '（未登录）'}\n"
        f"联系方式: {contact or '（未填写）'}\n"
        f"来源页面: {page_url or '（未知）'}\n\n"
        f"--- 建议内容 ---\n{content}\n"
    )

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = formataddr(("TestHub", cfg.SMTP_FROM or cfg.SMTP_USER))
    msg["To"] = cfg.FEEDBACK_NOTIFY_EMAIL
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if cfg.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=20) as server:
            server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
            server.sendmail(cfg.SMTP_FROM or cfg.SMTP_USER, [cfg.FEEDBACK_NOTIFY_EMAIL], msg.as_string())
    else:
        with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=20) as server:
            server.starttls()
            server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
            server.sendmail(cfg.SMTP_FROM or cfg.SMTP_USER, [cfg.FEEDBACK_NOTIFY_EMAIL], msg.as_string())
