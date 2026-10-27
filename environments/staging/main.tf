# =============================================================================
# Root Module — Staging Environment
# =============================================================================

locals {
  service_name = "platform-api"

  computed_image = var.image != null ? var.image : "${var.project}/${local.service_name}:${var.image_tag}"

  effective_cpu    = var.cpu != null ? var.cpu : 512
  effective_memory = var.memory != null ? var.memory : 1024
}

module "platform_service" {
  source = "../../platform/service"

  project     = var.project
  environment = var.environment
  profile     = var.scaling_profile
  cloud       = var.cloud

  service_name = local.service_name
  image        = local.computed_image

  cpu    = local.effective_cpu
  memory = local.effective_memory

  desired_count = var.default_replicas
  min_count     = var.node_min_size
  max_count     = var.node_max_size

  container_port      = var.container_port
  allow_public_access = var.enable_public_access

  networking    = var.networking
  load_balancer = var.load_balancer
  health_check  = var.health_check

  enable_logging         = var.enable_logging
  log_retention_days     = var.image_retention_days
  cpu_target_utilization = 70

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
