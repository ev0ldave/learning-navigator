# =============================================================================
# Provider Authentication Variables
# =============================================================================

variable "mongodb_atlas_public_key" {
  description = "MongoDB Atlas API public key"
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_private_key" {
  description = "MongoDB Atlas API private key"
  type        = string
  sensitive   = true
}

variable "render_api_key" {
  description = "Render API key"
  type        = string
  sensitive   = true
}

variable "render_owner_id" {
  description = "Render owner ID (user or team)"
  type        = string
}

variable "vercel_api_token" {
  description = "Vercel API token"
  type        = string
  sensitive   = true
}

variable "vercel_team_id" {
  description = "Vercel team ID (optional, leave empty for personal account)"
  type        = string
  default     = null
}

# =============================================================================
# Project Configuration
# =============================================================================

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "learning-navigator"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

# =============================================================================
# MongoDB Atlas Configuration
# =============================================================================

variable "mongodb_atlas_org_id" {
  description = "MongoDB Atlas organization ID"
  type        = string
}

variable "mongodb_region" {
  description = "MongoDB Atlas region for free tier cluster"
  type        = string
  default     = "US_WEST_2" # AWS us-west-2, free tier available
}

variable "mongodb_database_name" {
  description = "Name of the MongoDB database"
  type        = string
  default     = "learning-navigator"
}

variable "mongodb_username" {
  description = "MongoDB database username"
  type        = string
  default     = "app_user"
}

# =============================================================================
# Application Configuration
# =============================================================================

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}

variable "email_host" {
  description = "SMTP email host"
  type        = string
  default     = "smtp.gmail.com"
}

variable "email_port" {
  description = "SMTP email port"
  type        = number
  default     = 587
}

variable "email_user" {
  description = "SMTP email username"
  type        = string
}

variable "email_password" {
  description = "SMTP email password"
  type        = string
  sensitive   = true
}

variable "email_from" {
  description = "Email from address"
  type        = string
  default     = "Learning Navigator <noreply@example.com>"
}

variable "admin_email" {
  description = "Admin email address"
  type        = string
}

variable "allowed_domain" {
  description = "Allowed email domain for registration"
  type        = string
  default     = "students.highline.edu"
}

variable "zoom_link" {
  description = "Default Zoom meeting link for virtual meetings"
  type        = string
  default     = ""
}

# =============================================================================
# SMS Configuration (Google Voice via gsms)
# =============================================================================

variable "google_voice_email" {
  description = "Google Voice email for SMS notifications (optional)"
  type        = string
  default     = ""
}

variable "google_voice_password" {
  description = "Google Voice password for SMS notifications (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# GitHub Repository (for Render and Vercel deployments)
# =============================================================================

variable "github_repo" {
  description = "GitHub repository in format owner/repo"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to deploy"
  type        = string
  default     = "main"
}
