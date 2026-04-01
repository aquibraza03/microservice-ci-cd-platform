package main

import (
	"encoding/json"
	"fmt"
	"log"
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
// Helpers (NO HARDCODING)
// -------------------------------
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvAsInt(name string, fallback int) int {
	valueStr := getEnv(name, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return fallback
}

// -------------------------------
// Logging (structured)
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
// Handlers
// -------------------------------
func handler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	defer func() {
		duration := time.Since(start).Milliseconds()
		logJSON("info", "request", map[string]interface{}{
			"path":        r.URL.Path,
			"method":      r.Method,
			"duration_ms": duration,
		})
	}()

	if r.URL.Path == healthPath {
		respond(w, 200, map[string]string{
			"status":  "ok",
			"service": serviceName,
		})
		return
	}

	if r.URL.Path == readyPath {
		respond(w, 200, map[string]interface{}{
			"status": "ready",
			"uptime": time.Since(startTime).Seconds(),
		})
		return
	}

	if r.URL.Path == "/" {
		respond(w, 200, map[string]string{
			"service": serviceName,
			"version": serviceVersion,
			"status":  "running",
		})
		return
	}

	respond(w, 404, map[string]string{
		"error": "Not Found",
	})
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

	server := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(handler),
	}

	logJSON("info", "starting", map[string]interface{}{
		"address": addr,
	})

	// Graceful shutdown
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop

		logJSON("info", "shutting down", nil)
		server.Close()
		os.Exit(0)
	}()

	if err := server.ListenAndServe(); err != nil {
		logJSON("error", "server error", map[string]interface{}{
			"error": err.Error(),
		})
	}
}
