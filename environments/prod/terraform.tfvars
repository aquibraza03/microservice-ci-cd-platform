# =============================================================================
# Terraform Variables — PRODUCTION Environment
# =============================================================================
# Static values are set here. Dynamic values are injected by CI/CD via
# TF_VAR_* environment variables (Terraform picks them up automatically).
# Do NOT reference TF_VAR_* in this file — it would create literal strings.
# =============================================================================

# ----- Core Platform Identity -----
environment = "prod"
env_tier    = "production"

# ----- Multi-Cloud Contract -----
# cloud is injected by CI/CD via TF_VAR_cloud
# primary_region, secondary_region injected by CI/CD

# ----- Networking -----
enable_nat_gateway = true
single_nat_gateway = false
# vpc_cidr, subnet CIDRs injected by CI/CD

# ----- Compute / Capacity -----
node_count    = 3
node_min_size = 3
node_max_size = 6
# instance_type injected by CI/CD

# ----- Scaling Profile -----
# scaling_profile injected by CI/CD

# ----- Kubernetes Defaults -----
default_replicas          = 3
enable_cluster_autoscaler = true
# namespace, cluster_name injected by CI/CD

# ----- ECS Compatibility -----
ecs_desired_count = 3
ecs_cpu           = 512
ecs_memory        = 1024
# ecs_cluster_name injected by CI/CD

# ----- Registry / Images -----
image_retention_days = 90
# registry_provider, image_tag_strategy injected by CI/CD

# ----- Security Controls -----
enable_encryption     = true
enable_private_access = true
enable_public_access  = false
enable_waf            = true

# ----- Observability -----
enable_monitoring = true
enable_logging    = true
enable_tracing    = true
enable_alerting   = true

# ----- Reliability / Cost -----
use_spot_instances   = false
spot_percentage      = 0
off_hours_scale_down = false

# ----- Backup / Compliance -----
backup_required = true
retention_days  = 90
audit_logging   = true

# ----- Platform Features -----
enable_gitops       = true
enable_preview_envs = false
enable_service_mesh = false

# ----- Governance -----
require_manual_approval = true
allow_auto_apply        = false
# change_window injected by CI/CD

# ----- Enterprise Tags -----
tags = {
  Environment = "prod"
  Tier        = "production"
  Platform    = "microservice-ci-cd-platform"
  Owner       = "platform-engineering"
  ManagedBy   = "terraform"
  CostCenter  = "engineering-prod"
  Compliance  = "soc2"
}
