# =============================================================================
# Variables — Production Environment
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

variable "env_tier" {
  description = "Environment tier classification"
  type        = string
  default     = "production"
}

variable "platform_name" {
  description = "Platform name"
  type        = string
}

variable "org_name" {
  description = "Organization name"
  type        = string
}

variable "cloud" {
  description = "Target cloud provider (aws/gcp/azure)"
  type        = string

  validation {
    condition     = contains(["aws", "gcp", "azure"], var.cloud)
    error_message = "Cloud must be one of: aws, gcp, azure."
  }
}

variable "primary_region" {
  description = "Primary deployment region"
  type        = string
}

variable "secondary_region" {
  description = "Secondary (DR) deployment region"
  type        = string
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
  description = "Container image tag — set by CI/CD"
  type        = string
}

variable "container_port" {
  description = "Application container port"
  type        = number
  default     = 8080
}

# ----- Compute -----
variable "cpu" {
  description = "CPU units/cores"
  type        = number
  default     = null
}

variable "memory" {
  description = "Memory in MiB"
  type        = number
  default     = null
}

# ----- Scaling -----
variable "scaling_profile" {
  description = "Scaling profile (startup/growth/enterprise)"
  type        = string
}

variable "default_replicas" {
  description = "Default replica count"
  type        = number
  default     = 3
}

variable "node_min_size" {
  description = "Minimum cluster/instance size"
  type        = number
  default     = 3
}

variable "node_max_size" {
  description = "Maximum cluster/instance size"
  type        = number
  default     = 6
}

variable "node_count" {
  description = "Number of nodes"
  type        = number
  default     = 3
}

variable "instance_type" {
  description = "EC2/VM instance type — set by CI/CD"
  type        = string
}

variable "deploy_target" {
  description = "Deployment target (eks/ecs/aks/gke/k8s)"
  type        = string
}

variable "cluster_name" {
  description = "Cluster name — set by CI/CD"
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace — set by CI/CD"
  type        = string
}

# ----- AWS -----
variable "aws_region" {
  description = "AWS region — set by CI/CD"
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

variable "ecs_cluster_name" {
  description = "ECS cluster name"
  type        = string
  default     = null
}

variable "ecs_desired_count" {
  description = "ECS desired task count"
  type        = number
  default     = 3
}

variable "ecs_cpu" {
  description = "ECS task CPU"
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "ECS task memory"
  type        = number
  default     = 1024
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
variable "vpc_cidr" {
  description = "VPC CIDR block — set by CI/CD"
  type        = string
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks — set by CI/CD"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks — set by CI/CD"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use single NAT Gateway (not recommended for prod)"
  type        = bool
  default     = false
}

variable "networking" {
  description = "Advanced networking configuration"
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

# ----- Registry / Images -----
variable "registry_provider" {
  description = "Container registry provider"
  type        = string
}

variable "image_tag_strategy" {
  description = "Image tagging strategy"
  type        = string
}

variable "image_retention_days" {
  description = "Image retention period in days"
  type        = number
  default     = 90
}

# ----- Security -----
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

variable "enable_public_access" {
  description = "Enable public access"
  type        = bool
  default     = false
}

variable "enable_waf" {
  description = "Enable WAF"
  type        = bool
  default     = true
}

# ----- Observability -----
variable "enable_monitoring" {
  description = "Enable monitoring"
  type        = bool
  default     = true
}

variable "enable_logging" {
  description = "Enable logging"
  type        = bool
  default     = true
}

variable "enable_tracing" {
  description = "Enable distributed tracing"
  type        = bool
  default     = true
}

variable "enable_alerting" {
  description = "Enable alerting"
  type        = bool
  default     = true
}

# ----- Cost / Reliability -----
variable "use_spot_instances" {
  description = "Use spot instances"
  type        = bool
  default     = false
}

variable "spot_percentage" {
  description = "Percentage of spot instances"
  type        = number
  default     = 0

  validation {
    condition     = var.spot_percentage >= 0 && var.spot_percentage <= 100
    error_message = "spot_percentage must be between 0 and 100."
  }
}

variable "off_hours_scale_down" {
  description = "Scale down during off hours"
  type        = bool
  default     = false
}

# ----- Backup / Compliance -----
variable "backup_required" {
  description = "Enable backup"
  type        = bool
  default     = true
}

variable "retention_days" {
  description = "Backup retention in days"
  type        = number
  default     = 90
}

variable "audit_logging" {
  description = "Enable audit logging"
  type        = bool
  default     = true
}

# ----- Platform Features -----
variable "enable_gitops" {
  description = "Enable GitOps (ArgoCD/Flux)"
  type        = bool
  default     = true
}

variable "enable_preview_envs" {
  description = "Enable preview environments"
  type        = bool
  default     = false
}

variable "enable_service_mesh" {
  description = "Enable service mesh"
  type        = bool
  default     = false
}

# ----- Change Governance -----
variable "require_manual_approval" {
  description = "Require manual approval for changes"
  type        = bool
  default     = true
}

variable "allow_auto_apply" {
  description = "Allow automatic apply"
  type        = bool
  default     = false
}

variable "change_window" {
  description = "Allowed change window"
  type        = string
  default     = "business-hours"
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
