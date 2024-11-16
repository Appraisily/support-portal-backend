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

## API Documentation

### List Tickets

```
GET /api/tickets
```

Query Parameters (all optional):
- `status`: 'open' | 'in_progress' | 'closed'
- `page`: number (default: 1)
- `limit`: number (default: 10)
- `sortBy`: string (default: 'lastMessageAt')
- `sortOrder`: 'asc' | 'desc'
- `search`: string
- `searchFields`: string[] (default: ['email', 'subject', 'content'])

Expected Response:
```json
{
  "success": true,
  "data": {
    "tickets": [
      {
        "id": string,
        "subject": string,
        "status": "open" | "in_progress" | "closed",
        "priority": "low" | "medium" | "high" | "urgent",
        "category": string,
        "customer": {
          "id": string,
          "name": string,
          "email": string
        },
        "messages": [
          {
            "id": string,
            "content": string,
            "direction": "inbound" | "outbound",
            "createdAt": string,
            "attachments?": [
              {
                "id": string,
                "name": string,
                "url": string
              }
            ]
          }
        ],
        "createdAt": string,
        "updatedAt": string,
        "lastMessageAt": string
      }
    ],
    "pagination": {
      "total": number,
      "page": number,
      "totalPages": number,
      "limit": number
    }
  }
}
```

Note: The frontend maps the backend statuses as follows:
- 'open' → 'pending'
- 'in_progress' → 'in_progress'
- 'closed' → 'closed'

### Get Single Ticket

```
GET /api/tickets/:id
```

Required Path Parameter:
- `id`: string (ticket ID)

Expected Response:
```json
{
  "success": true,
  "data": {
    "id": string,
    "subject": string,
    "status": "open" | "in_progress" | "closed",
    "priority": "low" | "medium" | "high" | "urgent",
    "category": string,
    "customer": {
      "id": string,
      "name": string,
      "email": string
    },
    "messages": [
      {
        "id": string,
        "content": string,
        "direction": "inbound" | "outbound",
        "createdAt": string,
        "attachments": [
          {
            "id": string,
            "name": string,
            "url": string
          }
        ]
      }
    ],
    "customerInfo": {
      "sales": [
        {
          "sessionId": string,
          "chargeId": string,
          "stripeCustomerId": string,
          "customerName": string,
          "amount": number,
          "date": string
        }
      ],
      "pendingAppraisals": [
        {
          "date": string,
          "serviceType": string,
          "sessionId": string,
          "status": string,
          "editLink": string
        }
      ],
      "completedAppraisals": [
        {
          "date": string,
          "serviceType": string,
          "sessionId": string,
          "status": string,
          "editLink": string,
          "appraisersDescription": string,
          "finalDescription": string,
          "pdfLink": string,
          "docLink": string
        }
      ],
      "summary": {
        "totalPurchases": number,
        "totalSpent": number,
        "hasPendingAppraisals": boolean,
        "hasCompletedAppraisals": boolean,
        "totalAppraisals": number,
        "isExistingCustomer": boolean,
        "lastPurchaseDate": string,
        "stripeCustomerId": string
      }
    },
    "createdAt": string,
    "updatedAt": string,
    "lastMessageAt": string,
    "gmailThreadId": string
  }
}
```

The response includes all ticket details, messages history, customer information, sales history, and appraisals data needed to display the full ticket view in the frontend.

### Generate AI Reply

```
POST /api/email/generate-ticket-reply/:ticketId
```

Required Path Parameter:
- `ticketId`: string (ID of the ticket)

Required Headers:
- `Authorization`: Bearer token for authentication
- `Content-Type`: application/json

Expected Response:
```json
{
  "success": true,
  "ticketId": string,
  "generatedReply": string
}
```

The backend will:
1. Fetch the ticket details including all messages
2. Get customer information from spreadsheets
3. Format all context for OpenAI
4. Generate response using GPT-4
5. Return the generated response

Error Response (400, 401, 404, 500):
```json
{
  "success": false,
  "message": string
}
```

### OpenAI Integration Notes

The OpenAI chat completion endpoint requires a specific format for messages. Here's an example of the expected format:

```bash
curl "https://api.openai.com/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d '{
        "model": "gpt-4",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": "Write a haiku about recursion in programming."
            }
        ]
    }'
```

Important: The OpenAI service has been updated to match this exact format. Messages are now sent as an array of objects with `role` and `content` properties, rather than using the deprecated format. The service automatically formats ticket messages and context to match this structure before making the API call.