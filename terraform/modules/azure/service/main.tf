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

      # -----------------------------
      # Startup Probe
      # -----------------------------
      dynamic "liveness_probe" {
        for_each = var.health_check != null ? [var.health_check] : []

        content {
          transport = "HTTP"

          host                    = liveness_probe.value.host != null ? liveness_probe.value.host : "localhost"
          port                    = liveness_probe.value.port
          path                    = liveness_probe.value.path
          initial_delay           = liveness_probe.value.initial_delay_seconds
          interval_seconds        = liveness_probe.value.interval
          timeout                 = liveness_probe.value.timeout
          failure_count_threshold = liveness_probe.value.retries
        }
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
