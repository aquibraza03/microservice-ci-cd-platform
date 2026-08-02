import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("failed_requests");

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "30s", target: 200 },
        { duration: "1m", target: 300 },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    failed_requests: ["rate<0.02"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  errorRate.add(res.status !== 200);

  check(res, {
    "GET /health returns 200 under load": (r) => r.status === 200
  });

  const ready = http.get(`${BASE_URL}/ready`);
  errorRate.add(ready.status !== 200);

  check(ready, {
    "GET /ready returns 200 under load": (r) => r.status === 200
  });
}
