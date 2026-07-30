import json
import sys
import os
from unittest.mock import Mock
from io import BytesIO

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from app import log, Handler, SERVICE_NAME


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


def test_handler_class_has_expected_methods():
    assert hasattr(Handler, "do_GET")
    assert hasattr(Handler, "_send")
    assert hasattr(Handler, "log_message")
    assert callable(Handler.do_GET)
    assert callable(Handler._send)


def test_handler_config_defaults():
    assert SERVICE_NAME is not None
    assert len(SERVICE_NAME) > 0


def test_handler_send_writes_json_with_mock():
    handler = Handler.__new__(Handler)
    handler.request = Mock()
    handler.request.makefile.return_value = BytesIO(b"")
    handler.client_address = ("127.0.0.1", 0)
    handler.server = Mock()
    handler.command = "GET"
    handler.path = "/"
    handler.request_version = "HTTP/1.1"
    handler.requestline = "GET / HTTP/1.1"
    handler.headers = {}
    handler.close_connection = True
    handler.wfile = BytesIO()
    handler.rfile = BytesIO(b"")

    handler._send(200, {"status": "ok"})
    output = handler.wfile.getvalue().decode()
    assert '"status": "ok"' in output
    assert "Content-Type" in output
    assert "application/json" in output
