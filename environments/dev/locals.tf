# =============================================================================
# Locals — Development Environment
# =============================================================================

locals {
  common_tags = merge(
    {
      Environment = var.environment
      Tier        = "nonprod"
      Platform    = var.project
      Owner       = "platform-engineering"
      ManagedBy   = "terraform"
      CostCenter  = "engineering-dev"
    },
    var.tags
  )
}
