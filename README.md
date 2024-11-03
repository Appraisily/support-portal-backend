# Support Portal Backend

A Node.js backend service for customer support ticket management with PostgreSQL database.

## Database Configuration

PostgreSQL database is configured with:
- Instance: `support-portal-db`
- Database: `support_portal`
- User: `support_portal_user`
- Connection name: `civil-forge-403609:us-central1:support-portal-db`

## Secret Manager Configuration

The following secrets must be set in Google Cloud Secret Manager:

```bash
DB_HOST: /cloudsql/civil-forge-403609:us-central1:support-portal-db
DB_PORT: 5432
DB_NAME: support_portal
DB_USER: support_portal_user
DB_PASSWORD: T9@mX#5bQ
CLOUD_SQL_CONNECTION_NAME: civil-forge-403609:us-central1:support-portal-db
```

## Deployment

The application is configured to deploy to Cloud Run with:
- Memory: 512Mi
- CPU: 1
- Min instances: 1
- Max instances: 10
- Port: 8080
- Cloud SQL connection
- Environment variables
- Secrets mapping
- VPC connector for Cloud SQL

### Deployment Process

1. Cloud Build automatically:
   - Builds the Docker image
   - Pushes it to Container Registry
   - Deploys to Cloud Run with all configurations
   - Connects to Cloud SQL automatically

### Health Check

After deployment, verify the service using the health check endpoint:
```
https://[cloud-run-url]/_health
```

Note: First request might take a few seconds for container initialization and database connection.