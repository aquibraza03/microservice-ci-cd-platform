# ---------------------------------
# Input Normalization Layer
# ---------------------------------
locals {
  normalized_cpu    = var.cpu
  normalized_memory = var.memory

  common_tags = merge(
    {
      project     = var.project
      environment = var.environment
      service     = var.service_name
      managed_by  = "terraform"
      profile     = var.profile
    },
    var.tags
  )
}

# ---------------------------------
# AWS Service
# ---------------------------------
module "aws_service" {
  source = "../../modules/aws/service"
  count  = var.cloud == "aws" ? 1 : 0

  project      = var.project
  environment  = var.environment
  service_name = var.service_name
  image        = var.image

  cpu    = local.normalized_cpu
  memory = local.normalized_memory

  desired_count = var.desired_count
  min_count     = var.min_count
  max_count     = var.max_count

  networking     = var.networking
  load_balancer  = var.load_balancer
  cluster_arn    = var.aws_cluster_arn
  execution_role_arn = var.aws_execution_role_arn

  enable_logging         = var.enable_logging
  log_retention_days     = var.log_retention_days
  cpu_target_utilization = var.cpu_target_utilization
  health_check           = var.health_check

  tags = local.common_tags
}

# ---------------------------------
# GCP Service
# ---------------------------------
module "gcp_service" {
  source = "../../modules/gcp/service"
  count  = var.cloud == "gcp" ? 1 : 0

  project      = var.project
  environment  = var.environment
  service_name = var.service_name
  image        = var.image

  project_id             = var.gcp_project_id
  region                 = var.gcp_region
  service_account_email  = var.gcp_service_account_email

  cpu    = local.normalized_cpu
  memory = local.normalized_memory

  container_port                   = var.container_port
  min_count                        = var.min_count
  max_count                        = var.max_count
  max_instance_request_concurrency = var.max_instance_request_concurrency
  timeout_seconds                  = var.timeout_seconds

  allow_unauthenticated = var.allow_public_access
  health_check          = var.health_check

  tags = local.common_tags
}

# ---------------------------------
# Azure Service
# ---------------------------------
module "azure_service" {
  source = "../../modules/azure/service"
  count  = var.cloud == "azure" ? 1 : 0

  project      = var.project
  environment  = var.environment
  service_name = var.service_name
  image        = var.image

  resource_group_name          = var.azure_resource_group_name
  container_app_environment_id = var.azure_container_app_environment_id

  cpu    = local.normalized_cpu
  memory = local.normalized_memory

  container_port      = var.container_port
  min_count           = var.min_count
  max_count           = var.max_count
  allow_public_access = var.allow_public_access

  health_check = var.health_check

  tags = local.common_tags
}
