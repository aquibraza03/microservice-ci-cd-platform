package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

var (
	serviceName    = getEnv("SERVICE_NAME", "service")
	serviceVersion = getEnv("SERVICE_VERSION", "1.0.0")

	servicePort = getEnvAsInt("SERVICE_PORT", 8080)
	serviceHost = getEnv("SERVICE_HOST", "0.0.0.0")

	healthPath = getEnv("SERVICE_HEALTH_PATH", "/health")
	readyPath  = getEnv("SERVICE_READY_PATH", "/ready")

	startTime = time.Now()
)

// -------------------------------
// Helpers
// -------------------------------
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvAsInt(name string, fallback int) int {
	if value, err := strconv.Atoi(os.Getenv(name)); err == nil {
		return value
	}
	return fallback
}

// -------------------------------
// Logging (structured JSON)
// -------------------------------
func logJSON(level, message string, extra map[string]interface{}) {
	payload := map[string]interface{}{
		"level":     level,
		"service":   serviceName,
		"message":   message,
		"timestamp": time.Now().UnixMilli(),
	}
	for k, v := range extra {
		payload[k] = v
	}

	data, _ := json.Marshal(payload)
	fmt.Println(string(data))
}

// -------------------------------
// Middleware (request logging)
// -------------------------------
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = fmt.Sprintf("%d", time.Now().UnixNano())
		}

		w.Header().Set("X-Request-ID", requestID)

		defer func() {
			duration := time.Since(start).Milliseconds()
			logJSON("info", "request", map[string]interface{}{
				"path":        r.URL.Path,
				"method":      r.Method,
				"duration_ms": duration,
				"request_id":  requestID,
			})
		}()

		next.ServeHTTP(w, r)
	})
}

// -------------------------------
// Handlers
// -------------------------------
func handler(w http.ResponseWriter, r *http.Request) {

	switch r.URL.Path {

	case healthPath:
		respond(w, 200, map[string]string{
			"status":  "ok",
			"service": serviceName,
		})

	case readyPath:
		respond(w, 200, map[string]interface{}{
			"status": "ready",
			"uptime": int(time.Since(startTime).Seconds()),
		})

	case "/":
		respond(w, 200, map[string]string{
			"service": serviceName,
			"version": serviceVersion,
			"status":  "running",
		})

	default:
		respond(w, 404, map[string]string{
			"error": "Not Found",
			"path":  r.URL.Path,
		})
	}
}

func respond(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(payload)
}

// -------------------------------
// Main
// -------------------------------
func main() {
	addr := fmt.Sprintf("%s:%d", serviceHost, servicePort)

	mux := http.NewServeMux()
	mux.HandleFunc("/", handler)

	server := &http.Server{
		Addr:         addr,
		Handler:      withLogging(mux),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	logJSON("info", "starting", map[string]interface{}{
		"address": addr,
	})

	// Graceful shutdown (proper)
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop

		logJSON("info", "shutting down", nil)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		server.Shutdown(ctx)
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logJSON("error", "server error", map[string]interface{}{
			"error": err.Error(),
		})
	}
}
