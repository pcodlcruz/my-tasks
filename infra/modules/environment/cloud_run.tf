# --- Cloud Run services (T065, T066) ---
# Terraform creates the services with a placeholder image and owns their shape (accounts,
# limits, fixed variables, access). The pipeline owns what changes on every deploy: image,
# traffic, APP_VERSION and the revision labels. Terraform ignores those, so a later apply never
# reverts a deployment (contracts/pipeline.md).

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = local.api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = true

  template {
    service_account = google_service_account.api_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }

    containers {
      image = var.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      # No FIRESTORE_EMULATOR_HOST nor FIREBASE_AUTH_EMULATOR_HOST: the API refuses to start
      # if they exist. APP_VERSION must stay the last entry, see ignore_changes below.
      env {
        name  = "APP_ENV"
        value = var.environment
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "CORS_ORIGINS"
        value = local.web_url
      }
      env {
        name  = "APP_VERSION"
        value = "unversioned"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      traffic,
      template[0].revision,
      template[0].labels,
      template[0].containers[0].image,
      template[0].containers[0].env[3], # APP_VERSION
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_project_iam_member.api_datastore_user,
    google_service_account_iam_member.terraform_acts_as_api,
  ]
}

resource "google_cloud_run_v2_service" "web" {
  project  = var.project_id
  name     = local.web_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  deletion_protection = true

  template {
    service_account = google_service_account.web_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.web_max_instances
    }

    containers {
      image = var.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle = true
      }

      # Public web configuration, served by the container as /config.js. APP_VERSION must stay
      # the last entry, see ignore_changes below.
      env {
        name  = "API_BASE_URL"
        value = local.api_url
      }
      env {
        name  = "FIREBASE_API_KEY"
        value = google_apikeys_key.web.key_string
      }
      env {
        name  = "FIREBASE_AUTH_DOMAIN"
        value = local.auth_domain
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "USE_EMULATORS"
        value = "false"
      }
      env {
        name  = "APP_VERSION"
        value = "unversioned"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      traffic,
      template[0].revision,
      template[0].labels,
      template[0].containers[0].image,
      template[0].containers[0].env[5], # APP_VERSION
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_service_account_iam_member.terraform_acts_as_web,
  ]
}

# The platform does not authenticate callers: the API verifies the user's ID token itself and
# the web is public. Anonymous invocation is therefore what keeps both reachable.
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# The pipeline creates revisions and moves traffic on these two services only.
resource "google_cloud_run_v2_service_iam_member" "deployer_api" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_service_account_email}"
}

resource "google_cloud_run_v2_service_iam_member" "deployer_web" {
  project  = var.project_id
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_service_account_email}"
}
