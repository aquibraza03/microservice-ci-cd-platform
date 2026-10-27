# =============================================================================
# Root Module — Development Environment
# =============================================================================

locals {
  service_name = "platform-api"

  computed_image = var.image != null ? var.image : "${var.project}/${local.service_name}:${var.image_tag}"

  service_config = {
    cpu    = var.cpu
    memory = var.memory
  }

  effective_cpu    = var.cpu != null ? var.cpu : 256
  effective_memory = var.memory != null ? var.memory : 512
}

module "platform_service" {
  source = "../../platform/service"

  project     = var.project
  environment = var.environment
  profile     = var.profile
  cloud       = var.cloud

  service_name = local.service_name
  image        = local.computed_image

  cpu    = local.effective_cpu
  memory = local.effective_memory

  desired_count = 1
  min_count     = var.min_count
  max_count     = var.max_count

  container_port      = var.container_port
  allow_public_access = var.allow_public_access

  networking    = var.networking
  load_balancer = var.load_balancer
  health_check  = var.health_check

  enable_logging         = var.enable_logging
  log_retention_days     = var.log_retention_days
  cpu_target_utilization = var.cpu_target_utilization

  aws_cluster_arn        = var.aws_cluster_arn
  aws_execution_role_arn = var.aws_execution_role_arn

  gcp_project_id            = var.gcp_project_id
  gcp_region                = var.gcp_region
  gcp_service_account_email = var.gcp_service_account_email

  max_instance_request_concurrency = 80
  timeout_seconds                  = 300

  azure_resource_group_name          = var.azure_resource_group_name
  azure_container_app_environment_id = var.azure_container_app_environment_id

  tags = local.common_tags
}
