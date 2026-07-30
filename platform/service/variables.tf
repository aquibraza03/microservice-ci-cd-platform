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
  description = "Health check configuration"
  type = object({
    path                  = optional(string, "/health")
    port                  = optional(number, 8080)
    interval              = optional(number, 30)
    timeout               = optional(number, 5)
    retries               = optional(number, 3)
    start_period          = optional(number, 10)
    command               = optional(list(string), null)
    initial_delay_seconds = optional(number, 10)
  })
  default = null
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
  description = "ECS cluster ARN (required when cloud = aws)"
  type        = string
  default     = null
}

variable "aws_execution_role_arn" {
  description = "ECS task execution role ARN (required when cloud = aws)"
  type        = string
  default     = null
}

variable "networking" {
  description = "Networking configuration for environment"
  type = object({
    subnets            = optional(list(string), [])
    security_group_ids = optional(list(string), [])
    vpc_id             = optional(string, null)
  })
  default = {}
}

variable "load_balancer" {
  description = "Load balancer configuration"
  type = object({
    target_group_arn = string
    container_port   = number
    dns_name         = optional(string, null)
  })
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
  description = "GCP project ID (required when cloud = gcp)"
  type        = string
  default     = null
}

variable "gcp_region" {
  description = "GCP region (required when cloud = gcp)"
  type        = string
  default     = null
}

variable "gcp_service_account_email" {
  description = "GCP service account email (required when cloud = gcp)"
  type        = string
  default     = null
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
  description = "Azure resource group name (required when cloud = azure)"
  type        = string
  default     = null
}

variable "azure_container_app_environment_id" {
  description = "Azure Container App Environment resource ID (required when cloud = azure)"
  type        = string
  default     = null
}
