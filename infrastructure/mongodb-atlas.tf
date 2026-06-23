# =============================================================================
# MongoDB Atlas Free Tier (M0) Configuration
# =============================================================================

# Create a new Atlas project
resource "mongodbatlas_project" "main" {
  name   = "${var.project_name}-${var.environment}"
  org_id = var.mongodb_atlas_org_id
}

# Create a free tier cluster (M0)
resource "mongodbatlas_cluster" "main" {
  project_id = mongodbatlas_project.main.id
  name       = "${var.project_name}-cluster"

  # Free tier configuration
  provider_name               = "TENANT"
  backing_provider_name       = "AWS"
  provider_region_name        = var.mongodb_region
  provider_instance_size_name = "M0" # Free tier

  # Note: M0 clusters have limitations:
  # - 512 MB storage
  # - Shared RAM/vCPU
  # - No backups
  # - Limited connections
}

# Create database user
resource "mongodbatlas_database_user" "app_user" {
  project_id         = mongodbatlas_project.main.id
  username           = var.mongodb_username
  password           = random_password.mongodb_password.result
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.mongodb_database_name
  }

  roles {
    role_name     = "readAnyDatabase"
    database_name = "admin"
  }

  scopes {
    name = mongodbatlas_cluster.main.name
    type = "CLUSTER"
  }
}

# Configure IP Access List - Allow all IPs (required for Render/Vercel dynamic IPs)
# NOTE: For production, consider using VPC peering or private endpoints
resource "mongodbatlas_project_ip_access_list" "all" {
  project_id = mongodbatlas_project.main.id
  cidr_block = "0.0.0.0/0"
  comment    = "Allow access from anywhere (Render/Vercel dynamic IPs)"
}

# Output the connection string
output "mongodb_connection_string" {
  description = "MongoDB connection string (without credentials)"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = false
}

output "mongodb_full_connection_string" {
  description = "Full MongoDB connection string with credentials"
  value       = "mongodb+srv://${var.mongodb_username}:${random_password.mongodb_password.result}@${replace(mongodbatlas_cluster.main.connection_strings[0].standard_srv, "mongodb+srv://", "")}/${var.mongodb_database_name}?retryWrites=true&w=majority"
  sensitive   = true
}
