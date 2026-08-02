import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("failed_requests");
const latency = new Trend("request_duration_ms", true);

export const options = {
  scenarios: {
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 }
      ],
      gracefulRampDown: "30s"
    }
  },
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"],
    http_req_failed: ["rate<0.01"],
    failed_requests: ["rate<0.01"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";

const ENDPOINTS = [
  { path: "/health", name: "GET /health" },
  { path: "/ready", name: "GET /ready" },
  { path: "/login", name: "GET /login" },
  { path: "/env", name: "GET /env" },
  { path: "/", name: "GET /" }
];

export default function () {
  for (const endpoint of ENDPOINTS) {
    const res = http.get(`${BASE_URL}${endpoint.path}`, {
      tags: { endpoint: endpoint.name }
    });

    latency.add(res.timings.duration, { endpoint: endpoint.name });
    errorRate.add(res.status !== 200);

    check(res, {
      [`${endpoint.name} returns 200`]: (r) => r.status === 200
    });
  }

  sleep(0.1);
}
