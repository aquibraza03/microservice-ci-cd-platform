# =============================================================================
# Locals — Staging Environment
# =============================================================================

locals {
  common_tags = merge(
    {
      Environment = var.environment
      Tier        = var.env_tier
      Platform    = var.platform_name
      Org         = var.org_name
      Owner       = "platform-engineering"
      ManagedBy   = "terraform"
      CostCenter  = "engineering-preprod"
      Compliance  = "internal"
    },
    var.tags
  )
}
