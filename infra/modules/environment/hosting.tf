# --- Firebase Hosting in front of mytasks-web (feature 005) ---
# Hosting does not serve any content of its own. One rule sends every request to the Cloud Run
# service mytasks-web of this environment, which already serves the whole SPA (hashed assets,
# index.html, /config.js and the security headers). A second copy of the static files in Hosting
# would be a second source of truth for what is deployed (FR-012), and the pipeline keeps being the
# only thing that decides which revision of mytasks-web receives the traffic: the rule has no
# `pinTag`, so Hosting follows the revision that has the traffic and a deployment needs no new
# release here.
#
# This file uses the google-beta provider because the GA one has no google_firebase_hosting_*
# resources (infra/README.md, "Versiones"). Nothing else of the module is on that provider.
#
# The default Hosting site is NOT declared here, on purpose. Firebase creates it by itself (before
# 2026-10-15 for every Firebase project, and always when the Identity Platform API is enabled, which
# both environments have) and it cannot be changed or deleted afterwards. The console may simply
# show the "get started" page until the first release, which would explain why it was not listed
# there. Terraform therefore points at the site by its id, which is the project id. If the id of a
# project differed (Firebase appends five characters when the project id was already taken as a
# site id), or the site did not exist, the apply fails on the version below, before changing
# anything else, and `hosting_site_id` is the only line to change (or the site is created first).
# The default address `<site>.web.app` is already among the authorized domains (identity.tf).

locals {
  hosting_site_id = var.project_id
}

# A version is immutable: any change to its configuration creates a new one, and the release below
# publishes it.
resource "google_firebase_hosting_version" "web" {
  provider = google-beta
  site_id  = local.hosting_site_id

  config {
    rewrites {
      glob = "**"
      run {
        service_id = google_cloud_run_v2_service.web.name
        region     = google_cloud_run_v2_service.web.location
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_firebase_hosting_release" "web" {
  provider     = google-beta
  site_id      = local.hosting_site_id
  version_name = google_firebase_hosting_version.web.name
  message      = "mytasks-web behind Firebase Hosting (feature 005)"
}

# Custom domains of the environment. `wait_dns_verification = false` makes the apply finish without
# waiting for the DNS: the records live in the Cloud DNS zone of dns.tf and become visible once the
# owner delegates the zone, and Hosting issues the managed certificate (default type) once it sees
# them, which can take up to 24 hours.
#
# Ownership has to be proven with the TXT record and it must stay there for good: if the domain is
# not active 30 days after it was added, Hosting deletes it, and without the TXT record it cannot
# renew the certificate later. A domain with `redirect_to` answers with a permanent redirect to
# the other domain and is never served itself.
#
# prevent_destroy is lifted on purpose while staging.inserttask.com is withdrawn (the domain was
# first written with the wrong top-level domain). It is restored in its own pull request (T073 of
# specs/005-custom-domain/tasks.md) before the release: removing a domain by accident would take the
# address down (infra/RUNBOOK.md, section 14, explains how to withdraw one).
resource "google_firebase_hosting_custom_domain" "web" {
  provider = google-beta
  for_each = { for item in var.custom_domains : item.domain => item }

  site_id               = local.hosting_site_id
  custom_domain         = each.key
  redirect_target       = each.value.redirect_to
  wait_dns_verification = false

  depends_on = [google_firebase_hosting_release.web]
}
