# -----------------------------
# Core Platform Identity
# -----------------------------
variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "profile" {
  description = "Scaling profile name (micro/small/medium/large)"
  type        = string
  default     = null
}

variable "cloud" {
  description = "Target cloud provider"
  type        = string

  validation {
    condition     = contains(["aws", "gcp", "azure"], var.cloud)
    error_message = "Cloud must be aws, gcp, or azure."
  }
}

# -----------------------------
# Service Definition
# -----------------------------
variable "service_name" {
  description = "Service name"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*$", var.service_name))
    error_message = "Service name must be lowercase alphanumeric + hyphens."
  }
}

variable "image" {
  description = "Container image"
  type        = string
}

# -----------------------------
# Compute Override (Optional)
# Used if profile not found
# -----------------------------
variable "cpu" {
  description = "Manual CPU override if profile is not used"
  type        = number
  default     = null
}

variable "memory" {
  description = "Manual memory override if profile is not used"
  type        = number
  default     = null
}

# -----------------------------
# Scaling
# -----------------------------
variable "desired_count" {
  description = "DEPRECATED - use min_count/max_count where supported"
  type        = number
  default     = 1
}

variable "min_count" {
  description = "Minimum replicas/tasks"
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum replicas/tasks"
  type        = number
  default     = 2
}

# -----------------------------
# Networking / Exposure
# -----------------------------
variable "container_port" {
  description = "Application container port"
  type        = number
  default     = 8080
}

variable "allow_public_access" {
  description = "Expose service publicly"
  type        = bool
  default     = false
}

# -----------------------------
# Shared Optional Config
# -----------------------------
variable "health_check" {
  description = "Health check config"
  type        = any
  default     = null
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}

# =====================================================
# AWS Inputs
# =====================================================
variable "aws_cluster_arn" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "aws" || var.aws_cluster_arn != null
    error_message = "aws_cluster_arn required for cloud = aws"
  }
}

variable "aws_execution_role_arn" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "aws" || var.aws_execution_role_arn != null
    error_message = "aws_execution_role_arn required for cloud = aws"
  }
}

variable "networking" {
  type    = any
  default = null
}

variable "load_balancer" {
  type    = any
  default = null
}

variable "enable_logging" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "cpu_target_utilization" {
  type    = number
  default = 70
}

# =====================================================
# GCP Inputs
# =====================================================
variable "gcp_project_id" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "gcp" || var.gcp_project_id != null
    error_message = "gcp_project_id required for cloud = gcp"
  }
}

variable "gcp_region" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "gcp" || var.gcp_region != null
    error_message = "gcp_region required for cloud = gcp"
  }
}

variable "gcp_service_account_email" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "gcp" || var.gcp_service_account_email != null
    error_message = "gcp_service_account_email required for cloud = gcp"
  }
}

variable "max_instance_request_concurrency" {
  type    = number
  default = 80
}

variable "timeout_seconds" {
  type    = number
  default = 300
}

# =====================================================
# Azure Inputs
# =====================================================
variable "azure_resource_group_name" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "azure" || var.azure_resource_group_name != null
    error_message = "azure_resource_group_name required for cloud = azure"
  }
}

variable "azure_container_app_environment_id" {
  type    = string
  default = null

  validation {
    condition     = var.cloud != "azure" || var.azure_container_app_environment_id != null
    error_message = "azure_container_app_environment_id required for cloud = azure"
  }
}
