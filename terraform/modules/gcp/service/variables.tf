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
# GCP Config
# -----------------------------
variable "project_id" {
  description = "GCP project ID"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must follow GCP naming rules."
  }
}

variable "region" {
  description = "GCP region"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.region))
    error_message = "Region must be valid format."
  }
}

variable "service_account_email" {
  description = "Service account email"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]*@[a-z0-9-]+\\.iam\\.gserviceaccount\\.com$", var.service_account_email))
    error_message = "Must be a valid GCP service account email."
  }
}

# -----------------------------
# Compute (Cloud Run safe values)
# -----------------------------
variable "cpu" {
  description = "CPU cores"
  type        = number

  validation {
    condition     = contains([0.5, 1, 2, 4, 6, 8], var.cpu)
    error_message = "CPU must be one of: 0.5, 1, 2, 4, 6, 8."
  }
}

variable "memory" {
  description = "Memory in MiB"
  type        = number

  validation {
    condition     = var.memory >= 512 && var.memory <= 32768
    error_message = "Memory must be between 512 and 32768 MiB."
  }
}

# -----------------------------
# Concurrency & Timeout (IMPORTANT)
# -----------------------------
variable "max_instance_request_concurrency" {
  description = "Max requests per container"
  type        = number
  default     = 80

  validation {
    condition     = var.max_instance_request_concurrency >= 1 && var.max_instance_request_concurrency <= 1000
    error_message = "Concurrency must be between 1 and 1000."
  }
}

variable "timeout_seconds" {
  description = "Request timeout"
  type        = number
  default     = 300

  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 3600
    error_message = "Timeout must be between 1 and 3600 seconds."
  }
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 8080

  validation {
    condition     = var.container_port >= 1 && var.container_port <= 65535
    error_message = "Port must be 1-65535."
  }
}

# -----------------------------
# Scaling
# -----------------------------
variable "min_count" {
  description = "Minimum instances"
  type        = number
  default     = 0

  validation {
    condition     = var.min_count >= 0 && var.min_count <= 1000
    error_message = "min_count must be 0-1000."
  }
}

variable "max_count" {
  description = "Maximum instances"
  type        = number
  default     = 10

  validation {
    condition     = var.max_count >= var.min_count && var.max_count <= 1000
    error_message = "max_count must be >= min_count and <= 1000."
  }
}

# -----------------------------
# Access Control
# -----------------------------
variable "allow_unauthenticated" {
  description = "Allow public access"
  type        = bool
  default     = false
}

# -----------------------------
# Health Check
# -----------------------------
variable "health_check" {
  description = "Health check configuration"
  type = object({
    path         = string
    port         = number
    start_period = number
    timeout      = number
    interval     = number
    retries      = number
  })
  default = null

  validation {
    condition = var.health_check == null || (
      var.health_check.port >= 1 &&
      var.health_check.port <= 65535 &&
      var.health_check.start_period >= 0 &&
      var.health_check.timeout >= 1 &&
      var.health_check.interval >= 1 &&
      var.health_check.retries >= 1
    )
    error_message = "Health check values must be valid."
  }
}
