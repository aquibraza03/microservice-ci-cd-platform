# =============================================================================
# Remote State Backend — Production (S3 + DynamoDB)
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "microservice-ci-cd-platform-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
