# Staging root: instantiates the environment module with the staging values and adopts, by
# import, the pipeline identities created during the phase 3 bootstrap in this project.

locals {
  # Project of the platform (federation pool). The accounts below are federated through it.
  platform_project_number = "2195266360"

  # GitHub numeric ids (owner pcodlcruz, repository my-tasks), embedded in the OIDC `sub`.
  github_subject_base = "repo:pcodlcruz@210847116/my-tasks@1370451186"
  pool_principal      = "principal://iam.googleapis.com/projects/${local.platform_project_number}/locations/global/workloadIdentityPools/github/subject"
}

module "environment" {
  source = "../../modules/environment"

  environment    = "staging"
  project_id     = var.project_id
  project_number = var.project_number
  region         = var.region

  terraform_service_account_email = google_service_account.terraform_staging.email
  deployer_service_account_email  = google_service_account.deployer_staging.email

  api_max_instances = var.api_max_instances
  web_max_instances = var.web_max_instances

  # The project is not shared with the platform, so this root owns the audit configuration.
  manage_data_access_audit = true

  # Staging holds test data only; point-in-time recovery stays off (LOW-003 of the phase 4 review).
  firestore_point_in_time_recovery = false
}

# Identity Platform is enabled by hand once per environment, because enabling it in a project that
# is not a Firebase project yet needs firebase.projects.update, which the apply identity does not
# have (infra/RUNBOOK.md). The provider cannot create a configuration that already exists (it fails
# with "Identity Platform has already been enabled for this project"), so it is adopted: Terraform
# then only reads and updates it, which the identity can do.
import {
  to = module.environment.google_identity_platform_config.default
  id = "projects/${var.project_id}/config"
}

# --- Pipeline identities of staging (T046, T047, T049) ---
# Project roles are granted by the owner, not by Terraform: the agent and the pipeline cannot
# grant them (see infra/RUNBOOK.md). Only the accounts and who may impersonate them are managed.

resource "google_service_account" "terraform_staging" {
  project      = var.project_id
  account_id   = "terraform-staging"
  display_name = "terraform-staging"
}

resource "google_service_account" "terraform_plan_staging" {
  project      = var.project_id
  account_id   = "terraform-plan-staging"
  display_name = "terraform-plan-staging"
}

resource "google_service_account" "deployer_staging" {
  project      = var.project_id
  account_id   = "deployer-staging"
  display_name = "deployer-staging"
}

# apply: only jobs bound to the infra-staging environment (owner approval).
resource "google_service_account_iam_member" "terraform_staging_wif" {
  service_account_id = google_service_account.terraform_staging.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:environment:infra-staging"
}

# plan: pull_request events of this repository only (never forks).
resource "google_service_account_iam_member" "terraform_plan_staging_wif" {
  service_account_id = google_service_account.terraform_plan_staging.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:pull_request"
}

# plan before the apply approval: pushes to develop. The plan job has no environment (the
# approval would come before it), so its subject is the branch. The identity is read-only.
resource "google_service_account_iam_member" "terraform_plan_staging_wif_develop" {
  service_account_id = google_service_account.terraform_plan_staging.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:ref:refs/heads/develop"
}

# deploy: jobs bound to the staging environment, which only runs from develop, release/* and
# hotfix/*.
resource "google_service_account_iam_member" "deployer_staging_wif" {
  service_account_id = google_service_account.deployer_staging.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:environment:staging"
}

import {
  to = google_service_account.terraform_staging
  id = "projects/${var.project_id}/serviceAccounts/terraform-staging@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = google_service_account.terraform_plan_staging
  id = "projects/${var.project_id}/serviceAccounts/terraform-plan-staging@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = google_service_account.deployer_staging
  id = "projects/${var.project_id}/serviceAccounts/deployer-staging@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = google_service_account_iam_member.terraform_staging_wif
  id = "projects/${var.project_id}/serviceAccounts/terraform-staging@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser ${local.pool_principal}/${local.github_subject_base}:environment:infra-staging"
}

import {
  to = google_service_account_iam_member.terraform_plan_staging_wif
  id = "projects/${var.project_id}/serviceAccounts/terraform-plan-staging@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser ${local.pool_principal}/${local.github_subject_base}:pull_request"
}

import {
  to = google_service_account_iam_member.terraform_plan_staging_wif_develop
  id = "projects/${var.project_id}/serviceAccounts/terraform-plan-staging@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser ${local.pool_principal}/${local.github_subject_base}:ref:refs/heads/develop"
}

import {
  to = google_service_account_iam_member.deployer_staging_wif
  id = "projects/${var.project_id}/serviceAccounts/deployer-staging@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser ${local.pool_principal}/${local.github_subject_base}:environment:staging"
}
