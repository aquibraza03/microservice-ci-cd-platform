# ==========================================================
# Terraform Remote Backend Configuration - STAGING
# File: environments/staging/backend.hcl
# Enterprise Ready / Simplified / Ready to Paste
# Purpose: Shared backend with isolated staging state
# ==========================================================

# ----------------------------------------------------------
# Remote State Storage
# Shared bucket for all environments
# ----------------------------------------------------------
bucket = "your-org-terraform-state"

# ----------------------------------------------------------
# Isolated State Path for Staging
# Prevents overlap with dev/prod state
# ----------------------------------------------------------
key = "microservice-ci-cd-platform/staging/terraform.tfstate"

# ----------------------------------------------------------
# Backend Region
# Keep close to primary infra region
# ----------------------------------------------------------
region = "ap-south-1"

# ----------------------------------------------------------
# State Locking
# Shared lock table for all environments
# Safe because locks are per state key
# ----------------------------------------------------------
dynamodb_table = "your-org-terraform-locks"

# ----------------------------------------------------------
# Encryption
# Uses default server-side encryption
# Upgrade to KMS later if compliance requires
# ----------------------------------------------------------
encrypt = true

# ----------------------------------------------------------
# Private Access Only
# ----------------------------------------------------------
acl = "private"

# ----------------------------------------------------------
# Workspace Compatibility
# Future ready if using Terraform workspaces
# ----------------------------------------------------------
workspace_key_prefix = "env"

# ----------------------------------------------------------
# Optional Cross Account Role
# Uncomment if staging runs in separate AWS account
# ----------------------------------------------------------
# role_arn     = "arn:aws:iam::<account-id>:role/terraform-staging-role"
# session_name = "terraform-staging-session"
