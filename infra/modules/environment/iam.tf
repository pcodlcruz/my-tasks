# --- Runtime accounts and deployment rights (T064) ---
# Rights over the services and the accounts are granted on the resource itself, never on the
# project: production shares its project with the platform (contracts/environments.md).

resource "google_service_account" "api_run" {
  project      = var.project_id
  account_id   = "mytasks-api-run-${var.environment}"
  display_name = "mytasks-api-run-${var.environment}"

  depends_on = [google_project_service.enabled]
}

# No roles at all: the web only serves static content.
resource "google_service_account" "web_run" {
  project      = var.project_id
  account_id   = "mytasks-web-run-${var.environment}"
  display_name = "mytasks-web-run-${var.environment}"

  depends_on = [google_project_service.enabled]
}

# The API reads and writes Firestore of its own project and nothing else. This is the only
# project-level grant terraform-<env> is allowed to make (condition of its projectIamAdmin).
resource "google_project_iam_member" "api_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api_run.email}"
}

# Creating a service that runs as an account requires acting as that account.
resource "google_service_account_iam_member" "terraform_acts_as_api" {
  service_account_id = google_service_account.api_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.terraform_service_account_email}"
}

resource "google_service_account_iam_member" "terraform_acts_as_web" {
  service_account_id = google_service_account.web_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.terraform_service_account_email}"
}

# The pipeline deploys revisions that run as these accounts.
resource "google_service_account_iam_member" "deployer_acts_as_api" {
  service_account_id = google_service_account.api_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployer_service_account_email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_web" {
  service_account_id = google_service_account.web_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployer_service_account_email}"
}
