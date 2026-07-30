"""调用 Node 渲染 worker 的 HTTP 客户端（进程外基础设施）。

worker 负责真正的 Remotion ``bundle`` + ``renderMedia``；本客户端只做请求/解析，
并把失败翻译成业务异常 ``RenderFailedError``。worker 与后端共享同一文件系统，
故 ``output_path`` 是双方都可访问的绝对路径。
"""

from typing import Any

import httpx
from pydantic import BaseModel, SecretStr

from app.core.exceptions import RenderFailedError


class WorkerRenderRequest(BaseModel):
    """发给 worker 的渲染请求。"""

    task_id: int  # 供 worker 反向上报渲染进度（旁路回调）时定位任务
    mode: str  # "single" | "multi"
    codec: str  # "h264" | "gif"
    output_path: str
    # 前端传入的完整图表配置，结构动态、后端不解析其内部字段。
    input_props: dict[str, Any]


class WorkerRenderResult(BaseModel):
    """worker 渲染成功的返回。"""

    output_path: str
    duration_ms: int
    # 合成总帧数，供后端计算平均渲速（fps = total_frames / (duration_ms/1000)）。
    total_frames: int = 0


class RenderWorkerClient:
    """Node 渲染 worker 的 async 客户端。"""

    def __init__(
        self,
        base_url: str,
        timeout_seconds: int,
        token_secret_string: SecretStr = SecretStr("dev-only-render-callback-token"),
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._token_secret_string = token_secret_string

    def _authorization_headers(self) -> dict[str, str]:
        token = self._token_secret_string.get_secret_value()
        return {"Authorization": f"Bearer {token}"}

    async def render(self, request: WorkerRenderRequest) -> WorkerRenderResult:
        """提交一次渲染；非 2xx 或网络错误均抛 ``RenderFailedError``。"""
        payload = {
            "taskId": request.task_id,
            "mode": request.mode,
            "codec": request.codec,
            "outputPath": request.output_path,
            "inputProps": request.input_props,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base_url}/render",
                    json=payload,
                    headers=self._authorization_headers(),
                )
        except httpx.HTTPError as e:
            raise RenderFailedError(f"渲染 worker 不可达: {e}") from e

        if resp.status_code != httpx.codes.OK:
            detail = resp.text[:500]
            raise RenderFailedError(f"渲染 worker 返回 {resp.status_code}: {detail}")

        data = resp.json()
        return WorkerRenderResult(
            output_path=data["outputPath"],
            duration_ms=int(data.get("durationMs", 0)),
            total_frames=int(data.get("totalFrames", 0)),
        )

    async def health(self) -> bool:
        """短超时探测 worker；任何网络或非 2xx 结果均返回不可用。"""
        try:
            async with httpx.AsyncClient(timeout=min(self._timeout, 3)) as client:
                response = await client.get(f"{self._base_url}/health")
        except httpx.HTTPError:
            return False
        return response.status_code == httpx.codes.OK

    async def cancel(self, task_id: int) -> bool:
        """通知 worker 中止运行中的 Remotion 渲染；任务未运行时返回 ``False``。"""
        try:
            async with httpx.AsyncClient(timeout=min(self._timeout, 3)) as client:
                response = await client.delete(
                    f"{self._base_url}/render/{task_id}",
                    headers=self._authorization_headers(),
                )
        except httpx.HTTPError:
            return False
        return response.status_code == httpx.codes.ACCEPTED
