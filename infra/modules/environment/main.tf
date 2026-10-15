# Environment module: everything one environment needs except the pipeline identities and the
# image registry, which belong to the platform root (production project).

locals {
  web_service_name = "mytasks-web"
  api_service_name = "mytasks-api"

  # Deterministic URL of a Cloud Run service (SERVICE-PROJECT_NUMBER.REGION.run.app). Known
  # before the service exists, so CORS and the API address need no circular reference. The DNS
  # label must stay within 63 characters, hence the short service names.
  web_url = "https://${local.web_service_name}-${var.project_number}.${var.region}.run.app"
  api_url = "https://${local.api_service_name}-${var.project_number}.${var.region}.run.app"

  # Default authentication domain of the project. It serves /__/auth/handler without Firebase
  # Hosting and must stay in the authorized domains.
  auth_domain = "${var.project_id}.firebaseapp.com"
}

resource "google_project_service" "enabled" {
  for_each = var.apis

  project = var.project_id
  service = each.key

  # Turning an API off could take the data or the login with it.
  disable_on_destroy         = false
  disable_dependent_services = false
}

# --- Firestore (T062) ---

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"
  point_in_time_recovery_enablement = (
    var.firestore_point_in_time_recovery ? "POINT_IN_TIME_RECOVERY_ENABLED" : "POINT_IN_TIME_RECOVERY_DISABLED"
  )
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  # The tasks of the owner live here. Retiring an environment is a deliberate manual step
  # (infra/RUNBOOK.md): lift both protections first.
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.enabled]
}

# Trashed tasks are removed by Firestore once purge_at has passed (FR-014b of feature 001).
resource "google_firestore_field" "tasks_purge_at" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "tasks"
  field      = "purge_at"

  ttl_config {}
}

# The composite indexes are read from the file feature 001 maintains, so the two cannot drift.
locals {
  firestore_indexes = {
    for index in jsondecode(file("${path.module}/../../../firestore.indexes.json")).indexes :
    join("_", [for field in index.fields : field.fieldPath]) => index
  }
}

resource "google_firestore_index" "tasks" {
  for_each = local.firestore_indexes

  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = each.value.collectionGroup
  query_scope = each.value.queryScope

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path = fields.value.fieldPath
      order      = fields.value.order
    }
  }
}

# --- Data access audit (T064) ---
# Firestore is audited under datastore.googleapis.com. Each resource owns the whole
# configuration of its service, so no other log type is enabled by accident.

resource "google_project_iam_audit_config" "firestore" {
  count = var.manage_data_access_audit ? 1 : 0

  project = var.project_id
  service = "datastore.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

resource "google_project_iam_audit_config" "iam" {
  count = var.manage_data_access_audit ? 1 : 0

  project = var.project_id
  service = "iam.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}
