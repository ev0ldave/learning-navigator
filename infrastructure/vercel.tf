# =============================================================================
# Vercel Free Tier Configuration (Frontend React App)
# =============================================================================

# Vercel Project
resource "vercel_project" "frontend" {
  name      = var.project_name
  framework = "create-react-app"

  git_repository = {
    type = "github"
    repo = var.github_repo
  }

  # Root directory for the frontend
  root_directory = "client"

  # Build settings
  build_command    = "npm run build"
  output_directory = "build"

  # Environment variables
  environment = [
    {
      key    = "REACT_APP_API_URL"
      value  = "https://${var.project_name}-backend.onrender.com/api"
      target = ["production", "preview"]
    },
    {
      key    = "REACT_APP_GOOGLE_CLIENT_ID"
      value  = var.google_client_id
      target = ["production", "preview"]
    }
  ]
}

# Production deployment
resource "vercel_deployment" "production" {
  project_id = vercel_project.frontend.id
  ref        = var.github_branch
  production = true

  # Wait for project to be created
  depends_on = [vercel_project.frontend]
}

# Output the frontend URL
output "vercel_frontend_url" {
  description = "Vercel frontend URL"
  value       = "https://${vercel_project.frontend.name}.vercel.app"
}

output "vercel_production_url" {
  description = "Vercel production deployment URL"
  value       = vercel_deployment.production.url
}
