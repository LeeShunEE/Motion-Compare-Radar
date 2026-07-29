"""clients/render_worker_client.py 单元测试（httpx 走 MockTransport，无真实出栈）。"""

import httpx
import pytest
from pydantic import SecretStr

from app.clients import render_worker_client as rwc
from app.clients.render_worker_client import RenderWorkerClient, WorkerRenderRequest
from app.core.exceptions import RenderFailedError


def _patch_transport(mocker, handler) -> None:
    transport = httpx.MockTransport(handler)
    real_cls = httpx.AsyncClient
    mocker.patch.object(
        rwc.httpx,
        "AsyncClient",
        side_effect=lambda **kwargs: real_cls(transport=transport, **kwargs),
    )


def _request() -> WorkerRenderRequest:
    return WorkerRenderRequest(
        task_id=7,
        mode="single",
        codec="h264",
        output_path="/out/x.mp4",
        input_props={"characterName": "Hero"},
    )


def _client(
    base_url: str = "http://worker:3100/", timeout: int = 10
) -> RenderWorkerClient:
    return RenderWorkerClient(base_url, timeout, SecretStr("worker-secret"))


class TestRender:
    async def test_success(self, mocker):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/render"
            assert request.method == "POST"
            assert request.headers["Authorization"] == "Bearer worker-secret"
            return httpx.Response(
                200, json={"outputPath": "/out/x.mp4", "durationMs": 1234, "totalFrames": 180}
            )

        _patch_transport(mocker, handler)
        client = _client()
        result = await client.render(_request())
        assert result.output_path == "/out/x.mp4"
        assert result.duration_ms == 1234
        assert result.total_frames == 180

    async def test_success_missing_total_frames_defaults_zero(self, mocker):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, json={"outputPath": "/out/x.mp4", "durationMs": 500}
            )

        _patch_transport(mocker, handler)
        client = RenderWorkerClient("http://worker:3100/", 10)
        result = await client.render(_request())
        assert result.total_frames == 0

    async def test_payload_includes_task_id(self, mocker):
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json

            captured.update(json.loads(request.content))
            return httpx.Response(
                200, json={"outputPath": "/out/x.mp4", "durationMs": 1, "totalFrames": 60}
            )

        _patch_transport(mocker, handler)
        client = RenderWorkerClient("http://worker:3100", 10)
        await client.render(_request())
        assert captured["taskId"] == 7

    async def test_non_2xx_raises(self, mocker):
        _patch_transport(mocker, lambda r: httpx.Response(500, text="boom"))
        client = RenderWorkerClient("http://worker:3100", 10)
        with pytest.raises(RenderFailedError):
            await client.render(_request())

    async def test_network_error_raises(self, mocker):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        _patch_transport(mocker, handler)
        client = RenderWorkerClient("http://worker:3100", 10)
        with pytest.raises(RenderFailedError):
            await client.render(_request())


class TestHealth:
    async def test_ok_response_is_healthy(self, mocker):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/health"
            return httpx.Response(200, json={"status": "ok"})

        _patch_transport(mocker, handler)
        assert await RenderWorkerClient("http://worker:3100", 10).health() is True

    async def test_error_response_is_degraded(self, mocker):
        _patch_transport(mocker, lambda request: httpx.Response(503))
        assert await RenderWorkerClient("http://worker:3100", 10).health() is False

    async def test_network_error_is_degraded(self, mocker):
        def unavailable(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("unavailable")

        _patch_transport(mocker, unavailable)
        assert await RenderWorkerClient("http://worker:3100", 10).health() is False


class TestCancel:
    async def test_active_render_is_canceled(self, mocker):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "DELETE"
            assert request.url.path == "/render/42"
            assert request.headers["Authorization"] == "Bearer worker-secret"
            return httpx.Response(202)

        _patch_transport(mocker, handler)
        assert await _client("http://worker:3100").cancel(42) is True

    async def test_missing_render_returns_false(self, mocker):
        _patch_transport(mocker, lambda request: httpx.Response(404))
        assert await RenderWorkerClient("http://worker:3100", 10).cancel(42) is False
