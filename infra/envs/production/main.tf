# Production root: instantiates the environment module with the production values. It is the same
# module as staging; only the sizing and the identifiers differ (checked by
# .github/scripts/tests/test_env_roots_parity.py).
#
# Production shares its project with the platform (`infra/platform/`), which owns the pipeline
# identities, the federation, the image registry, the state bucket and the data access audit. This
# root therefore does not declare any of those: it only refers to the two accounts it needs by
# email.

locals {
  # Created and managed by the platform root. The environment module grants them rights on the
  # services and runtime accounts it creates.
  terraform_service_account_email = "terraform-production@${var.project_id}.iam.gserviceaccount.com"
  deployer_service_account_email  = "deployer-production@${var.project_id}.iam.gserviceaccount.com"
}

module "environment" {
  source = "../../modules/environment"

  environment    = "production"
  project_id     = var.project_id
  project_number = var.project_number
  region         = var.region

  providers = { google = google, google-beta = google-beta }

  terraform_service_account_email = local.terraform_service_account_email
  deployer_service_account_email  = local.deployer_service_account_email

  api_max_instances = var.api_max_instances
  web_max_instances = var.web_max_instances

  # The project is shared with the platform, which already declares the audit of Firestore and IAM
  # (two resources on the same service would overwrite each other).
  manage_data_access_audit = false

  # Production keeps 7 days of versions of the tasks, so a definitive delete (an application bug or
  # a compromised token) can be undone. Cheap for this volume (LOW-003 of the phase 4 review).
  firestore_point_in_time_recovery = true

  # Custom domains Firebase Hosting serves in this environment (feature 005): the canonical domain,
  # and www, which answers with a permanent redirect to it.
  custom_domains = [
    { domain = "inserttask.es" },
    { domain = "www.inserttask.es", redirect_to = "inserttask.es" },
  ]

  # Public Cloud DNS zone of the domain. www also points at Hosting. The staging subdomain is
  # delegated to the zone of staging; its name servers are only known after the staging apply, so the
  # map stays empty until they are filled in (T074, before the release).
  dns_zone_domain  = "inserttask.es"
  dns_a_subdomains = ["www"]
  dns_delegations  = {}
}

# Identity Platform already exists in production (created by the owner on 2025-12-03, with the
# Google sign-in provider), and the provider cannot create a configuration that already exists. It
# is adopted, so Terraform reads it and updates it, which the apply identity can do.
#
# The plan will show what changes: the module sets the authorized domains to the default
# authentication domains and the web of production, so any other domain added by hand since
# (for example localhost) is removed. Read it before approving the apply.
import {
  to = module.environment.google_identity_platform_config.default
  id = "projects/${var.project_id}/config"
}
