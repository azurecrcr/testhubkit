"""手机号短信认证配置（号码认证 dypnsapi，与邮箱 SMTP 分离）。

阿里云 AccessKey 存 MySQL（aliyun_sms_credentials），不写死在代码/compose。
签名与模板等非密钥项仍可用环境变量配置。
"""



import os


def _flag(name: str, default: str = "") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


SMS_AUTH_ENABLED = _flag("SMS_AUTH_ENABLED", "false")

# 兼容旧代码读取；运行时请用 get_aliyun_access_key_*（优先数据库）
ALIYUN_ACCESS_KEY_ID = os.environ.get("ALIYUN_ACCESS_KEY_ID", "").strip()
ALIYUN_ACCESS_KEY_SECRET = os.environ.get("ALIYUN_ACCESS_KEY_SECRET", "").strip()

SMS_SIGN_NAME = os.environ.get("SMS_SIGN_NAME", "速通互联验证码").strip()
SMS_TEMPLATE_CODE = os.environ.get("SMS_TEMPLATE_CODE", "100001").strip()
SMS_TEMPLATE_MIN = os.environ.get("SMS_TEMPLATE_MIN", "5").strip() or "5"
SMS_CODE_LENGTH = int(os.environ.get("SMS_CODE_LENGTH", "4"))
SMS_CODE_TYPE = int(os.environ.get("SMS_CODE_TYPE", "1"))  # 1=纯数字
SMS_VALID_TIME_SEC = int(os.environ.get("SMS_VALID_TIME_SEC", "300"))
SMS_SEND_INTERVAL_SEC = int(os.environ.get("SMS_SEND_INTERVAL_SEC", "60"))
SMS_PHONE_DAILY_MAX = int(os.environ.get("SMS_PHONE_DAILY_MAX", "10"))
SMS_IP_HOURLY_MAX = int(os.environ.get("SMS_IP_HOURLY_MAX", "30"))
SMS_ENDPOINT = os.environ.get("SMS_ENDPOINT", "dypnsapi.aliyuncs.com").strip()

PHONE_EMAIL_DOMAIN = "phone.local"


def get_aliyun_access_key_id() -> str:
    from core.services.auth.aliyun_sms_credentials_db import get_aliyun_sms_credentials

    return get_aliyun_sms_credentials().get("access_key_id") or ""


def get_aliyun_access_key_secret() -> str:
    from core.services.auth.aliyun_sms_credentials_db import get_aliyun_sms_credentials

    return get_aliyun_sms_credentials().get("access_key_secret") or ""


def is_sms_auth_ready() -> bool:
    return bool(
        SMS_AUTH_ENABLED
        and get_aliyun_access_key_id()
        and get_aliyun_access_key_secret()
        and SMS_SIGN_NAME
        and SMS_TEMPLATE_CODE
    )
