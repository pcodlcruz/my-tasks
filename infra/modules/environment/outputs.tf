output "web_url" {
  description = "Public URL of mytasks-web."
  value       = local.web_url
}

output "api_url" {
  description = "Public URL of mytasks-api."
  value       = local.api_url
}

output "hosting_site_id" {
  description = "Id of the default Firebase Hosting site the web is served through."
  value       = local.hosting_site_id
}

output "hosting_url" {
  description = "Default Firebase Hosting address of the environment (feature 005)."
  value       = "https://${local.hosting_site_id}.web.app"
}

output "custom_domains" {
  description = "State of each custom domain and the DNS records Hosting still needs for it (feature 005). Public values only: the records are what the owner has to put in the DNS."
  value = {
    for domain, resource in google_firebase_hosting_custom_domain.web : domain => {
      host_state           = resource.host_state
      ownership_state      = resource.ownership_state
      certificate_state    = try(resource.cert[0].state, null)
      issues               = resource.issues
      required_dns_updates = resource.required_dns_updates
    }
  }
}

output "dns_name_servers" {
  description = "Name servers of the Cloud DNS zone (feature 005): what the owner delegates to (staging) or sets at the registrar (production). Public values; null when the environment has no zone."
  value       = local.dns_enabled ? google_dns_managed_zone.main[0].name_servers : null
}

output "firebase_auth_domain" {
  description = "Authentication domain the web uses."
  value       = local.auth_domain
}

output "api_runtime_service_account" {
  description = "Account mytasks-api runs as."
  value       = google_service_account.api_run.email
}

output "web_runtime_service_account" {
  description = "Account mytasks-web runs as."
  value       = google_service_account.web_run.email
}

output "firestore_index_count" {
  description = "Composite indexes declared from firestore.indexes.json."
  value       = length(google_firestore_index.tasks)
}
