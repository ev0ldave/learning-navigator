# Learning Navigator Infrastructure

Terraform configuration to deploy Learning Navigator on free tiers:
- **MongoDB Atlas** - M0 Free Tier (512MB storage)
- **Render** - Free Tier (spins down after inactivity)
- **Vercel** - Free Tier (100GB bandwidth/month)

## Prerequisites

1. **MongoDB Atlas Account**
   - Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas)
   - Create an organization
   - Generate API keys: Organization → Access Manager → API Keys

2. **Render Account**
   - Sign up at [render.com](https://render.com)
   - Get API key: Account Settings → API Keys

3. **Vercel Account**
   - Sign up at [vercel.com](https://vercel.com)
   - Generate token: Account Settings → Tokens

4. **GitHub Repository**
   - Push your code to GitHub
   - Connect GitHub to Render and Vercel

5. **Google Cloud Console**
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://<project>-backend.onrender.com/api/auth/google/callback`

## Setup

1. **Install Terraform**
   ```bash
   brew install terraform  # macOS
   # or download from terraform.io
   ```

2. **Configure Variables**
   ```bash
   cd infrastructure
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. **Initialize Terraform**
   ```bash
   terraform init
   ```

4. **Preview Changes**
   ```bash
   terraform plan
   ```

5. **Apply Infrastructure**
   ```bash
   terraform apply
   ```

## Outputs

After successful deployment, Terraform outputs:
- Frontend URL (Vercel)
- Backend URL (Render)
- API Health check URL
- Google OAuth callback URL (add to Google Cloud Console)

View outputs:
```bash
terraform output
terraform output -json secrets  # View sensitive values
```

## Free Tier Limitations

### MongoDB Atlas M0
- 512 MB storage
- Shared vCPU/RAM
- No automated backups
- Limited to 500 connections

### Render Free Tier
- Spins down after 15 min of inactivity
- First request after sleep takes ~30 seconds
- 750 hours/month

### Vercel Free Tier
- 100 GB bandwidth/month
- Serverless function limits apply
- No team features

## Updating

After code changes:
1. Push to GitHub
2. Render and Vercel auto-deploy on push

To update infrastructure:
```bash
terraform plan
terraform apply
```

## Destroying

To tear down all infrastructure:
```bash
terraform destroy
```

**Warning**: This deletes the MongoDB database and all data!

## File Structure

```
infrastructure/
├── main.tf                  # Providers and random secrets
├── variables.tf             # Input variables
├── mongodb-atlas.tf         # MongoDB Atlas configuration
├── render.tf                # Render backend configuration
├── vercel.tf                # Vercel frontend configuration
├── outputs.tf               # Output values
├── terraform.tfvars.example # Example variables file
└── README.md                # This file
```

## Security Notes

- `terraform.tfvars` contains secrets - **never commit to git**
- Add to `.gitignore`:
  ```
  infrastructure/terraform.tfvars
  infrastructure/*.tfstate*
  infrastructure/.terraform/
  ```
- MongoDB allows all IPs (0.0.0.0/0) since Render/Vercel have dynamic IPs
- For production, consider VPC peering or Atlas Private Endpoints
