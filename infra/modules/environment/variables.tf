variable "environment" {
  description = "Name of the environment. It is part of the runtime account names and of APP_ENV."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "project_id" {
  description = "Project of the environment."
  type        = string
}

variable "project_number" {
  description = "Number of the project. It fixes the deterministic run.app URL of each service before the service exists."
  type        = string
}

variable "region" {
  description = "Region of Firestore and Cloud Run."
  type        = string
  default     = "europe-southwest1"
}

variable "terraform_service_account_email" {
  description = "Identity that applies this module. It needs to act as the two runtime accounts to create the Cloud Run services."
  type        = string
}

variable "deployer_service_account_email" {
  description = "Pipeline identity that deploys revisions. It only gets rights over the two services and the two runtime accounts."
  type        = string
}

variable "api_max_instances" {
  description = "Maximum instances of mytasks-api. It is the per-environment bound of the work an anonymous caller can cause."
  type        = number
}

variable "web_max_instances" {
  description = "Maximum instances of mytasks-web."
  type        = number
}

variable "manage_data_access_audit" {
  description = "Declare the data access audit configuration of Firestore and IAM. Production sets it to false because the platform root already owns it (the project is shared)."
  type        = bool
}

variable "firestore_point_in_time_recovery" {
  description = "Enable point-in-time recovery of Firestore (7 days of versions). Production sets it to true so a definitive delete can be undone; staging keeps it off."
  type        = bool
}

variable "placeholder_image" {
  description = "Image of the first revision of each service, pinned by digest (never a moving tag: it runs with the identity of the service until the first deployment). The pipeline replaces it; Terraform ignores the image afterwards."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello@sha256:e2a01cf1e784fcc57c558ed2b1d1f76456de90771c0ad99ae3b6f57722c7dbf3"
}

variable "apis" {
  description = "APIs the environment needs."
  type        = set(string)
  default = [
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "securetoken.googleapis.com",
    "serviceusage.googleapis.com",
  ]
}
