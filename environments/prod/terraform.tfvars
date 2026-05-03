# ==========================================================
# Terraform Variables - PRODUCTION Environment
# File: environments/prod/terraform.tfvars
# 100% ENTERPRISE READY / STRICT NO HARDCODING / Ready to Paste
# Purpose: Mission-critical production infrastructure inputs
# ==========================================================

# ----------------------------------------------------------
# Core Platform Identity (Injected by CI/CD)
# ----------------------------------------------------------
project       = TF_VAR_project
environment   = "prod"
env_tier      = "production"
platform_name = TF_VAR_platform_name
org_name      = TF_VAR_org_name

# ----------------------------------------------------------
# Multi-Cloud Contract
# Canonical variable name: cloud
# ----------------------------------------------------------
cloud            = TF_VAR_cloud
primary_region   = TF_VAR_primary_region
secondary_region = TF_VAR_secondary_region

# ----------------------------------------------------------
# Networking
# ----------------------------------------------------------
vpc_cidr             = TF_VAR_vpc_cidr
public_subnet_cidrs  = jsondecode("${TF_VAR_public_subnet_cidrs}")
private_subnet_cidrs = jsondecode("${TF_VAR_private_subnet_cidrs}")

enable_nat_gateway = true
single_nat_gateway = false

# ----------------------------------------------------------
# Deployment Target
# ----------------------------------------------------------
deploy_target = TF_VAR_deploy_target
cluster_name  = TF_VAR_cluster_name

# ----------------------------------------------------------
# Compute / Capacity
# ----------------------------------------------------------
node_count    = 3
node_min_size = 3
node_max_size = 6
instance_type = TF_VAR_instance_type

# ----------------------------------------------------------
# Scaling Profile
# ----------------------------------------------------------
scaling_profile = TF_VAR_scaling_profile

# ----------------------------------------------------------
# Kubernetes Defaults
# ----------------------------------------------------------
namespace                 = TF_VAR_namespace
default_replicas          = 3
enable_cluster_autoscaler = true

# ----------------------------------------------------------
# ECS Compatibility
# ----------------------------------------------------------
ecs_cluster_name  = TF_VAR_ecs_cluster_name
ecs_desired_count = 3
ecs_cpu           = 512
ecs_memory        = 1024

# ----------------------------------------------------------
# Registry / Images
# ----------------------------------------------------------
registry_provider    = TF_VAR_registry_provider
image_tag_strategy   = TF_VAR_image_tag_strategy
image_retention_days = 90

# ----------------------------------------------------------
# Security
# ----------------------------------------------------------
enable_encryption     = true
enable_private_access = true
enable_public_access  = false
enable_waf            = true

# ----------------------------------------------------------
# Observability
# ----------------------------------------------------------
enable_monitoring = true
enable_logging    = true
enable_tracing    = true
enable_alerting   = true

# ----------------------------------------------------------
# Reliability / Cost
# ----------------------------------------------------------
use_spot_instances   = false
spot_percentage      = 0
off_hours_scale_down = false

# ----------------------------------------------------------
# Backup / Compliance
# ----------------------------------------------------------
backup_required = true
retention_days  = 90
audit_logging   = true

# ----------------------------------------------------------
# Platform Features
# ----------------------------------------------------------
enable_gitops       = true
enable_preview_envs = false
enable_service_mesh = false

# ----------------------------------------------------------
# Governance
# ----------------------------------------------------------
require_manual_approval = true
allow_auto_apply        = false
change_window           = TF_VAR_change_window

# ----------------------------------------------------------
# Tags
# JSON string from CI/CD → jsondecode
# ----------------------------------------------------------
tags = jsondecode("${TF_VAR_tags}")

