# =============================================================================
# Render Free Tier Configuration (Backend API)
# =============================================================================

# Backend Web Service
resource "render_web_service" "backend" {
  name   = "${var.project_name}-backend"
  plan   = "free" # Free tier
  region = "oregon"

  # Runtime source configuration (new provider format)
  runtime_source = {
    native_runtime = {
      auto_deploy   = true
      branch        = var.github_branch
      build_command = "npm install"
      build_filter = {
        paths         = ["server/**", "package.json"]
        ignored_paths = ["client/**", "infrastructure/**"]
      }
      repo_url = "https://github.com/${var.github_repo}"
      runtime  = "node"
    }
  }

  start_command = "npm start"

  # Environment variables
  env_vars = {
    NODE_ENV = {
      value = "production"
    }
    PORT = {
      value = "10000" # Render assigns port via PORT env var
    }
    MONGODB_URI = {
      value = "mongodb+srv://${var.mongodb_username}:${random_password.mongodb_password.result}@${replace(mongodbatlas_cluster.main.connection_strings[0].standard_srv, "mongodb+srv://", "")}/${var.mongodb_database_name}?retryWrites=true&w=majority"
    }
    SESSION_SECRET = {
      value = random_password.session_secret.result
    }
    JWT_SECRET = {
      value = random_password.jwt_secret.result
    }
    JWT_EXPIRES_IN = {
      value = "7d"
    }
    GOOGLE_CLIENT_ID = {
      value = var.google_client_id
    }
    GOOGLE_CLIENT_SECRET = {
      value = var.google_client_secret
    }
    GOOGLE_CALLBACK_URL = {
      value = "https://${var.project_name}-backend.onrender.com/api/auth/google/callback"
    }
    EMAIL_HOST = {
      value = var.email_host
    }
    EMAIL_PORT = {
      value = tostring(var.email_port)
    }
    EMAIL_USER = {
      value = var.email_user
    }
    EMAIL_PASSWORD = {
      value = var.email_password
    }
    EMAIL_FROM = {
      value = var.email_from
    }
    ADMIN_EMAIL = {
      value = var.admin_email
    }
    ALLOWED_DOMAIN = {
      value = var.allowed_domain
    }
    # Note: Zoom links are now configured per-navigator in their profile settings
    # CLIENT_URL will be set after Vercel deployment
    CLIENT_URL = {
      value = "https://${var.project_name}.vercel.app"
    }
  }

  # Health check
  health_check_path = "/api/health"

  # Ignore changes that cause issues with free tier
  # The Render provider sends maintenance_mode in update requests which fails on free tier
  # Use Render dashboard to update env vars instead, or auto-deploy picks up code changes
  lifecycle {
    ignore_changes = all
  }
}

# Output the backend URL
output "render_backend_url" {
  description = "Render backend service URL"
  value       = "https://${render_web_service.backend.name}.onrender.com"
}
