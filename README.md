# Learning Navigator

A comprehensive student-learning navigator scheduling and management application for educational institutions.

## Features

### User Roles

- **Administrator**: Full system access, user management, and all learning navigator capabilities
- **Learning Navigator**: Manage students, schedule meetings, create notes, generate reports
- **Student**: Book sessions, view calendar, manage profile
- **Admin Reader**: Read-only account that can "view as" any student, navigator, or administrator to see the site exactly as that user does. Cannot modify any data. See [Admin Reader (View As)](#admin-reader-view-as).

### Core Functionality

- **Meeting Management**: Schedule, reschedule, and cancel meetings with recurring support
- **Calendar Integration**: Google Calendar sync for automatic event management
- **Availability Management**: Set weekly availability hours for booking slots
- **Notes System**: Private and shared notes with email delivery to students
- **Reports**: Multi-dimensional reports with configurable metrics, grouping, and filters. In-app viewer with PDF/Excel export
- **Notifications**: Email and in-app notifications for meeting updates
- **Profile Management**: User profiles with notification preferences

## Tech Stack

- **Frontend**: React 18 + Vite with Material-UI
- **Backend**: Node.js 24 with Express 5
- **Database**: MongoDB (Mongoose)
- **Authentication**: Google OAuth + Local (development only), JWT
- **Calendar**: Google Calendar API
- **Notifications**: Nodemailer 10 over SMTP (Brevo in production)
- **Testing**: Jest + Supertest + mongodb-memory-server
- **Local Development**: Docker + Docker Compose
- **Production Deployment**: Terraform (Vercel + Render + MongoDB Atlas)

## Getting Started

### Prerequisites

- **Docker and Docker Compose** (recommended for local development), or
- **Node.js 24** and a local **MongoDB 7** instance (to run without Docker)
- **Google Cloud Console** project with OAuth 2.0 credentials and the Calendar API enabled
- **Terraform 1.5+** (only for production deployment)

### Local Development with Docker

1. Clone the repository and start all services:
```bash
docker-compose up --build
```

This starts:
- **Frontend**: http://localhost:3000 (React with hot reload)
- **Backend**: http://localhost:5001 (Express API)
- **MongoDB**: localhost:27017

2. Stop services:
```bash
docker-compose down
```

3. Rebuild after dependency changes:
```bash
docker-compose up --build
```

### Local Development without Docker

```bash
cp .env.example .env          # then fill in Google, email, and secret values
npm install
npm install --prefix client
npm run dev                   # backend on :5001 (node --watch) + frontend on :3000 (Vite)
```

The Vite dev server proxies `/api` to `http://localhost:5001`, so keep `PORT=5001` in `.env`.

### Environment Variables

Docker Compose supplies development defaults; override them in a `.env` file at the repo root. See [.env.example](.env.example) for a template.

**Server**

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | | `development`, `test`, or `production` |
| `PORT` | | API port (default `5000`; use `5001` locally) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Prod | JWT signing secret (server refuses to start in production without it) |
| `JWT_EXPIRES_IN` | | JWT lifetime (default `7d`) |
| `SESSION_SECRET` | Prod | Cookie session secret (required in production) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | | OAuth callback (default `/api/auth/google/callback`) |
| `CLIENT_URL` | Yes | Frontend URL, used for CORS and OAuth redirects |
| `EMAIL_HOST` / `EMAIL_PORT` | | SMTP server (default `smtp-relay.brevo.com:2525`) |
| `EMAIL_USER` / `EMAIL_PASSWORD` | For email | SMTP credentials; email is disabled if unset |
| `EMAIL_FROM` | | Sender address (must be a verified sender in Brevo) |
| `ADMIN_EMAIL` | | Email automatically assigned the administrator role |
| `ADMIN_READER_EMAILS` | | Comma-separated emails assigned the read-only `admin_reader` role |
| `ALLOWED_DOMAIN` | Yes | Email domain allowed to sign in (no default; if unset, only allow-listed accounts can sign in) |
| `TEST_STUDENT_EMAIL_1` / `TEST_STUDENT_EMAIL_2` / `TEST_ADMIN_EMAIL` | | Local test accounts (development/test only) |

**Client**

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL (default `/api`, proxied by Vite in development) |

### Google OAuth Setup

Add these URLs to your Google Cloud Console OAuth configuration:

**Authorized JavaScript origins:**
```
http://localhost:3000
```

**Authorized redirect URIs:**
```
http://localhost:5001/api/auth/google/callback
```

If the OAuth consent screen is in **Testing** mode, add every account that needs to sign in (including admin readers outside your domain) as a test user. An **Internal** consent screen blocks accounts outside your Google Workspace organization.

### Running Tests

```bash
# Run all server tests (with coverage)
npm test

# Run without coverage (faster, lower memory)
npx jest --coverage=false

# Run a specific test file
npx jest server/tests/adminReader.test.js

# Verify the client compiles
npm run build
```

Server tests use an in-memory MongoDB, so no database needs to be running. The client has no unit tests yet; `npm run build` is the compile check.

### Database Migrations

One-time data migrations live in `server/migrations/` and run automatically at server startup, before the API accepts traffic. Each migration is recorded in the `migrations` collection and only runs once. To add one, create a dated file in `server/migrations/` and register it in `server/migrations/index.js`.

## Admin Reader (View As)

The `admin_reader` role is a read-only account for reviewing the site from any user's perspective.

**Granting the role**

- Add the email to `ADMIN_READER_EMAILS` (comma-separated, no quotes or brackets), e.g.
  `ADMIN_READER_EMAILS=reader1@example.edu,reader2@example.com`
- Listed emails may sign in with Google even if they are outside `ALLOWED_DOMAIN`.
- The role is synced on every Google sign-in: listed emails are promoted to `admin_reader`, and accounts removed from the list revert to their normal role. Users must sign out and back in after a change.

**Using it**

- A **View as…** button appears in the top bar. Choose a role tab (Students, Navigators, Admins), search, and pick a user.
- The entire site (menus, pages, permissions, and data) renders exactly as that user sees it, with a banner indicating the read-only preview. **Stop viewing** returns to the reader's own view.

**How it works**

- The client sends the selected user's ID in the `X-Impersonate-User-Id` header. The server only honors it when the authenticated account is an `admin_reader`; it is ignored for all other roles.
- All non-`GET` requests from an `admin_reader` are rejected with `403` on the server, whether or not they are impersonating. Only session endpoints under `/api/auth` (e.g. sign-out) are exempt.
- `admin_reader` accounts cannot be impersonated themselves, and inactive users cannot be selected.

## Production Deployment

Production infrastructure is managed with Terraform in the `infrastructure/` directory:

- **Frontend**: Vercel (free tier)
- **Backend**: Render (free tier)
- **Database**: MongoDB Atlas (free tier)

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your credentials

terraform init
terraform plan
terraform apply
```

- Render and Vercel auto-deploy on every push to `main`. The backend only redeploys when `server/**` or `package.json` changes.
- Render runs Node 24 (pinned by `engines` in `package.json`; required by Nodemailer 10).
- Terraform manages all backend environment variables on Render. Variables added only in the Render dashboard are removed on the next `terraform apply`, so add them to Terraform as well (e.g. `admin_reader_emails`).

See `infrastructure/README.md` for detailed deployment instructions.

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/local/register` - Register test account (dev only)
- `POST /api/auth/local/login` - Login with test account (dev only)
- `GET /api/auth/me` - Get current user (includes `realUser`/`isImpersonating` for admin readers)
- `GET /api/auth/check` - Check whether a token is valid
- `GET /api/auth/impersonatable-users` - List users an admin reader can view as (admin reader)
- `POST /api/auth/dismiss-phone-prompt` - Dismiss the phone number prompt
- `POST /api/auth/logout` - Logout

### Users
- `POST /api/users/register` - Manually register a user (navigator/admin)
- `GET /api/users` - Get all users (admin)
- `GET /api/users/navigators` - Get all navigators
- `GET /api/users/students` - Search students (navigator)
- `GET /api/users/my-students` - Get navigator's students
- `GET /api/users/export/emails` - Export student emails (navigator)
- `GET /api/users/:id` - Get user
- `PUT /api/users/:id` - Update user profile
- `PUT /api/users/:id/role` - Update user role (admin)
- `PUT /api/users/:id/assign-navigator` - Assign a navigator to a student
- `PUT /api/users/:id/availability` - Update a navigator's availability
- `PUT /api/users/:id/status` - Activate/deactivate user (admin)
- `DELETE /api/users/:id` - Delete user (admin)

### Meetings
- `GET /api/meetings` - Get meetings
- `GET /api/meetings/upcoming` - Get upcoming meetings
- `GET /api/meetings/:id` - Get meeting
- `POST /api/meetings` - Create meeting
- `PUT /api/meetings/:id` - Update meeting
- `PUT /api/meetings/:id/cancel` - Cancel meeting
- `PUT /api/meetings/:id/complete` - Mark as completed
- `PUT /api/meetings/:id/no-show` - Mark as no-show
- `DELETE /api/meetings/series/:id` - Delete a recurring series
- `PUT /api/meetings/series/:id/recurrence` - Update a series' recurrence

### Calendar
- `GET /api/calendar/events` - Get calendar events
- `GET /api/calendar/availability/:navigatorId` - Get navigator availability
- `GET /api/calendar/slots/:navigatorId` - Get available booking slots

### Availability
- `GET /api/availability` - Get own weekly availability (navigator)
- `PUT /api/availability` - Update own weekly availability (navigator)
- `GET /api/availability/user/:userId` - Get a user's availability
- `GET /api/availability/slots/:userId` - Get available slots for booking
- `POST /api/availability/blocks/:dayName` - Add an availability block
- `DELETE /api/availability/blocks/:dayName/:slotIndex` - Remove an availability block

### Notes
- `GET /api/notes` - Get notes
- `GET /api/notes/student/:studentId` - Get notes for a student
- `GET /api/notes/meeting/:meetingId` - Get notes for a meeting
- `GET /api/notes/:id` - Get note
- `POST /api/notes` - Create note
- `PUT /api/notes/:id` - Update note
- `PUT /api/notes/:id/share` - Share note with student
- `DELETE /api/notes/:id` - Delete note

### Reports
- `GET /api/reports` - Get reports
- `GET /api/reports/:id` - Get report
- `GET /api/reports/config/options` - Get available metrics, groupBy, and filter options
- `POST /api/reports/individual` - Generate individual student report
- `POST /api/reports/group` - Generate group report (multi-student)
- `POST /api/reports/session-history` - Generate session history report
- `POST /api/reports/custom` - Generate custom report with selected metrics/grouping
- `GET /api/reports/:id/export/:format` - Export report (pdf, xlsx, json)
- `DELETE /api/reports/:id` - Delete report

### Notifications
- `GET /api/notifications` - Get notifications
- `GET /api/notifications/unread-count` - Get unread count
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification
- `DELETE /api/notifications` - Delete all notifications

### Admin
- `GET /api/admin/quarters` - List school quarters (admin)
- `GET /api/admin/quarters/active` - Get the active quarter
- `POST /api/admin/quarters` - Create quarter (admin)
- `PUT /api/admin/quarters/:id` - Update quarter (admin)
- `PUT /api/admin/quarters/:id/activate` - Set active quarter (admin)
- `DELETE /api/admin/quarters/:id` - Delete quarter (admin)
- `GET /api/admin/jobs/stats` - Background job stats (admin)
- `GET /api/admin/jobs/failed` - Failed background jobs (admin)
- `POST /api/admin/jobs/:id/retry` - Retry a failed job (admin)
- `POST /api/admin/jobs/cleanup` - Clean up old jobs (admin)

### Health
- `GET /api/health` - Health check

## Test Accounts (Development Only)

Test accounts have no built-in defaults. Set them in `.env` to enable local email/password sign-in when `NODE_ENV` is `development` or `test`:

| Variable | Purpose |
|----------|---------|
| `TEST_STUDENT_EMAIL_1` | Test student account |
| `TEST_STUDENT_EMAIL_2` | Test student account |
| `TEST_ADMIN_EMAIL` | Test admin account (gets the administrator role only if it matches `ADMIN_EMAIL`) |

## Domain Restrictions

- Only accounts from `ALLOWED_DOMAIN` can sign in via Google OAuth
- Exceptions: emails listed in `ADMIN_READER_EMAILS`, and test accounts in development
- `ADMIN_EMAIL` is automatically assigned the administrator role
- None of these have code defaults; unset values grant nothing

## Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── public/
│   └── src/
│       ├── components/     # Reusable components (incl. admin/ViewAsSwitcher)
│       ├── contexts/       # React contexts (auth, notifications)
│       ├── pages/          # Page components
│       ├── services/       # API client
│       └── utils/          # Helpers
├── server/                 # Express backend
│   ├── config/             # Passport / auth configuration
│   ├── middleware/         # Auth, roles, read-only enforcement
│   ├── migrations/         # One-time data migrations (run at startup)
│   ├── models/             # Mongoose models
│   ├── repositories/       # Data access layer
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── tests/              # Jest tests
│   └── utils/              # Helpers
├── infrastructure/         # Terraform (Render, Vercel, MongoDB Atlas)
├── docker/                 # MongoDB init script
├── docker-compose.yml      # Local multi-container setup
├── Dockerfile.server       # Backend image
├── Dockerfile.client       # Frontend image
└── package.json            # Backend dependencies and scripts
```

## License

ISC
