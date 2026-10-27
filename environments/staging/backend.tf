# =============================================================================
# Remote State Backend — Staging
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "microservice-ci-cd-platform-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
