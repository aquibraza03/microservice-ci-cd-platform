locals {
  name = join("-", compact([
    var.project,
    var.environment,
    var.service_name
  ]))
}

# -----------------------------
# Cloud Run v2 Service
# -----------------------------
resource "google_cloud_run_v2_service" "this" {
  name     = local.name
  location = var.region
  project  = var.project_id

  template {
    service_account = var.service_account_email

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = "${var.cpu}"
          memory = "${var.memory}Mi"
        }
      }

      # -----------------------------
      # Optional Health Check
      # -----------------------------
      dynamic "startup_probe" {
        for_each = var.health_check == null ? [] : [var.health_check]

        content {
          http_get {
            path = startup_probe.value.path
            port = startup_probe.value.port
          }

          initial_delay_seconds = startup_probe.value.start_period
          timeout_seconds       = startup_probe.value.timeout
          period_seconds        = startup_probe.value.interval
          failure_threshold     = startup_probe.value.retries
        }
      }
    }

    scaling {
      min_instance_count = var.min_count
      max_instance_count = var.max_count
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# -----------------------------
# IAM (Optional Public Access)
# -----------------------------
resource "google_cloud_run_v2_service_iam_member" "invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name

  role   = "roles/run.invoker"
  member = "allUsers"
}
