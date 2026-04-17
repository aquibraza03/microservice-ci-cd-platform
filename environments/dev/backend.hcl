# ==========================================================
# Microservice CI/CD Platform - Terraform Backend
# File: environments/dev/backend.hcl
# Enterprise Ready / Ready to Paste
# ==========================================================

# ----------------------------------------------------------
# Remote State Storage
# ----------------------------------------------------------
bucket = "your-org-terraform-state-dev"

# Unique state path for platform + environment
key = "microservice-ci-cd-platform/dev/terraform.tfstate"

# Primary region for state bucket
region = "ap-south-1"

# ----------------------------------------------------------
# State Locking
# ----------------------------------------------------------
dynamodb_table = "your-org-terraform-locks"

# ----------------------------------------------------------
# Security
# ----------------------------------------------------------
encrypt = true

# ----------------------------------------------------------
# Operational Controls
# ----------------------------------------------------------
workspace_key_prefix = "env"

# ----------------------------------------------------------
# Optional Enterprise Notes
# ----------------------------------------------------------
# Recommended:
# - Enable bucket versioning
# - Block public access
# - Use SSE-KMS encryption
# - Enable access logs
# - Enable lifecycle retention policies
# - Restrict IAM to CI/CD roles only
