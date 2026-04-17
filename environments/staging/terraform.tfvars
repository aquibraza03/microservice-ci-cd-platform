# ==========================================================
# Terraform Variables - STAGING Environment
# File: environments/staging/terraform.tfvars
# Enterprise Ready / Contract-Aligned / Ready to Paste
# Purpose: Pre-production environment using canonical variable names
# ==========================================================

# ----------------------------------------------------------
# Core Platform Identity
# Must match variables.tf and platform modules
# ----------------------------------------------------------
project       = "microservice-ci-cd-platform"
environment   = "staging"
env_tier      = "preprod"
platform_name = "microservice-ci-cd-platform"
org_name      = "your-org"

# ----------------------------------------------------------
# Multi-Cloud Contract
# IMPORTANT: use cloud (not cloud_provider)
# Expected by platform/service modules
# Options: aws | gcp | azure
# ----------------------------------------------------------
cloud            = "aws"
primary_region   = "ap-south-1"
secondary_region = "ap-southeast-1"

# ----------------------------------------------------------
# Networking
# Separate CIDR from dev/prod
# ----------------------------------------------------------
vpc_cidr             = "10.20.0.0/16"
public_subnet_cidrs  = ["10.20.1.0/24", "10.20.2.0/24"]
private_subnet_cidrs = ["10.20.11.0/24", "10.20.12.0/24"]

enable_nat_gateway = true
single_nat_gateway = false

# ----------------------------------------------------------
# Deployment Target
# Options: eks | ecs | aks | gke | k8s
# ----------------------------------------------------------
deploy_target = "eks"
cluster_name  = "platform-staging"

# ----------------------------------------------------------
# Compute Capacity
# Staging should mimic prod behavior
# ----------------------------------------------------------
node_count    = 3
node_min_size = 2
node_max_size = 5
instance_type = "t3.large"

# ----------------------------------------------------------
# Scaling Profile
# Options: startup | growth | enterprise
# ----------------------------------------------------------
scaling_profile = "growth"

# ----------------------------------------------------------
# Kubernetes Defaults
# ----------------------------------------------------------
namespace                 = "platform-staging"
default_replicas          = 2
enable_cluster_autoscaler = true

# ----------------------------------------------------------
# ECS Compatibility
# Used if deploy_target switched to ecs
# ----------------------------------------------------------
ecs_cluster_name = "platform-staging-ecs"
ecs_desired_count = 2
ecs_cpu           = 512
ecs_memory        = 1024

# ----------------------------------------------------------
# Registry / Images
# Use immutable tags from CI/CD
# ----------------------------------------------------------
registry_provider    = "ecr"
image_tag_strategy   = "git-sha"
image_retention_days = 30

# ----------------------------------------------------------
# Security Controls
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
# Reliability / Cost Balance
# Mixed capacity recommended
# ----------------------------------------------------------
use_spot_instances   = true
spot_percentage      = 50
off_hours_scale_down = false

# ----------------------------------------------------------
# Backup / Compliance
# ----------------------------------------------------------
backup_required = true
retention_days  = 30
audit_logging   = true

# ----------------------------------------------------------
# Platform Features
# ----------------------------------------------------------
enable_gitops       = false
enable_preview_envs = false
enable_service_mesh = false

# ----------------------------------------------------------
# Change Governance
# ----------------------------------------------------------
require_manual_approval = true
allow_auto_apply        = false
change_window           = "business-hours"

# ----------------------------------------------------------
# Enterprise Tags
# ----------------------------------------------------------
tags = {
  Environment = "staging"
  Tier        = "preprod"
  Platform    = "microservice-ci-cd-platform"
  Owner       = "platform-engineering"
  ManagedBy   = "terraform"
  CostCenter  = "engineering-preprod"
  Compliance  = "internal"
}
