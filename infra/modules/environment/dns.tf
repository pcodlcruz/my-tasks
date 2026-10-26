# --- Cloud DNS zone of the environment (feature 005, FR-021 and FR-022) ---
# One public zone per environment, in the project of the environment. Terraform writes the records
# Firebase Hosting needs, so they are deterministic and public: the owner only delegates the zone
# (staging) or points the name servers of the domain at it (production), and never copies a record.
#
# There is never an AAAA record: Hosting serves IPv4 only, and with an AAAA record in the zone it
# does not issue the managed certificate. The only A address is the one Hosting documents for custom
# domains.
#
# prevent_destroy: deleting the zone by accident would take the domain down, so it takes a
# deliberate change of this file.

locals {
  dns_enabled = var.dns_zone_domain != null
  hosting_ip  = "199.36.158.100"
  dns_ttl     = 300
}

resource "google_dns_managed_zone" "main" {
  count = local.dns_enabled ? 1 : 0

  project     = var.project_id
  name        = replace(var.dns_zone_domain, ".", "-")
  dns_name    = "${var.dns_zone_domain}."
  description = "Public zone of ${var.dns_zone_domain} for Firebase Hosting (${var.environment})"
  visibility  = "public"

  depends_on = [google_project_service.enabled]

  lifecycle {
    prevent_destroy = true
  }
}

# Proves to Hosting that this project owns the domain. It must stay for good: without it Hosting
# cannot renew the certificate.
resource "google_dns_record_set" "ownership" {
  count = local.dns_enabled ? 1 : 0

  project      = var.project_id
  managed_zone = google_dns_managed_zone.main[0].name
  name         = google_dns_managed_zone.main[0].dns_name
  type         = "TXT"
  ttl          = local.dns_ttl
  rrdatas      = ["\"hosting-site=${local.hosting_site_id}\""]
}

resource "google_dns_record_set" "apex" {
  count = local.dns_enabled ? 1 : 0

  project      = var.project_id
  managed_zone = google_dns_managed_zone.main[0].name
  name         = google_dns_managed_zone.main[0].dns_name
  type         = "A"
  ttl          = local.dns_ttl
  rrdatas      = [local.hosting_ip]
}

# Subdomains of the zone that also point at Hosting (www in production).
resource "google_dns_record_set" "subdomain" {
  for_each = local.dns_enabled ? toset(var.dns_a_subdomains) : toset([])

  project      = var.project_id
  managed_zone = google_dns_managed_zone.main[0].name
  name         = "${each.key}.${google_dns_managed_zone.main[0].dns_name}"
  type         = "A"
  ttl          = local.dns_ttl
  rrdatas      = [local.hosting_ip]
}

# Delegation of a child zone that lives in another project (staging, from the zone of production).
resource "google_dns_record_set" "delegation" {
  for_each = local.dns_enabled ? var.dns_delegations : {}

  project      = var.project_id
  managed_zone = google_dns_managed_zone.main[0].name
  name         = "${each.key}.${google_dns_managed_zone.main[0].dns_name}"
  type         = "NS"
  ttl          = local.dns_ttl
  rrdatas      = each.value
}
