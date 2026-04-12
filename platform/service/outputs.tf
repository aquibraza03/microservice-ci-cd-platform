# =====================================================
# Unified Service Identity
# =====================================================
output "service_name" {
  description = "Unified service name across all providers"

  value = coalesce(
    try(module.aws_service[0].service_name, null),
    try(module.gcp_service[0].service_name, null),
    try(module.azure_service[0].service_name, null)
  )
}

output "service_id" {
  description = "Unified provider resource ID"

  value = coalesce(
    try(module.aws_service[0].service_arn, null),
    try(module.gcp_service[0].service_id, null),
    try(module.azure_service[0].service_id, null)
  )
}

output "service_url" {
  description = "Unified service URL / endpoint"

  value = coalesce(
    try(module.aws_service[0].target_group_arn, null), # AWS may expose ALB/TG depending on design
    try(module.gcp_service[0].service_url, null),
    try(module.azure_service[0].service_url, null)
  )
}

# =====================================================
# Runtime / Deployment Info
# =====================================================
output "runtime_platform" {
  description = "Cloud provider hosting the service"
  value       = var.cloud
}

output "container_image" {
  description = "Container image deployed"
  value       = var.image
}

output "cpu" {
  description = "Normalized CPU used"
  value       = local.normalized_cpu
}

output "memory" {
  description = "Normalized memory used"
  value       = local.normalized_memory
}

output "profile" {
  description = "Applied platform profile"
  value       = var.profile
}

# =====================================================
# Scaling
# =====================================================
output "min_count" {
  description = "Minimum replicas/tasks"
  value       = var.min_count
}

output "max_count" {
  description = "Maximum replicas/tasks"
  value       = var.max_count
}

# =====================================================
# Metadata
# =====================================================
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
  value       = local.common_tags
}
