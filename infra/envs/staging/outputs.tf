output "custom_domains" {
  description = "State of each custom domain and the DNS records Hosting still needs for it (feature 005). Public values only."
  value       = module.environment.custom_domains
}

output "dns_name_servers" {
  description = "Name servers of the Cloud DNS zone of the environment (feature 005). Public values."
  value       = module.environment.dns_name_servers
}
