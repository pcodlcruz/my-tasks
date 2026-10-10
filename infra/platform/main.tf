# Platform root (production project). Resources are added by the phase 3 tasks and adopted
# by import, never recreated:
#   T051  federation pool and provider, terraform-production and terraform-plan-production
#         (the staging accounts live in pdlco-mytasks-stg and are adopted by the staging root)
#   T052  Artifact Registry repository
#   T053  deployer-* accounts and their repository permissions
#   T054  prevent_destroy on state bucket, repository, pool and provider
#   T055  data access audit logging of Firestore and IAM

locals {
  project_number = "2195266360"

  # GitHub numeric ids (owner pcodlcruz, repository my-tasks). They are embedded in the OIDC
  # `sub` claim, so the federated subjects below use them instead of the names.
  github_owner_id      = "210847116"
  github_repository_id = "1370451186"
  github_subject_base  = "repo:pcodlcruz@${local.github_owner_id}/my-tasks@${local.github_repository_id}"

  pool_principal = "principal://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/subject"
}

# --- Federation of GitHub Actions (T044) ---

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub-Actions"
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub-Actions"

  # Only this repository, matched by immutable numeric ids; no wildcards.
  attribute_condition = "assertion.repository_owner_id=='${local.github_owner_id}'&&assertion.repository_id=='${local.github_repository_id}'"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

import {
  to = google_iam_workload_identity_pool.github
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/github"
}

import {
  to = google_iam_workload_identity_pool_provider.github_actions
  id = "projects/${var.project_id}/locations/global/workloadIdentityPools/github/providers/github-actions"
}

# --- Terraform identities of production (T046, T047) ---
# Project roles are granted by the owner, not by Terraform: the agent and the pipeline
# cannot grant them (see RUNBOOK). Only the accounts and who may impersonate them are managed.

resource "google_service_account" "terraform_production" {
  account_id   = "terraform-production"
  display_name = "terraform-production"
}

resource "google_service_account" "terraform_plan_production" {
  account_id   = "terraform-plan-production"
  display_name = "terraform-plan-production"
}

# apply: only jobs bound to the infra-production environment (owner approval).
resource "google_service_account_iam_member" "terraform_production_wif" {
  service_account_id = google_service_account.terraform_production.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:environment:infra-production"
}

# plan: pull_request events of this repository only (never forks).
resource "google_service_account_iam_member" "terraform_plan_production_wif" {
  service_account_id = google_service_account.terraform_plan_production.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "${local.pool_principal}/${local.github_subject_base}:pull_request"
}

import {
  to = google_service_account.terraform_production
  id = "projects/${var.project_id}/serviceAccounts/terraform-production@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = google_service_account.terraform_plan_production
  id = "projects/${var.project_id}/serviceAccounts/terraform-plan-production@${var.project_id}.iam.gserviceaccount.com"
}

import {
  to = google_service_account_iam_member.terraform_production_wif
  id = "projects/${var.project_id}/serviceAccounts/terraform-production@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser principal://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/github/subject/${local.github_subject_base}:environment:infra-production"
}

import {
  to = google_service_account_iam_member.terraform_plan_production_wif
  id = "projects/${var.project_id}/serviceAccounts/terraform-plan-production@${var.project_id}.iam.gserviceaccount.com roles/iam.workloadIdentityUser principal://iam.googleapis.com/projects/${local.project_number}/locations/global/workloadIdentityPools/github/subject/${local.github_subject_base}:pull_request"
}
