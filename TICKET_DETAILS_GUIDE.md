## Ticket Details Integration Guide

### 1. API Endpoint

```typescript
interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'solved' | 'pending';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  customer: {
    id: string;
    name: string;
    email: string;
    avatar: string;
  };
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  };
  messages: Array<{
    id: string;
    content: string;
    direction: 'inbound' | 'outbound';
    internal: boolean;
    createdAt: string;
    author?: {
      id: string;
      name: string;
      email: string;
    };
    attachments: Array<{
      id: string;
      name: string;
      url: string;
      type: string;
      size: number;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Function to fetch ticket details
const getTicketDetails = async (ticketId: string): Promise<Ticket> => {
  const response = await fetch(`/api/tickets/${ticketId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ticket details');
  }

  return response.json();
};

// Function to generate AI reply suggestion
const generateAIReply = async (ticketId: string) => {
  const response = await fetch(`/api/tickets/${ticketId}/generate-reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to generate AI reply');
  }

  return response.json();
};
```

### 2. React Component Implementation

```tsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const TicketDetails: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTicketDetails = async () => {
      try {
        const data = await getTicketDetails(ticketId);
        setTicket(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadTicketDetails();
  }, [ticketId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Ticket Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">{ticket.subject}</h1>
            <div className="flex gap-4 text-sm text-gray-600">
              <span>ID: {ticket.id}</span>
              <span>Status: {ticket.status}</span>
              <span>Priority: {ticket.priority}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={async () => {
                const { suggestedReply } = await generateAIReply(ticket.id);
                // Handle the AI reply suggestion
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Generate AI Reply
            </button>
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center gap-4">
          <img 
            src={ticket.customer.avatar} 
            alt={ticket.customer.name}
            className="w-12 h-12 rounded-full"
          />
          <div>
            <h2 className="font-semibold">{ticket.customer.name}</h2>
            <p className="text-gray-600">{ticket.customer.email}</p>
          </div>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="space-y-4">
        {ticket.messages.map((message) => (
          <div 
            key={message.id}
            className={`p-4 rounded-lg ${
              message.direction === 'inbound' 
                ? 'bg-gray-100 ml-4' 
                : 'bg-blue-50 mr-4'
            }`}
          >
            <div className="flex justify-between mb-2">
              <span className="font-medium">
                {message.author?.name || 'System'}
              </span>
              <span className="text-sm text-gray-500">
                {new Date(message.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{message.content}</p>
            
            {/* Attachments */}
            {message.attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                  >
                    📎 {attachment.name} ({formatFileSize(attachment.size)})
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mt-6">
        <form onSubmit={handleSubmit}>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            className="w-full p-3 border rounded-lg"
            rows={4}
            placeholder="Type your reply..."
          />
          
          <div className="flex justify-between mt-4">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="text-sm"
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-6 py-2 rounded"
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Utility function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default TicketDetails;
```

### 3. Estado Global (usando Redux)

```typescript
// ticketSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchTicketDetails = createAsyncThunk(
  'ticket/fetchDetails',
  async (ticketId: string) => {
    const response = await getTicketDetails(ticketId);
    return response;
  }
);

export const sendTicketReply = createAsyncThunk(
  'ticket/sendReply',
  async ({ ticketId, content }: { ticketId: string; content: string }) => {
    const response = await fetch(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    return response.json();
  }
);

const ticketSlice = createSlice({
  name: 'ticket',
  initialState: {
    currentTicket: null,
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTicketDetails.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTicketDetails.fulfilled, (state, action) => {
        state.currentTicket = action.payload;
        state.loading = false;
      })
      .addCase(fetchTicketDetails.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      });
  }
});

export default ticketSlice.reducer;
```

### 4. Actualizaciones en Tiempo Real (usando WebSocket)

```typescript
// websocket.ts
const setupTicketWebSocket = (ticketId: string, dispatch: any) => {
  const ws = new WebSocket(`wss://api.example.com/ws/tickets/${ticketId}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'message_added':
        dispatch(addMessage(data.message));
        break;
      case 'ticket_updated':
        dispatch(updateTicket(data.ticket));
        break;
    }
  };

  return () => {
    ws.close();
  };
};

// En el componente
useEffect(() => {
  const cleanup = setupTicketWebSocket(ticketId, dispatch);
  return cleanup;
}, [ticketId]);
```

### 5. Manejo de Errores

```typescript
const ErrorBoundary: React.FC = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (error: Error) => {
      setHasError(true);
      setError(error);
      // Log error to service
      logError(error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-red-800 font-bold">Something went wrong</h2>
        <p className="text-red-600">{error?.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-red-700 underline"
        >
          Reload page
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
```

### 6. Optimizaciones de Rendimiento

```typescript
// Memoización de componentes pesados
const MessageThread = React.memo(({ messages }: { messages: Message[] }) => {
  return (
    <div className="space-y-4">
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
});

// Paginación de mensajes
const useMessagePagination = (ticketId: string) => {
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    const newMessages = await fetchMessages(ticketId, page);
    setMessages(prev => [...prev, ...newMessages]);
    setHasMore(newMessages.length === 20); // 20 es el tamaño de página
    setPage(prev => prev + 1);
  };

  return { messages, loadMore, hasMore };
};
```