# =============================================================================
# Outputs — Production Environment
# =============================================================================

output "service_name" {
  description = "Deployed service name"
  value       = module.platform_service.service_name
}

output "service_id" {
  description = "Service resource ID"
  value       = module.platform_service.service_id
}

output "service_url" {
  description = "Service endpoint URL"
  value       = module.platform_service.service_url
}

output "runtime_platform" {
  description = "Active cloud provider"
  value       = module.platform_service.runtime_platform
}

output "container_image" {
  description = "Deployed container image"
  value       = module.platform_service.container_image
}

output "cpu" {
  description = "Allocated CPU"
  value       = module.platform_service.cpu
}

output "memory" {
  description = "Allocated memory"
  value       = module.platform_service.memory
}

output "min_count" {
  description = "Minimum instances"
  value       = module.platform_service.min_count
}

output "max_count" {
  description = "Maximum instances"
  value       = module.platform_service.max_count
}

output "tags" {
  description = "Applied tags"
  value       = module.platform_service.tags
}

output "environment_metadata" {
  description = "Environment metadata"
  value = {
    environment      = var.environment
    tier             = var.env_tier
    cloud            = var.cloud
    primary_region   = var.primary_region
    secondary_region = var.secondary_region
    deploy_target    = var.deploy_target
    cluster_name     = var.cluster_name
  }
}
