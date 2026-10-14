# --- Identity Platform (T063) ---
# Users live in the project of the environment, so a token of staging is never valid in
# production (FR-014, SC-009). The Google sign-in provider is configured by hand once per
# environment because it needs an OAuth client secret (research R8, infra/RUNBOOK.md): it is
# deliberately not declared here, and omitting `sign_in` leaves it untouched.

resource "google_identity_platform_config" "default" {
  project = var.project_id

  # Only the web of this environment and the default authentication domains. `localhost` is
  # left out on purpose: local development uses the emulators, never a deployed project.
  authorized_domains = [
    local.auth_domain,
    "${var.project_id}.web.app",
    "${local.web_service_name}-${var.project_number}.${var.region}.run.app",
  ]

  depends_on = [google_project_service.enabled]
}

# Browser key of the web SDK, limited to the two Identity APIs and to the origins of this
# environment. The key is public by design (it ends up in /config.js); the restriction is what
# stops it from being used elsewhere.
resource "google_apikeys_key" "web" {
  project      = var.project_id
  name         = "mytasks-web-${var.environment}"
  display_name = "mytasks-web-${var.environment}"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = [
        "${local.web_url}/*",
        "https://${local.auth_domain}/*",
      ]
    }

    api_targets {
      service = "identitytoolkit.googleapis.com"
    }

    api_targets {
      service = "securetoken.googleapis.com"
    }
  }

  depends_on = [google_project_service.enabled]
}
