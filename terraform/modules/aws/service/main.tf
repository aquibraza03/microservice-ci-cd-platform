data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name = join("-", compact([
    var.project,
    var.environment,
    var.service_name
  ]))

  container_name = var.service_name

  valid_fargate_combo = (
    (var.cpu == 256 && contains([512, 1024, 2048], var.memory)) ||
    (var.cpu == 512 && contains([1024, 2048, 3072, 4096], var.memory)) ||
    (var.cpu == 1024 && contains([2048, 3072, 4096, 8192], var.memory)) ||
    (var.cpu == 2048 && contains([4096, 8192, 16384], var.memory)) ||
    (var.cpu == 4096 && contains([8192, 16384, 30720], var.memory))
  )
}

# -----------------------------
# CloudWatch Log Group (optional)
# -----------------------------
resource "aws_cloudwatch_log_group" "this" {
  count = var.enable_logging ? 1 : 0

  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# -----------------------------
# Task Definition
# -----------------------------
resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"

  cpu    = var.cpu
  memory = var.memory

  execution_role_arn = var.execution_role_arn

  container_definitions = jsonencode([
    merge(
      {
        name      = local.container_name
        image     = var.image
        essential = true

        portMappings = var.load_balancer == null ? [] : [
          {
            containerPort = var.load_balancer.container_port
            hostPort      = var.load_balancer.container_port
          }
        ]
      },

      # Logging block (optional)
      var.enable_logging ? {
        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = aws_cloudwatch_log_group.this[0].name
            awslogs-region        = data.aws_region.current.name
            awslogs-stream-prefix = "ecs"
          }
        }
      } : {},

      # Health check (optional)
      var.health_check == null ? {} : {
        healthCheck = {
          command     = var.health_check.command
          interval    = var.health_check.interval
          timeout     = var.health_check.timeout
          retries     = var.health_check.retries
          startPeriod = var.health_check.start_period
        }
      }
    )
  ])

  tags = var.tags

  lifecycle {
    precondition {
      condition     = local.valid_fargate_combo
      error_message = "Invalid CPU-memory combination for AWS Fargate."
    }
  }
}

# -----------------------------
# ECS Service
# -----------------------------
resource "aws_ecs_service" "this" {
  name            = local.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn

  desired_count = var.desired_count
  launch_type   = "FARGATE"

  network_configuration {
    subnets          = var.networking.subnets
    security_groups  = var.networking.security_group_ids
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.load_balancer == null ? [] : [var.load_balancer]

    content {
      target_group_arn = load_balancer.value.target_group_arn
      container_name   = local.container_name
      container_port   = load_balancer.value.container_port
    }
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = var.tags
}

# -----------------------------
# Autoscaling
# -----------------------------
resource "aws_appautoscaling_target" "this" {
  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${split("/", var.cluster_arn)[1]}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value = var.cpu_target_utilization
  }
}
