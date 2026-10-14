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

  terraform_service_account_email = local.terraform_service_account_email
  deployer_service_account_email  = local.deployer_service_account_email

  api_max_instances = var.api_max_instances
  web_max_instances = var.web_max_instances

  # The project is shared with the platform, which already declares the audit of Firestore and IAM
  # (two resources on the same service would overwrite each other).
  manage_data_access_audit = false
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
