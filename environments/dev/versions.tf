# =============================================================================
# Terraform & Provider Version Constraints — Development
# =============================================================================

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0.0, < 6.0.0"
    }

    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0, < 6.0.0"
    }

    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0.0, < 4.0.0"
    }

    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.23.0, < 3.0.0"
    }

    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.12.0, < 3.0.0"
    }

    random = {
      source  = "hashicorp/random"
      version = ">= 3.6.0, < 4.0.0"
    }

    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0.0, < 5.0.0"
    }
  }
}
