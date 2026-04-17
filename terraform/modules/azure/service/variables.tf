# -----------------------------
# Core Identity
# -----------------------------
variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev/staging/prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

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
# Azure Platform Config
# -----------------------------
variable "resource_group_name" {
  description = "Azure resource group name"
  type        = string

  validation {
    condition     = length(var.resource_group_name) > 0
    error_message = "resource_group_name cannot be empty."
  }
}

variable "container_app_environment_id" {
  description = "Azure Container App Environment ID"
  type        = string

  validation {
    condition     = can(regex("^/subscriptions/.*/resourceGroups/.*/providers/Microsoft\\.App/managedEnvironments/.*$", var.container_app_environment_id))
    error_message = "container_app_environment_id must be a valid Azure Container App Environment resource ID."
  }
}

# -----------------------------
# Compute
# -----------------------------
variable "cpu" {
  description = "CPU cores for Azure Container App"
  type        = number

  validation {
    condition     = contains([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], var.cpu)
    error_message = "CPU must be a valid Azure Container Apps CPU value."
  }
}

variable "memory" {
  description = "Memory in Gi"
  type        = number

  validation {
    condition     = var.memory > 0 && var.memory <= 16
    error_message = "Memory must be between 0 and 16 Gi."
  }
}

variable "container_port" {
  description = "Container listening port"
  type        = number
  default     = 8080

  validation {
    condition     = var.container_port >= 1 && var.container_port <= 65535
    error_message = "container_port must be between 1 and 65535."
  }
}

# -----------------------------
# Scaling
# -----------------------------
variable "min_count" {
  description = "Minimum replica count"
  type        = number
  default     = 0

  validation {
    condition     = var.min_count >= 0 && var.min_count <= 100
    error_message = "min_count must be between 0 and 100."
  }
}

variable "max_count" {
  description = "Maximum replica count"
  type        = number
  default     = 10

  validation {
    condition     = var.max_count >= var.min_count && var.max_count <= 100
    error_message = "max_count must be >= min_count and <= 100."
  }
}

# -----------------------------
# Networking / Exposure
# -----------------------------
variable "allow_public_access" {
  description = "Expose service publicly"
  type        = bool
  default     = false
}

# -----------------------------
# Health Check
# -----------------------------
variable "health_check" {
  description = "Startup probe / health check configuration"
  type = object({
    path                  = string
    port                  = number
    initial_delay_seconds = number
    interval              = number
    timeout               = number
    retries               = number
  })
  default = null

  validation {
    condition = var.health_check == null || (
      var.health_check.port >= 1 &&
      var.health_check.port <= 65535 &&
      var.health_check.initial_delay_seconds >= 0 &&
      var.health_check.interval >= 1 &&
      var.health_check.timeout >= 1 &&
      var.health_check.retries >= 1
    )
    error_message = "Invalid health_check configuration."
  }
}

# -----------------------------
# Metadata
# -----------------------------
variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for k, v in var.tags : length(k) > 0 && length(v) > 0])
    error_message = "Tags must have non-empty keys and values."
  }
}
