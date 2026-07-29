"""业务异常体系。

区分业务异常（领域可预期，映射 4xx）与系统异常（基础设施失败，映射 5xx），
接口层据 ``status_code`` 统一转换为 HTTP 响应（见 CLAUDE.md §12.6）。
"""


class BusinessError(Exception):
    """业务异常基类。"""

    status_code: int = 400
    code: str = "business_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AuthError(BusinessError):
    """凭证缺失、无效或过期。"""

    status_code = 401
    code = "auth_error"


class PermissionDeniedError(BusinessError):
    """已认证但无权访问目标资源。"""

    status_code = 403
    code = "permission_denied"


class AccountDisabledError(PermissionDeniedError):
    """账号已被管理员停用。"""

    code = "account_disabled"


class AdminRequiredError(PermissionDeniedError):
    """当前账号缺少管理员权限。"""

    code = "admin_required"


class UserExistsError(BusinessError):
    """用户名/邮箱已存在。"""

    status_code = 409
    code = "user_exists"


class UserNotFoundError(BusinessError):
    """用户不存在。"""

    status_code = 404
    code = "user_not_found"


class InvalidFileError(BusinessError):
    """上传文件非法（文件名、类型等）。"""

    status_code = 400
    code = "invalid_file"


class StoredFileNotFoundError(BusinessError):
    """用户存储中不存在该文件。"""

    status_code = 404
    code = "file_not_found"


class QuotaExceededError(BusinessError):
    """超出用户存储配额。"""

    status_code = 413
    code = "quota_exceeded"


class TaskNotFoundError(BusinessError):
    """渲染任务不存在或不属于当前用户。"""

    status_code = 404
    code = "task_not_found"


class RenderFailedError(BusinessError):
    """渲染 worker 执行失败。"""

    status_code = 502
    code = "render_failed"


class VerificationCodeError(BusinessError):
    """验证码相关错误基类。"""

    status_code = 400
    code = "verification_code_error"


class VerificationCodeInvalidError(VerificationCodeError):
    """验证码无效。"""

    code = "verification_code_invalid"


class VerificationCodeExpiredError(VerificationCodeError):
    """验证码已过期。"""

    code = "verification_code_expired"


class VerificationCodeCooldownError(VerificationCodeError):
    """验证码发送冷却时间未到。"""

    status_code = 429
    code = "verification_code_cooldown"


class OAuthError(BusinessError):
    """OAuth 流程错误。"""

    status_code = 400
    code = "oauth_error"


class OAuthAccountAlreadyBoundError(BusinessError):
    """OAuth 账户已被其他用户绑定。"""

    status_code = 409
    code = "oauth_account_already_bound"


class EmailServiceError(BusinessError):
    """邮件服务错误。"""

    status_code = 503
    code = "email_service_error"
