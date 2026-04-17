# ==========================================================
# Terraform Variables - PRODUCTION Environment
# File: environments/prod/terraform.tfvars
# 100% ENTERPRISE READY / STRICT NO HARDCODING / Ready to Paste
# Purpose: Mission-critical production infrastructure inputs
# ==========================================================

# ----------------------------------------------------------
# Core Platform Identity (Injected by CI/CD)
# ----------------------------------------------------------
project       = "${TF_VAR_project}"
environment   = "prod"
env_tier      = "production"
platform_name = "${TF_VAR_platform_name}"
org_name      = "${TF_VAR_org_name}"

# ----------------------------------------------------------
# Multi-Cloud Contract
# Canonical variable name: cloud
# ----------------------------------------------------------
cloud            = "${TF_VAR_cloud}"
primary_region   = "${TF_VAR_primary_region}"
secondary_region = "${TF_VAR_secondary_region}"

# ----------------------------------------------------------
# Networking
# ----------------------------------------------------------
vpc_cidr             = "${TF_VAR_vpc_cidr}"
public_subnet_cidrs  = jsondecode("${TF_VAR_public_subnet_cidrs}")
private_subnet_cidrs = jsondecode("${TF_VAR_private_subnet_cidrs}")

enable_nat_gateway   = ${TF_VAR_enable_nat_gateway}
single_nat_gateway   = ${TF_VAR_single_nat_gateway}

# ----------------------------------------------------------
# Deployment Target
# ----------------------------------------------------------
deploy_target = "${TF_VAR_deploy_target}"
cluster_name  = "${TF_VAR_cluster_name}"

# ----------------------------------------------------------
# Compute / Capacity
# ----------------------------------------------------------
node_count    = ${TF_VAR_node_count}
node_min_size = ${TF_VAR_node_min_size}
node_max_size = ${TF_VAR_node_max_size}
instance_type = "${TF_VAR_instance_type}"

# ----------------------------------------------------------
# Scaling Profile
# ----------------------------------------------------------
scaling_profile = "${TF_VAR_scaling_profile}"

# ----------------------------------------------------------
# Kubernetes Defaults
# ----------------------------------------------------------
namespace                 = "${TF_VAR_namespace}"
default_replicas          = ${TF_VAR_default_replicas}
enable_cluster_autoscaler = ${TF_VAR_enable_cluster_autoscaler}

# ----------------------------------------------------------
# ECS Compatibility
# ----------------------------------------------------------
ecs_cluster_name = "${TF_VAR_ecs_cluster_name}"
ecs_desired_count = ${TF_VAR_ecs_desired_count}
ecs_cpu           = ${TF_VAR_ecs_cpu}
ecs_memory        = ${TF_VAR_ecs_memory}

# ----------------------------------------------------------
# Registry / Images
# ----------------------------------------------------------
registry_provider    = "${TF_VAR_registry_provider}"
image_tag_strategy   = "${TF_VAR_image_tag_strategy}"
image_retention_days = ${TF_VAR_image_retention_days}

# ----------------------------------------------------------
# Security
# ----------------------------------------------------------
enable_encryption     = ${TF_VAR_enable_encryption}
enable_private_access = ${TF_VAR_enable_private_access}
enable_public_access  = ${TF_VAR_enable_public_access}
enable_waf            = ${TF_VAR_enable_waf}

# ----------------------------------------------------------
# Observability
# ----------------------------------------------------------
enable_monitoring = ${TF_VAR_enable_monitoring}
enable_logging    = ${TF_VAR_enable_logging}
enable_tracing    = ${TF_VAR_enable_tracing}
enable_alerting   = ${TF_VAR_enable_alerting}

# ----------------------------------------------------------
# Reliability / Cost
# ----------------------------------------------------------
use_spot_instances   = ${TF_VAR_use_spot_instances}
spot_percentage      = ${TF_VAR_spot_percentage}
off_hours_scale_down = ${TF_VAR_off_hours_scale_down}

# ----------------------------------------------------------
# Backup / Compliance
# ----------------------------------------------------------
backup_required = ${TF_VAR_backup_required}
retention_days  = ${TF_VAR_retention_days}
audit_logging   = ${TF_VAR_audit_logging}

# ----------------------------------------------------------
# Platform Features
# ----------------------------------------------------------
enable_gitops       = ${TF_VAR_enable_gitops}
enable_preview_envs = ${TF_VAR_enable_preview_envs}
enable_service_mesh = ${TF_VAR_enable_service_mesh}

# ----------------------------------------------------------
# Governance
# ----------------------------------------------------------
require_manual_approval = ${TF_VAR_require_manual_approval}
allow_auto_apply        = ${TF_VAR_allow_auto_apply}
change_window           = "${TF_VAR_change_window}"

# ----------------------------------------------------------
# Tags
# JSON string from CI/CD → jsondecode
# ----------------------------------------------------------
tags = jsondecode("${TF_VAR_tags}")
