package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func captureStdout(fn func()) string {
	old := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w
	fn()
	w.Close()
	var buf bytes.Buffer
	io.Copy(&buf, r)
	os.Stdout = old
	return buf.String()
}

func TestGetEnv_ReturnsValue(t *testing.T) {
	os.Setenv("TEST_KEY", "hello")
	defer os.Unsetenv("TEST_KEY")
	got := getEnv("TEST_KEY", "fallback")
	if got != "hello" {
		t.Errorf("expected 'hello', got '%s'", got)
	}
}

func TestGetEnv_ReturnsFallback(t *testing.T) {
	os.Unsetenv("MISSING_KEY")
	got := getEnv("MISSING_KEY", "fallback")
	if got != "fallback" {
		t.Errorf("expected 'fallback', got '%s'", got)
	}
}

func TestGetEnvAsInt_ReturnsInt(t *testing.T) {
	os.Setenv("INT_KEY", "42")
	defer os.Unsetenv("INT_KEY")
	got := getEnvAsInt("INT_KEY", 1)
	if got != 42 {
		t.Errorf("expected 42, got %d", got)
	}
}

func TestGetEnvAsInt_ReturnsFallback(t *testing.T) {
	os.Setenv("BAD_INT", "notanumber")
	defer os.Unsetenv("BAD_INT")
	got := getEnvAsInt("BAD_INT", 99)
	if got != 99 {
		t.Errorf("expected 99, got %d", got)
	}
}

func TestGetEnvAsInt_ReturnsFallbackWhenEmpty(t *testing.T) {
	os.Unsetenv("EMPTY_INT")
	got := getEnvAsInt("EMPTY_INT", 77)
	if got != 77 {
		t.Errorf("expected 77, got %d", got)
	}
}

func TestLogJSON_OutputsValidJSON(t *testing.T) {
	out := captureStdout(func() {
		logJSON("info", "test message", nil)
	})
	out = strings.TrimSpace(out)
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(out), &payload); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if payload["level"] != "info" {
		t.Errorf("expected level 'info', got '%v'", payload["level"])
	}
	if payload["message"] != "test message" {
		t.Errorf("expected message 'test message', got '%v'", payload["message"])
	}
	if _, ok := payload["timestamp"]; !ok {
		t.Error("expected timestamp field")
	}
}

func TestLogJSON_IncludesExtraFields(t *testing.T) {
	extra := map[string]interface{}{
		"user_id": 123,
		"action":  "login",
	}
	out := captureStdout(func() {
		logJSON("warn", "with extra", extra)
	})
	out = strings.TrimSpace(out)
	var payload map[string]interface{}
	json.Unmarshal([]byte(out), &payload)
	if payload["user_id"] != float64(123) {
		t.Errorf("expected user_id 123, got %v", payload["user_id"])
	}
	if payload["action"] != "login" {
		t.Errorf("expected action 'login', got %v", payload["action"])
	}
}

func TestHandler_HealthPath(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)
	resp := rec.Result()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var payload map[string]string
	json.Unmarshal(body, &payload)
	if payload["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%s'", payload["status"])
	}
}

func TestHandler_ReadyPath(t *testing.T) {
	req := httptest.NewRequest("GET", "/ready", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)
	resp := rec.Result()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var payload map[string]interface{}
	json.Unmarshal(body, &payload)
	if payload["status"] != "ready" {
		t.Errorf("expected status 'ready', got '%s'", payload["status"])
	}
	if _, ok := payload["uptime"]; !ok {
		t.Error("expected uptime field")
	}
}

func TestHandler_RootPath(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)
	resp := rec.Result()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	var payload map[string]string
	json.Unmarshal(body, &payload)
	if payload["service"] == "" {
		t.Error("expected service name")
	}
	if payload["status"] != "running" {
		t.Errorf("expected status 'running', got '%s'", payload["status"])
	}
}

func TestHandler_DefaultPath(t *testing.T) {
	req := httptest.NewRequest("GET", "/unknown", nil)
	rec := httptest.NewRecorder()
	handler(rec, req)
	resp := rec.Result()
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
	var payload map[string]string
	json.Unmarshal(body, &payload)
	if payload["error"] != "Not Found" {
		t.Errorf("expected error 'Not Found', got '%s'", payload["error"])
	}
}

func TestRespond_SetsContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	respond(rec, 200, map[string]string{"key": "value"})
	resp := rec.Result()
	resp.Body.Close()
	ct := resp.Header.Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected 'application/json', got '%s'", ct)
	}
}

func TestRespond_WritesStatusCode(t *testing.T) {
	rec := httptest.NewRecorder()
	respond(rec, 201, map[string]string{"key": "value"})
	resp := rec.Result()
	resp.Body.Close()
	if resp.StatusCode != 201 {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

func TestWithLogging_SetsRequestID(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("X-Request-ID", "my-req-123")
	rec := httptest.NewRecorder()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})
	withLogging(handler).ServeHTTP(rec, req)
	resp := rec.Result()
	resp.Body.Close()
	rid := resp.Header.Get("X-Request-ID")
	if rid != "my-req-123" {
		t.Errorf("expected 'my-req-123', got '%s'", rid)
	}
}

func TestWithLogging_GeneratesRequestID(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})
	withLogging(handler).ServeHTTP(rec, req)
	resp := rec.Result()
	resp.Body.Close()
	rid := resp.Header.Get("X-Request-ID")
	if rid == "" {
		t.Error("expected a generated request ID")
	}
}

func TestWithLogging_LogsRequest(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	out := captureStdout(func() {
		withLogging(inner).ServeHTTP(rec, req)
	})
	out = strings.TrimSpace(out)

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(out), &payload); err != nil {
		t.Fatalf("invalid JSON log output: %v", err)
	}
	if payload["path"] != "/health" {
		t.Errorf("expected path '/health', got '%v'", payload["path"])
	}
	if payload["method"] != "GET" {
		t.Errorf("expected method 'GET', got '%v'", payload["method"])
	}
}
