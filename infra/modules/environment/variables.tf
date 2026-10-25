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
    "firebasehosting.googleapis.com",
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

variable "custom_domains" {
  description = "Domains Firebase Hosting serves for this environment (feature 005). `redirect_to` makes a domain answer with a permanent redirect to another domain of the list; the others serve the web and are the ones the sign-in authorizes."
  type = list(object({
    domain      = string
    redirect_to = optional(string)
  }))
  default = []

  validation {
    condition = alltrue([
      for item in var.custom_domains :
      can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", item.domain))
      && !can(regex("\\.[0-9]+$", item.domain))
    ])
    error_message = "Each domain must be a lower-case domain name: no scheme, path, port, wildcard or trailing dot, and not an IP address."
  }

  validation {
    condition     = length(distinct([for item in var.custom_domains : item.domain])) == length(var.custom_domains)
    error_message = "A domain can appear only once."
  }

  validation {
    condition = alltrue([
      for item in var.custom_domains :
      item.redirect_to == null ? true : (
        item.redirect_to != item.domain
        && contains([for other in var.custom_domains : other.domain], item.redirect_to)
        && try([for other in var.custom_domains : other.redirect_to if other.domain == item.redirect_to][0], null) == null
      )
    ])
    error_message = "redirect_to must name another domain of the list, and that domain must not redirect in turn."
  }
}
