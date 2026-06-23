# =============================================================================
# Consolidated Outputs
# =============================================================================

output "application_urls" {
  description = "Application URLs"
  value = {
    frontend = "https://${vercel_project.frontend.name}.vercel.app"
    backend  = "https://${render_web_service.backend.name}.onrender.com"
    api      = "https://${render_web_service.backend.name}.onrender.com/api"
    health   = "https://${render_web_service.backend.name}.onrender.com/api/health"
  }
}

output "google_oauth_callback_url" {
  description = "Google OAuth callback URL (add this to Google Cloud Console)"
  value       = "https://${render_web_service.backend.name}.onrender.com/api/auth/google/callback"
}

output "deployment_info" {
  description = "Deployment information"
  value = {
    mongodb_cluster = mongodbatlas_cluster.main.name
    mongodb_region  = var.mongodb_region
    render_region   = "oregon"
    environment     = var.environment
  }
}

# Sensitive outputs (use `terraform output -json` to see)
output "secrets" {
  description = "Generated secrets (sensitive)"
  sensitive   = true
  value = {
    mongodb_password = random_password.mongodb_password.result
    session_secret   = random_password.session_secret.result
    jwt_secret       = random_password.jwt_secret.result
  }
}
