import json
import sys
from typing import Any


class OutboundHttpError(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Make a JSON request in CPython or a Cloudflare Python Worker.

    Standard Python uses httpx. Workers use the runtime Fetch API because
    socket-based HTTP transports are unavailable inside Pyodide.
    """
    if sys.platform != "emscripten":
        import httpx

        try:
            response = httpx.request(method, url, headers=headers, json=body, timeout=timeout)
            response.raise_for_status()
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            raise OutboundHttpError(str(exc)) from exc

    from pyodide.ffi import run_sync

    async def worker_request() -> dict[str, Any]:
        from js import Object, fetch
        from pyodide.ffi import to_js

        request_headers = {"accept": "application/json", **(headers or {})}
        init: dict[str, Any] = {"method": method, "headers": request_headers}
        if body is not None:
            request_headers.setdefault("content-type", "application/json")
            init["body"] = json.dumps(body)
        options = to_js(init, dict_converter=Object.fromEntries)
        response = await fetch(url, options)
        text = await response.text()
        if not response.ok:
            raise OutboundHttpError(f"HTTP {response.status}: {text[:1000]}")
        return json.loads(text) if text else {}

    return run_sync(worker_request())
