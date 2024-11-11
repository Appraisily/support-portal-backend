# Ticket API Integration Guide

## List Tickets

```javascript
// GET /api/tickets
const listTickets = async (params = {}) => {
  const {
    status,          // optional: 'open' | 'solved' | 'pending'
    page = 1,        // optional: default 1
    limit = 10,      // optional: default 10
    priority,        // optional: 'low' | 'medium' | 'high' | 'urgent'
    assignedToId     // optional: User ID
  } = params;

  const queryParams = new URLSearchParams();
  if (status) queryParams.append('status', status);
  if (page) queryParams.append('page', page);
  if (limit) queryParams.append('limit', limit);
  if (priority) queryParams.append('priority', priority);
  if (assignedToId) queryParams.append('assignedToId', assignedToId);

  const response = await fetch(`/api/tickets?${queryParams}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch tickets');
  }

  return response.json();
}

// Example usage:
try {
  const result = await listTickets({
    status: 'open',
    page: 1,
    limit: 10
  });

  // Result structure:
  // {
  //   tickets: [{
  //     id: string,
  //     subject: string,
  //     status: 'open' | 'solved' | 'pending',
  //     priority: 'low' | 'medium' | 'high' | 'urgent',
  //     category: string,
  //     customer: {
  //       id: string,
  //       name: string,
  //       email: string,
  //       avatar: string
  //     },
  //     assignedTo: {
  //       id: string,
  //       name: string,
  //       email: string
  //     },
  //     createdAt: string,
  //     updatedAt: string
  //   }],
  //   total: number,
  //   page: number,
  //   totalPages: number
  // }
} catch (error) {
  console.error('Error fetching tickets:', error);
}

## Get Single Ticket

```javascript
// GET /api/tickets/:id
const getTicket = async (ticketId) => {
  const response = await fetch(`/api/tickets/${ticketId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ticket');
  }

  return response.json();
}

## Create Ticket

```javascript
// POST /api/tickets
const createTicket = async (ticketData) => {
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject: ticketData.subject,        // required
      category: ticketData.category,      // required
      priority: ticketData.priority,      // optional
      customerId: ticketData.customerId   // required
    })
  });

  if (!response.ok) {
    throw new Error('Failed to create ticket');
  }

  return response.json();
}

## Update Ticket

```javascript
// PATCH /api/tickets/:id
const updateTicket = async (ticketId, updates) => {
  const response = await fetch(`/api/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: updates.status,           // optional
      priority: updates.priority,       // optional
      assignedToId: updates.assignedToId // optional
    })
  });

  if (!response.ok) {
    throw new Error('Failed to update ticket');
  }

  return response.json();
}

## Reply to Ticket

```javascript
// POST /api/tickets/:id/reply
const replyToTicket = async (ticketId, replyData) => {
  const response = await fetch(`/api/tickets/${ticketId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: replyData.content,       // required
      attachments: replyData.attachments // optional
    })
  });

  if (!response.ok) {
    throw new Error('Failed to reply to ticket');
  }

  return response.json();
}
```

## Error Handling

The API returns standard HTTP status codes:

- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

Error responses have this structure:
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Error message here"
}
```

## Authentication

All requests must include a valid JWT token in the Authorization header:
```javascript
headers: {
  'Authorization': `Bearer ${accessToken}`
}
```

## Rate Limiting

The API has rate limiting in place:
- 100 requests per 15 minutes per IP
- When limit is exceeded, receives 429 Too Many Requests