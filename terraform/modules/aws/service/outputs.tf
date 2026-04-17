# -----------------------------
# Data Sources (Dynamic Context)
# -----------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------
# Core Service Outputs
# -----------------------------
output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.this.name
}

output "service_arn" {
  description = "ECS service ARN"
  value       = aws_ecs_service.this.arn
}

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = var.cluster_arn
}

# -----------------------------
# Task Definition
# -----------------------------
output "task_definition_arn" {
  description = "Task definition ARN"
  value       = aws_ecs_task_definition.this.arn
}

output "task_definition_family" {
  description = "Task definition family"
  value       = aws_ecs_task_definition.this.family
}

output "task_definition_revision" {
  description = "Task definition revision"
  value       = aws_ecs_task_definition.this.revision
}

# -----------------------------
# Networking
# -----------------------------
output "subnets" {
  description = "Subnets used by the service"
  value       = var.networking.subnets
}

output "security_groups" {
  description = "Security groups attached to the service"
  value       = var.networking.security_group_ids
}

# -----------------------------
# Load Balancer (Safe Optional)
# -----------------------------
output "target_group_arn" {
  description = "Target group ARN (null if not configured)"
  value       = try(var.load_balancer.target_group_arn, null)
}

output "container_port" {
  description = "Container port (null if not configured)"
  value       = try(var.load_balancer.container_port, null)
}

# -----------------------------
# Autoscaling
# -----------------------------
output "autoscaling_resource_id" {
  description = "App autoscaling resource ID"
  value       = aws_appautoscaling_target.this.resource_id
}

output "autoscaling_min_capacity" {
  description = "Autoscaling minimum capacity"
  value       = var.min_count
}

output "autoscaling_max_capacity" {
  description = "Autoscaling maximum capacity"
  value       = var.max_count
}

# -----------------------------
# Logging (Optional Safe)
# -----------------------------
output "log_group_name" {
  description = "CloudWatch log group name"
  value       = try(aws_cloudwatch_log_group.this[0].name, null)
}

output "log_group_arn" {
  description = "CloudWatch log group ARN"
  value       = try(aws_cloudwatch_log_group.this[0].arn, null)
}

# -----------------------------
# Metadata & Context
# -----------------------------
output "tags" {
  description = "Tags applied to resources"
  value       = var.tags
}

output "service_status" {
  description = "Current ECS service status"
  value       = aws_ecs_service.this.status
}

output "account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "region" {
  description = "AWS Region"
  value       = data.aws_region.current.name
}

# -----------------------------
# Useful Derived Identifiers
# -----------------------------
output "service_resource_id" {
  description = "ECS service resource ID (for autoscaling / monitoring)"
  value       = "service/${split("/", var.cluster_arn)[1]}/${aws_ecs_service.this.name}"
}
