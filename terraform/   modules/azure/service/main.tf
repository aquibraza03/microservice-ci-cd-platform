locals {
  name = join("-", compact([
    var.project,
    var.environment,
    var.service_name
  ]))
}

# -----------------------------
# Azure Container App
# -----------------------------
resource "azurerm_container_app" "this" {
  name                         = local.name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = var.container_app_environment_id

  revision_mode = "Single"

  template {
    min_replicas = var.min_count
    max_replicas = var.max_count

    container {
      name   = var.service_name
      image  = var.image
      cpu    = var.cpu
      memory = "${var.memory}Gi"
    }

    # -----------------------------
    # Optional Startup Probe
    # -----------------------------
    dynamic "startup_probe" {
      for_each = var.health_check != null ? [var.health_check] : []

      content {
        transport = "HTTP"

        http_get {
          path = startup_probe.value.path
          port = startup_probe.value.port
        }

        initial_delay_seconds = startup_probe.value.initial_delay_seconds
        interval_seconds      = startup_probe.value.interval
        timeout               = startup_probe.value.timeout
        failure_count_threshold = startup_probe.value.retries
      }
    }
  }

  # -----------------------------
  # Ingress
  # -----------------------------
  ingress {
    external_enabled = var.allow_public_access
    target_port      = var.container_port

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  # -----------------------------
  # Managed Identity
  # -----------------------------
  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}
