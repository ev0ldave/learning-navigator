# Learning Navigator Infrastructure
# MongoDB Atlas (Free Tier) + Render (Free Tier) + Vercel (Free Tier)

terraform {
  required_version = ">= 1.5, < 2.0"

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.15"
    }
    render = {
      source  = "render-oss/render"
      version = "~> 1.3"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# MongoDB Atlas Provider
provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}

# Render Provider
provider "render" {
  api_key  = var.render_api_key
  owner_id = var.render_owner_id
}

# Vercel Provider
provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team_id
}

# Generate random strings for secrets
resource "random_password" "session_secret" {
  length  = 32
  special = true
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}

resource "random_password" "mongodb_password" {
  length  = 24
  special = false # Atlas has restrictions on special chars
}
