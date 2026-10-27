import json
import os
import socket
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from app import Handler, SERVICE_NAME, SERVICE_VERSION, log


@pytest.fixture()
def http_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


def get(base, path):
    with urllib.request.urlopen(base + path, timeout=5) as resp:
        return resp.status, json.loads(resp.read().decode())


def test_health_endpoint(http_server):
    status, payload = get(http_server, "/health")
    assert status == 200
    assert payload["status"] == "ok"
    assert payload["service"] == SERVICE_NAME


def test_ready_endpoint(http_server):
    status, payload = get(http_server, "/ready")
    assert status == 200
    assert payload["status"] == "ready"
    assert payload["uptime"] >= 0


def test_root_endpoint(http_server):
    status, payload = get(http_server, "/")
    assert status == 200
    assert payload["service"] == SERVICE_NAME
    assert payload["version"] == SERVICE_VERSION
    assert payload["status"] == "running"


def test_unknown_path_returns_404(http_server):
    with pytest.raises(urllib.error.HTTPError) as excinfo:
        get(http_server, "/nope")
    assert excinfo.value.code == 404
    payload = json.loads(excinfo.value.read().decode())
    assert payload["error"] == "Not Found"
    assert payload["path"] == "/nope"


def test_log_outputs_valid_json(capsys):
    log("info", "hello world")
    captured = capsys.readouterr()
    payload = json.loads(captured.out.strip())
    assert payload["level"] == "info"
    assert payload["message"] == "hello world"
    assert payload["service"] == SERVICE_NAME
    assert "timestamp" in payload


def test_log_includes_extra_fields(capsys):
    log("warn", "user action", {"user_id": 42, "action": "login"})
    captured = capsys.readouterr()
    payload = json.loads(captured.out.strip())
    assert payload["user_id"] == 42
    assert payload["action"] == "login"


def test_log_extra_none_does_not_cause_error(capsys):
    log("info", "no extra", None)
    captured = capsys.readouterr()
    payload = json.loads(captured.out.strip())
    assert payload["message"] == "no extra"


class FakeServer:
    def __init__(self):
        self.shutdown_called = False

    def serve_forever(self):
        pass

    def shutdown(self):
        self.shutdown_called = True


def test_run_server_starts_and_returns_zero(monkeypatch, capsys):
    import app

    fake = FakeServer()
    monkeypatch.setattr(app, "HTTPServer", lambda host, handler: fake)
    assert app.run_server() == 0
    assert fake.shutdown_called is False
    assert "starting on" in capsys.readouterr().out


def test_run_server_logs_and_returns_one_on_error(monkeypatch, capsys):
    import app

    class ExplodingServer(FakeServer):
        def serve_forever(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(app, "HTTPServer", lambda host, handler: ExplodingServer())
    assert app.run_server() == 1
    captured = capsys.readouterr().out
    assert '"level": "error"' in captured
    assert "boom" in captured


def test_shutdown_logs_and_exits(monkeypatch, capsys):
    import app

    exited = []

    def fake_exit(code):
        exited.append(code)

    fake = FakeServer()
    monkeypatch.setattr(app, "server", fake)
    monkeypatch.setattr(app.sys, "exit", fake_exit)
    app.shutdown("SIGTERM", None)
    assert fake.shutdown_called is True
    assert exited == [0]
    assert "shutting down" in capsys.readouterr().out
