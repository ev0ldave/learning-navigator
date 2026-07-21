# Learning Navigator

A comprehensive student-learning navigator scheduling and management application for educational institutions.

## Features

### User Roles

- **Administrator**: Full system access, user management, and all learning navigator capabilities
- **Learning Navigator**: Manage students, schedule meetings, create notes, generate reports
- **Student**: Book sessions, view calendar, manage profile

### Core Functionality

- **Meeting Management**: Schedule, reschedule, and cancel meetings with recurring support
- **Calendar Integration**: Google Calendar sync for automatic event management
- **Availability Management**: Set weekly availability hours for booking slots
- **Notes System**: Private and shared notes with email delivery to students
- **Reports**: Multi-dimensional reports with configurable metrics, grouping, and filters. In-app viewer with PDF/Excel export
- **Notifications**: Email and in-app notifications for meeting updates
- **Profile Management**: User profiles with notification preferences

## Tech Stack

- **Frontend**: React.js with Material-UI
- **Backend**: Node.js with Express.js
- **Database**: MongoDB
- **Authentication**: Google OAuth + Local (development)
- **Calendar**: Google Calendar API
- **Notifications**: Nodemailer
- **Testing**: Jest + Supertest
- **Local Development**: Docker + Docker Compose
- **Production Deployment**: Terraform (Vercel + Render + MongoDB Atlas)

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Google Cloud Console project (for OAuth and Calendar API)

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

### Environment Variables

The Docker setup uses sensible defaults for local development. To customize, you can set environment variables in `docker-compose.yml` or create a `.env` file:

- `MONGODB_URI`: MongoDB connection string (default: mongodb://mongodb:27017/learning-navigator)
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `JWT_SECRET`: Secret key for JWT tokens
- `SESSION_SECRET`: Secret key for sessions

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

### Running Tests

```bash
# Run all server tests
npm test

# Run specific test file
npm test -- --testPathPattern=server/tests/meetings

# Run with coverage
npm test -- --coverage
```

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

See `infrastructure/README.md` for detailed deployment instructions.

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `POST /api/auth/local/register` - Register test account (dev only)
- `POST /api/auth/local/login` - Login with test account (dev only)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users` - Get all users (admin)
- `GET /api/users/navigators` - Get all navigators
- `GET /api/users/my-students` - Get navigator's students
- `PUT /api/users/:id` - Update user profile
- `PUT /api/users/:id/role` - Update user role (admin)

### Meetings
- `GET /api/meetings` - Get meetings
- `POST /api/meetings` - Create meeting
- `PUT /api/meetings/:id` - Update meeting
- `PUT /api/meetings/:id/cancel` - Cancel meeting
- `PUT /api/meetings/:id/complete` - Mark as completed

### Calendar
- `GET /api/calendar/events` - Get calendar events
- `GET /api/calendar/availability/:navigatorId` - Get navigator availability
- `GET /api/calendar/slots/:navigatorId` - Get available booking slots

### Availability
- `GET /api/availability/weekly` - Get weekly availability hours
- `PUT /api/availability/weekly` - Update weekly availability hours
- `GET /api/availability/slots/:navigatorId` - Get available slots for booking

### Notes
- `GET /api/notes` - Get notes
- `POST /api/notes` - Create note
- `PUT /api/notes/:id/share` - Share note with student

### Reports
- `GET /api/reports` - Get reports
- `GET /api/reports/config/options` - Get available metrics, groupBy, and filter options
- `POST /api/reports/individual` - Generate individual student report
- `POST /api/reports/group` - Generate group report (multi-student)
- `POST /api/reports/custom` - Generate custom report with selected metrics/grouping
- `GET /api/reports/:id/export/:format` - Export report (pdf, xlsx, json)
- `DELETE /api/reports/:id` - Delete report

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

## Test Accounts (Development Only)

| Role | Email | Purpose |
|------|-------|---------|
| Student | 1411andrew@gmail.com | Test student account |
| Student | ev0ldave@gmail.com | Test student account |
| Administrator | trlandrew@students.highline.edu | Test admin account |

## Domain Restrictions

- Only accounts from `students.highline.edu` domain can register via Google OAuth
- `trlandrew@students.highline.edu` is automatically assigned administrator role

## Project Structure

```
├── client/                 # React frontend
│   ├── public/
│   └── src/
│       ├── components/     # Reusable components
│       ├── contexts/       # React contexts
│       ├── pages/          # Page components
│       └── services/       # API services
├── server/                 # Express backend
│   ├── config/            # Configuration
│   ├── middleware/        # Express middleware
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   └── tests/             # Jest tests
├── docker/                # Docker configuration
├── docker-compose.yml     # Multi-container setup
└── package.json           # Root dependencies
```

## License

ISC
