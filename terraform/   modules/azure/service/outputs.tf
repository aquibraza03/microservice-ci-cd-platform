# -----------------------------
# Core Service Outputs
# -----------------------------
output "service_name" {
  description = "Azure Container App name"
  value       = azurerm_container_app.this.name
}

output "service_id" {
  description = "Azure Container App resource ID"
  value       = azurerm_container_app.this.id
}

output "service_fqdn" {
  description = "Fully qualified domain name of the service"
  value       = try(azurerm_container_app.this.latest_revision_fqdn, null)
}

output "service_url" {
  description = "HTTPS URL for the service"
  value       = try(
    azurerm_container_app.this.latest_revision_fqdn != null
      ? "https://${azurerm_container_app.this.latest_revision_fqdn}"
      : null,
    null
  )
}

# -----------------------------
# Revision / Deployment Info
# -----------------------------
output "latest_revision_name" {
  description = "Latest deployed revision"
  value       = try(azurerm_container_app.this.latest_revision_name, null)
}

output "revision_mode" {
  description = "Revision mode"
  value       = azurerm_container_app.this.revision_mode
}

# -----------------------------
# Runtime Configuration
# -----------------------------
output "container_image" {
  description = "Container image deployed"
  value       = var.image
}

output "container_port" {
  description = "Container port"
  value       = var.container_port
}

output "cpu" {
  description = "Allocated CPU"
  value       = var.cpu
}

output "memory" {
  description = "Allocated memory (Gi)"
  value       = var.memory
}

# -----------------------------
# Scaling
# -----------------------------
output "min_replicas" {
  description = "Minimum replica count"
  value       = var.min_count
}

output "max_replicas" {
  description = "Maximum replica count"
  value       = var.max_count
}

# -----------------------------
# Access / Exposure
# -----------------------------
output "allow_public_access" {
  description = "Whether public ingress is enabled"
  value       = var.allow_public_access
}

# -----------------------------
# Platform Context
# -----------------------------
output "resource_group_name" {
  description = "Azure resource group"
  value       = var.resource_group_name
}

output "container_app_environment_id" {
  description = "Container App Environment ID"
  value       = var.container_app_environment_id
}

# -----------------------------
# Identity
# -----------------------------
output "principal_id" {
  description = "Managed identity principal ID"
  value       = try(azurerm_container_app.this.identity[0].principal_id, null)
}

output "tenant_id" {
  description = "Managed identity tenant ID"
  value       = try(azurerm_container_app.this.identity[0].tenant_id, null)
}

# -----------------------------
# Metadata
# -----------------------------
output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "project" {
  description = "Project name"
  value       = var.project
}

output "tags" {
  description = "Applied tags"
  value       = var.tags
}
