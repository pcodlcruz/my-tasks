# No credentials are configured here: in the pipeline the provider authenticates through
# Workload Identity Federation (no keys). Nothing is applied outside infra.yml.
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
