# No credentials are configured here: in the pipeline the provider authenticates through
# Workload Identity Federation (no keys). Nothing is applied outside infra.yml.
#
# Identity Platform and API keys are quota-project APIs: the requests are billed to, and must be
# authorized against, the project of the environment instead of the project of the credential.
provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

# Same configuration for the beta provider, which only manages Firebase Hosting (the module's
# hosting.tf). Every other resource of the environment stays on the GA provider above.
provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}
