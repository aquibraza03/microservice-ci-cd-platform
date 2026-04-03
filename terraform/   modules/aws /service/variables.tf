# -----------------------------
# Core Service Identity
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
# Compute (STRICT Fargate pairing)
# -----------------------------
variable "cpu" {
  description = "Fargate CPU units"
  type        = number

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU must be valid Fargate value: 256, 512, 1024, 2048, 4096."
  }
}

variable "memory" {
  description = "Fargate memory (MiB)"
  type        = number

  validation {
    condition = (
      (var.cpu == 256 && contains([512, 1024, 2048], var.memory)) ||
      (var.cpu == 512 && contains([1024, 2048, 3072, 4096], var.memory)) ||
      (var.cpu == 1024 && contains([2048, 3072, 4096, 8192], var.memory)) ||
      (var.cpu == 2048 && contains([4096, 8192, 16384], var.memory)) ||
      (var.cpu == 4096 && contains([8192, 16384, 30720], var.memory))
    )
    error_message = "Invalid CPU-memory combination for AWS Fargate."
  }
}

# -----------------------------
# Scaling (SAFE)
# -----------------------------
variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 100
    error_message = "desired_count must be between 0 and 100."
  }
}

variable "min_count" {
  description = "Minimum autoscaling count"
  type        = number
  default     = 1

  validation {
    condition     = var.min_count >= 1 && var.min_count <= 100
    error_message = "min_count must be between 1 and 100."
  }
}

variable "max_count" {
  description = "Maximum autoscaling count"
  type        = number
  default     = 2

  validation {
    condition     = var.max_count >= var.min_count && var.max_count <= 100
    error_message = "max_count must be >= min_count and <= 100."
  }
}

# Cross-validation (important)
variable "scaling_sanity_check" {
  description = "Internal validation for scaling consistency"
  type        = bool
  default     = true

  validation {
    condition = (
      var.desired_count >= var.min_count &&
      var.desired_count <= var.max_count
    )
    error_message = "desired_count must be between min_count and max_count."
  }
}

# -----------------------------
# Networking (STRICT)
# -----------------------------
variable "networking" {
  description = "Networking configuration"
  type = object({
    subnets            = list(string)
    security_group_ids = optional(list(string), [])
  })

  validation {
    condition     = length(var.networking.subnets) > 0 && length(var.networking.subnets) <= 16
    error_message = "Must provide between 1 and 16 subnets."
  }
}

# -----------------------------
# Load Balancer (OPTIONAL SAFE)
# -----------------------------
variable "load_balancer" {
  description = "Load balancer configuration"
  type = object({
    target_group_arn = string
    container_port   = number
  })
  default = null

  validation {
    condition = var.load_balancer == null || (
      can(regex("^arn:.*:elasticloadbalancing:.*:targetgroup/.*", var.load_balancer.target_group_arn)) &&
      var.load_balancer.container_port >= 1 &&
      var.load_balancer.container_port <= 65535
    )
    error_message = "Invalid load balancer configuration."
  }
}

# -----------------------------
# Execution Role (REQUIRED FOR ECR + LOGS)
# -----------------------------
variable "execution_role_arn" {
  description = "IAM role ARN used by ECS tasks for pulling images and writing logs"
  type        = string

  validation {
    condition     = can(regex("^arn:.*:iam::.*:role/.*", var.execution_role_arn))
    error_message = "execution_role_arn must be a valid IAM role ARN."
  }
}

# -----------------------------
# Logging (CloudWatch)
# -----------------------------
variable "enable_logging" {
  description = "Enable CloudWatch logging"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention period"
  type        = number
  default     = 14

  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 3650
    error_message = "log_retention_days must be between 1 and 3650."
  }
}

# -----------------------------
# Health Check (OPTIONAL)
# -----------------------------
variable "health_check" {
  description = "Container health check configuration"
  type = object({
    command      = list(string)
    interval     = number
    timeout      = number
    retries      = number
    start_period = number
  })
  default = null

  validation {
    condition = var.health_check == null || (
      length(var.health_check.command) > 0 &&
      var.health_check.interval >= 5 &&
      var.health_check.timeout >= 2 &&
      var.health_check.retries >= 1
    )
    error_message = "Invalid health_check configuration."
  }
}

# -----------------------------
# Autoscaling Tuning
# -----------------------------
variable "cpu_target_utilization" {
  description = "Target CPU utilization percentage for autoscaling"
  type        = number
  default     = 70

  validation {
    condition     = var.cpu_target_utilization > 0 && var.cpu_target_utilization <= 100
    error_message = "cpu_target_utilization must be between 1 and 100."
  }
}

# -----------------------------
# Platform Dependencies
# -----------------------------
variable "cluster_arn" {
  description = "ECS cluster ARN"
  type        = string

  validation {
    condition     = can(regex("^arn:.*:ecs:.*:cluster/.*", var.cluster_arn))
    error_message = "cluster_arn must be a valid ECS cluster ARN."
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
