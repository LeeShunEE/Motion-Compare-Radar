"""邮件服务：Resend API 封装。

发送验证码邮件等。
"""

import logging

import resend

from app.core.config import settings
from app.core.exceptions import EmailServiceError

logger = logging.getLogger(__name__)


class EmailService:
    """邮件发送服务。"""

    def __init__(self) -> None:
        # 初始化 Resend API
        api_key = settings.resend_api_key_secret_string
        if api_key is None:
            raise EmailServiceError("Resend API key 未配置")
        resend.api_key = api_key.get_secret_value()
        self._from_email = settings.resend_from_email

    async def send_verification_code(
        self,
        email: str,
        code: str,
        purpose: str,
    ) -> None:
        """发送验证码邮件。

        Args:
            email: 目标邮箱
            code: 验证码
            purpose: 用途（"register" | "reset_password"）

        Raises:
            EmailServiceError: 发送失败
        """
        # 根据 purpose 定制邮件内容
        if purpose == "register":
            subject = "Radar-Renderer 邮箱验证码"
            body = f"您的注册验证码是：{code}\n验证码有效期为 10 分钟，请尽快完成注册。"
        elif purpose == "reset_password":
            subject = "Radar-Renderer 重置密码验证码"
            body = f"您的重置密码验证码是：{code}\n验证码有效期为 10 分钟，请尽快完成操作。"
        else:
            raise EmailServiceError(f"未知的验证码用途：{purpose}")

        try:
            # 必须用 async API：同步 resend.Emails.send 会阻塞 uvicorn 单 worker
            # 事件循环，期间 /health 与全部请求挂死，反向代理表现为 503，
            # Docker healthcheck 失败后整容器重启（邮件可能已成功投递）。
            await resend.Emails.send_async(
                {
                    "from": self._from_email,
                    "to": email,
                    "subject": subject,
                    "text": body,
                }
            )
        except Exception as e:
            raise EmailServiceError(f"邮件发送失败：{e}") from e

    async def send_oauth_welcome(self, email: str, provider: str) -> None:
        """发送 OAuth 登录欢迎邮件（可选）。

        Args:
            email: 用户邮箱
            provider: OAuth provider 名称
        """
        subject = f"欢迎使用 {provider} 登录"
        body = f"您已成功通过 {provider} 账户登录雷达图动画生成器。\n请前往账户设置完善您的个人信息。"

        try:
            await resend.Emails.send_async(
                {
                    "from": self._from_email,
                    "to": email,
                    "subject": subject,
                    "text": body,
                }
            )
        except Exception as e:
            # 欢迎邮件失败不影响登录流程，只记录日志
            logger.warning(f"OAuth 欢迎邮件发送失败：{e}")
