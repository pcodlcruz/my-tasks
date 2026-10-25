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
