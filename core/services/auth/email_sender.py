"""发送登录/注册验证码邮件（复用 FEEDBACK_SMTP 配置）。"""

from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from core.config import feedback as cfg


def _decode_smtp_error(exc: smtplib.SMTPException) -> str:
    raw = getattr(exc, "smtp_error", b"") or b""
    if isinstance(raw, bytes):
        return raw.decode("utf-8", errors="ignore").lower()
    return str(raw).lower()


def _raise_friendly_smtp_error(exc: smtplib.SMTPException) -> None:
    msg = _decode_smtp_error(exc)
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        raise ValueError("收件邮箱无效或无法接收邮件，请检查地址是否正确") from exc
    if isinstance(exc, smtplib.SMTPDataError):
        if exc.smtp_code == 550 or "recipient" in msg or "non-existent" in msg:
            raise ValueError("收件邮箱无效或无法接收验证码，请检查邮箱地址是否正确") from exc
        raise RuntimeError("邮件服务器拒绝发送，请稍后重试") from exc
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        raise RuntimeError("邮件服务认证失败，请联系管理员") from exc
    raise RuntimeError("邮件发送失败，请稍后重试") from exc


def _smtp_configured() -> bool:
    return bool(cfg.SMTP_HOST and cfg.SMTP_USER and cfg.SMTP_PASSWORD)


def send_verification_email(*, to_email: str, code: str, purpose: str) -> None:
    if not _smtp_configured():
        raise RuntimeError("邮件服务未配置，无法发送验证码")

    purpose_labels = {
        "register": "注册",
        "login": "登录",
        "chg_pwd": "修改密码",
        "bind": "绑定邮箱",
    }
    purpose_label = purpose_labels.get(purpose, "账号验证")
    subject = f"[TestHub] {purpose_label}验证码"
    body = (
        f"您正在进行 TestHub 账号{purpose_label}。\n\n"
        f"验证码：{code}\n"
        f"有效期 10 分钟，请勿泄露给他人。\n\n"
        f"如非本人操作，请忽略此邮件。\n"
    )

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = formataddr(("TestHub", cfg.SMTP_FROM or cfg.SMTP_USER))
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if cfg.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=20) as server:
                server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.sendmail(cfg.SMTP_FROM or cfg.SMTP_USER, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=20) as server:
                server.starttls()
                server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.sendmail(cfg.SMTP_FROM or cfg.SMTP_USER, [to_email], msg.as_string())
    except smtplib.SMTPException as exc:
        _raise_friendly_smtp_error(exc)
