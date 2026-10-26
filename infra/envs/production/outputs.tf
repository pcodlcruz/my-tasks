output "custom_domains" {
  description = "State of each custom domain and the DNS records Hosting still needs for it (feature 005). Public values only."
  value       = module.environment.custom_domains
}
