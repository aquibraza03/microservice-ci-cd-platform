variable "name" {
  description = "ECR repository name"
  type        = string
}

variable "scan_on_push" {
  description = "Enable image scanning"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags for the ECR repository"
  type        = map(string)
  default     = {}
}

variable "encryption_type" {
  description = "Encryption type (AES256 or KMS)"
  type        = string
  default     = "AES256"
}

variable "enable_lifecycle_policy" {
  description = "Enable lifecycle policy for images"
  type        = bool
  default     = true
}

variable "force_delete" {
  description = "Allow force deletion of repository"
  type        = bool
  default     = false
}
