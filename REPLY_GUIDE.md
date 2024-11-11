# Ticket Reply Integration Guide

## Frontend Implementation

```typescript
interface ReplyData {
  content: string;
  attachments?: File[];
}

// Function to send reply
const sendTicketReply = async (ticketId: string, replyData: ReplyData) => {
  // First upload attachments if any
  let attachmentIds = [];
  if (replyData.attachments?.length) {
    attachmentIds = await Promise.all(
      replyData.attachments.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ticketId', ticketId);

        const response = await fetch('/api/attachments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error('Failed to upload attachment');
        }

        const { attachment } = await response.json();
        return attachment.id;
      })
    );
  }

  // Send reply with attachments
  const response = await fetch(`/api/tickets/${ticketId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: replyData.content,
      attachments: attachmentIds
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send reply');
  }

  return response.json();
};

// Example React component
const TicketReply: React.FC<{ ticketId: string }> = ({ ticketId }) => {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      await sendTicketReply(ticketId, {
        content,
        attachments: files
      });

      // Clear form after successful send
      setContent('');
      setFiles([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type your reply..."
        required
      />

      <input
        type="file"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
      />

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={sending}>
        {sending ? 'Sending...' : 'Send Reply'}
      </button>
    </form>
  );
};
```

## Backend Response Flow

1. El frontend envía la respuesta al endpoint `/api/tickets/:id/reply`
2. El backend:
   - Guarda la respuesta en la base de datos
   - Actualiza el estado del ticket
   - Envía el email al cliente
   - Retorna confirmación al frontend

## Email Templates

El backend utiliza plantillas predefinidas para los emails:

```typescript
interface EmailTemplate {
  subject: string;
  content: string;
}

const getReplyEmailTemplate = (ticketData: any, replyContent: string): EmailTemplate => ({
  subject: `Re: ${ticketData.subject} [Ticket #${ticketData.id}]`,
  content: `
    Dear ${ticketData.customer.name},

    ${replyContent}

    Best regards,
    Support Team

    --- Original Ticket ---
    Ticket ID: ${ticketData.id}
    Subject: ${ticketData.subject}
    Status: ${ticketData.status}
  `
});
```

## Manejo de Archivos Adjuntos

1. Los archivos se suben primero a `/api/attachments`
2. Se obtienen los IDs de los archivos subidos
3. Los IDs se incluyen en la petición de respuesta
4. El backend:
   - Asocia los archivos con la respuesta
   - Incluye links a los archivos en el email

## Estados de la Respuesta

```typescript
type ReplyStatus = 
  | 'sending'      // Frontend está enviando la respuesta
  | 'processing'   // Backend está procesando
  | 'sent'         // Email enviado exitosamente
  | 'failed'       // Error en algún punto del proceso

interface ReplyResponse {
  success: boolean;
  message: {
    id: string;
    content: string;
    createdAt: string;
    attachments: Array<{
      id: string;
      name: string;
      url: string;
    }>;
  };
  emailStatus: {
    sent: boolean;
    error?: string;
  };
}
```

## Manejo de Errores

```typescript
try {
  const result = await sendTicketReply(ticketId, replyData);
  
  if (result.success) {
    // Respuesta enviada correctamente
    showSuccess('Reply sent successfully');
    if (!result.emailStatus.sent) {
      // Email fallido pero respuesta guardada
      showWarning('Reply saved but email delivery delayed');
    }
  }
} catch (error) {
  // Manejar diferentes tipos de error
  if (error.status === 413) {
    showError('Attachment size too large');
  } else if (error.status === 429) {
    showError('Too many replies, please wait');
  } else {
    showError('Failed to send reply');
  }
}
```

## Eventos y Notificaciones

El frontend puede escuchar eventos de WebSocket para actualizaciones en tiempo real:

```typescript
const socket = new WebSocket('wss://api.example.com/ws');

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'reply_status_update') {
    updateReplyStatus(data.ticketId, data.status);
  }
});
```