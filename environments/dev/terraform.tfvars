# ==========================================================
# environments/dev/terraform.tfvars
# Values Only
# ==========================================================

project     = "microservice-ci-cd-platform"
environment = "dev"
profile     = "startup"

# Multi-cloud
cloud = "aws"

# AWS
aws_cluster_arn         = "arn:aws:eks:ap-south-1:123456789012:cluster/platform-dev"
aws_execution_role_arn  = "arn:aws:iam::123456789012:role/ecsTaskExecutionRole"

# GCP
gcp_project_id = "your-gcp-project-dev"
gcp_region     = "asia-south1"
gcp_service_account_email = "platform-sa@your-gcp-project-dev.iam.gserviceaccount.com"

# Azure
azure_resource_group_name = "rg-platform-dev"
azure_container_app_environment_id = "your-azure-cae-id"

# Network
vpc_cidr             = "10.10.0.0/16"
public_subnet_cidrs  = ["10.10.1.0/24", "10.10.2.0/24"]
private_subnet_cidrs = ["10.10.11.0/24", "10.10.12.0/24"]

enable_nat_gateway = true
single_nat_gateway = true

# Cluster
deploy_target = "eks"
cluster_name  = "platform-dev"
node_count    = 2
instance_type = "t3.medium"

namespace = "platform-dev"

# Platform
enable_monitoring     = true
enable_logging        = true
enable_encryption     = true
enable_private_access = true

use_spot_instances   = true
off_hours_scale_down = true

image_tag = "latest"

tags = {
  Environment = "dev"
  Tier        = "nonprod"
  Platform    = "microservice-ci-cd-platform"
  Owner       = "platform-engineering"
  ManagedBy   = "terraform"
  CostCenter  = "engineering-dev"
}
