variable "project_id" {
  description = "Project of the staging environment."
  type        = string
}

variable "project_number" {
  description = "Number of the staging project."
  type        = string
}

variable "region" {
  description = "Region of Firestore and Cloud Run."
  type        = string
  default     = "europe-southwest1"
}

variable "api_max_instances" {
  description = "Maximum instances of mytasks-api."
  type        = number
}

variable "web_max_instances" {
  description = "Maximum instances of mytasks-web."
  type        = number
}
