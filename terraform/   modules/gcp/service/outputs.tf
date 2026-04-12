# -----------------------------
# Core Service Outputs
# -----------------------------
output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.this.name
}

output "service_id" {
  description = "Cloud Run service ID"
  value       = google_cloud_run_v2_service.this.id
}

output "service_url" {
  description = "Public/internal service URL"
  value       = google_cloud_run_v2_service.this.uri
}

output "service_location" {
  description = "Deployment region"
  value       = google_cloud_run_v2_service.this.location
}

output "project_id" {
  description = "GCP project ID"
  value       = var.project_id
}

# -----------------------------
# Revision / Deployment Info
# -----------------------------
output "latest_ready_revision" {
  description = "Latest ready revision"
  value       = google_cloud_run_v2_service.this.latest_ready_revision
}

output "latest_created_revision" {
  description = "Latest created revision"
  value       = google_cloud_run_v2_service.this.latest_created_revision
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
  description = "Allocated memory"
  value       = var.memory
}

# -----------------------------
# Scaling
# -----------------------------
output "min_instances" {
  description = "Minimum instance count"
  value       = var.min_count
}

output "max_instances" {
  description = "Maximum instance count"
  value       = var.max_count
}

output "concurrency" {
  description = "Max requests per instance"
  value       = var.max_instance_request_concurrency
}

# -----------------------------
# Security / Access
# -----------------------------
output "allow_unauthenticated" {
  description = "Whether public access is enabled"
  value       = var.allow_unauthenticated
}

output "service_account_email" {
  description = "Runtime service account"
  value       = var.service_account_email
}

# -----------------------------
# Health Check
# -----------------------------
output "health_check" {
  description = "Health check configuration"
  value       = var.health_check
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
