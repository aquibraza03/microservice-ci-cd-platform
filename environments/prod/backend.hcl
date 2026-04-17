# ==========================================================
# Terraform Remote Backend Configuration - PRODUCTION
# File: environments/prod/backend.hcl
# STRICT NO HARDCODING / Enterprise Ready / Ready to Paste
# Purpose: Secure isolated production Terraform state
# ==========================================================

# ----------------------------------------------------------
# Remote State Storage (Required)
# Inject via CI/CD generated backend file or templating
# ----------------------------------------------------------
bucket = "${TF_BACKEND_BUCKET}"

# ----------------------------------------------------------
# Isolated Production State Path
# ----------------------------------------------------------
key = "${TF_BACKEND_KEY}"

# Example injected value:
# microservice-ci-cd-platform/prod/terraform.tfstate

# ----------------------------------------------------------
# Backend Region
# ----------------------------------------------------------
region = "${TF_BACKEND_REGION}"

# ----------------------------------------------------------
# State Locking Table
# Shared enterprise lock table recommended
# ----------------------------------------------------------
dynamodb_table = "${TF_BACKEND_LOCK_TABLE}"

# ----------------------------------------------------------
# Encryption
# Prod should use managed KMS key
# ----------------------------------------------------------
encrypt    = true
kms_key_id = "${TF_BACKEND_KMS_KEY_ID}"

# ----------------------------------------------------------
# Private Access
# ----------------------------------------------------------
acl = "private"

# ----------------------------------------------------------
# Workspace Compatibility
# ----------------------------------------------------------
workspace_key_prefix = "${TF_WORKSPACE_PREFIX}"

# ----------------------------------------------------------
# Optional Dedicated Prod Account Role
# ----------------------------------------------------------
role_arn     = "${TF_BACKEND_ROLE_ARN}"
session_name = "${TF_BACKEND_SESSION_NAME}"
