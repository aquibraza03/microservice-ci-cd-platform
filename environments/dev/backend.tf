# =============================================================================
# Remote State Backend — Development
# =============================================================================
# Dev uses local state by default for fast iteration.
# Switch to S3 for shared team development by uncommenting below.

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}

# Production-style S3 backend (uncomment for shared dev):
# terraform {
#   backend "s3" {
#     bucket         = "microservice-ci-cd-platform-terraform-state"
#     key            = "dev/terraform.tfstate"
#     region         = "ap-south-1"
#     encrypt        = true
#     dynamodb_table = "terraform-state-lock"
#   }
# }
