variable "project_id" {
  description = "Production project that hosts the platform (federation, image registry, Terraform state, pipeline identities)."
  type        = string
}

variable "region" {
  description = "Region of the regional resources (Artifact Registry, state bucket)."
  type        = string
  default     = "europe-southwest1"
}
