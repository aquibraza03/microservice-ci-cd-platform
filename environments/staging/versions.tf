# =============================================================================
# Terraform & Provider Version Constraints — Staging
# =============================================================================

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 5.100.0"
    }

    google = {
      source  = "hashicorp/google"
      version = "= 5.45.2"
    }

    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 3.117.1"
    }

    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "= 2.38.0"
    }

    helm = {
      source  = "hashicorp/helm"
      version = "= 2.17.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "= 3.9.0"
    }

    tls = {
      source  = "hashicorp/tls"
      version = "= 4.3.0"
    }
  }
}
