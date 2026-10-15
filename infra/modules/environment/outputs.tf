output "web_url" {
  description = "Public URL of mytasks-web."
  value       = local.web_url
}

output "api_url" {
  description = "Public URL of mytasks-api."
  value       = local.api_url
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
