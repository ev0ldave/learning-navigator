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
   - If the consent screen is in **Testing** mode, add every account that signs in (including admin readers outside your domain) as a test user

6. **Terraform 1.5+** (`< 2.0`)

## Setup

1. **Install Terraform**
   ```bash
   brew install terraform  # macOS / Linuxbrew
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

## Application Settings

Key variables in `terraform.tfvars` (see `terraform.tfvars.example` for the full list):

| Variable | Description |
|----------|-------------|
| `admin_email` | Email automatically assigned the administrator role |
| `admin_reader_emails` | List of emails assigned the read-only `admin_reader` ("view as") role (required; use `[]` for none) |
| `allowed_domain` | Email domain allowed to sign in (required) |
| `email_host` / `email_port` / `email_user` / `email_password` / `email_from` | SMTP settings (Brevo on port 2525, because Render free tier blocks 25/465/587) |
| `google_client_id` / `google_client_secret` | Google OAuth credentials |

`SESSION_SECRET`, `JWT_SECRET`, and the MongoDB password are generated automatically.

**Terraform owns the Render environment.** Any variable added only in the Render dashboard is removed on the next `terraform apply`. Always add new settings to Terraform as well.

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
1. Push to GitHub (`main` branch)
2. Render and Vercel auto-deploy on push
   - Render only redeploys when `server/**` or `package.json` changes
   - Render uses Node 20+, pinned by `engines` in the root `package.json`

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
