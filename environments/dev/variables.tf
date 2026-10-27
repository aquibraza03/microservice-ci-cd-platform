# =============================================================================
# Variables — Development Environment
# =============================================================================

# ----- Core Identity -----
variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "profile" {
  description = "Scaling profile (startup/growth/enterprise)"
  type        = string
  default     = "startup"
}

variable "cloud" {
  description = "Target cloud provider (aws/gcp/azure)"
  type        = string

  validation {
    condition     = contains(["aws", "gcp", "azure"], var.cloud)
    error_message = "Cloud must be one of: aws, gcp, azure."
  }
}

# ----- Service -----
variable "service_name" {
  description = "Service name"
  type        = string
  default     = "platform-api"
}

variable "image" {
  description = "Container image (overrides computed default)"
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

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

# ----- Compute -----
variable "cpu" {
  description = "CPU units/cores"
  type        = number
  default     = null
}

variable "memory" {
  description = "Memory in MiB (or Gi for Azure)"
  type        = number
  default     = null
}

# ----- Scaling -----
variable "min_count" {
  description = "Minimum instances/replicas"
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum instances/replicas"
  type        = number
  default     = 2
}

variable "desired_count" {
  description = "Desired instances/replicas"
  type        = number
  default     = 1
}

# ----- AWS -----
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_cluster_arn" {
  description = "ECS cluster ARN"
  type        = string
  default     = null
}

variable "aws_execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
  default     = null
}

# ----- GCP -----
variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
  default     = null
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = null
}

variable "gcp_service_account_email" {
  description = "GCP service account email"
  type        = string
  default     = null
}

# ----- Azure -----
variable "azure_resource_group_name" {
  description = "Azure resource group name"
  type        = string
  default     = null
}

variable "azure_container_app_environment_id" {
  description = "Azure Container App Environment resource ID"
  type        = string
  default     = null
}

# ----- Networking -----
variable "networking" {
  description = "Networking configuration"
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

# ----- Observability -----
variable "enable_logging" {
  description = "Enable CloudWatch/Cloud Logging"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Log retention in days"
  type        = number
  default     = 14
}

variable "cpu_target_utilization" {
  description = "Target CPU utilization for autoscaling"
  type        = number
  default     = 70
}

# ----- Health Check -----
variable "health_check" {
  description = "Health check configuration"
  type = object({
    path                  = optional(string, "/health")
    port                  = optional(number, 8080)
    interval              = optional(number, 30)
    timeout               = optional(number, 5)
    retries               = optional(number, 3)
    start_period          = optional(number, 10)
    initial_delay_seconds = optional(number, 10)
    command               = optional(list(string))
  })
  default = null
}

# ----- Infrastructure (future modules) -----
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.10.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.10.1.0/24", "10.10.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.10.11.0/24", "10.10.12.0/24"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use single NAT Gateway"
  type        = bool
  default     = true
}

variable "deploy_target" {
  description = "Deployment target (eks/ecs/aks/gke/k8s)"
  type        = string
  default     = "ecs"
}

variable "cluster_name" {
  description = "Cluster name"
  type        = string
  default     = null
}

variable "node_count" {
  description = "Number of nodes"
  type        = number
  default     = 2
}

variable "instance_type" {
  description = "EC2/VM instance type"
  type        = string
  default     = "t3.medium"
}

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = null
}

variable "enable_monitoring" {
  description = "Enable monitoring"
  type        = bool
  default     = true
}

variable "enable_encryption" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "enable_private_access" {
  description = "Enable private access only"
  type        = bool
  default     = true
}

variable "use_spot_instances" {
  description = "Use spot instances"
  type        = bool
  default     = true
}

variable "off_hours_scale_down" {
  description = "Scale down during off hours"
  type        = bool
  default     = true
}

# ----- Kubernetes -----
variable "kubernetes_host" {
  description = "Kubernetes API server endpoint"
  type        = string
  default     = ""
}

variable "kubernetes_cluster_ca_certificate" {
  description = "Kubernetes cluster CA certificate (base64)"
  type        = string
  default     = ""
}

variable "kubernetes_cluster_name" {
  description = "EKS cluster name used for exec-based OIDC authentication"
  type        = string
  default     = ""
}

variable "kubernetes_token" {
  description = "DEPRECATED: static Kubernetes service account token. Kept only for backward compatibility; OIDC exec-based authentication is used instead."
  type        = string
  default     = ""
  sensitive   = true
}

# ----- Tags -----
variable "tags" {
  description = "Additional resource tags"
  type        = map(string)
  default     = {}
}
