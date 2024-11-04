class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    // ...
  }

  async handleWebhook(messageData) {
    // Procesa nuevos emails cuando Gmail envía una notificación
  }

  async processEmailThread(threadId, messageData) {
    // Procesa el hilo completo del email
  }

  async setupGmailWatch() {
    try {
      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`
        }
      });

      logger.info('Gmail watch setup successfully:', response.data);
      return response.data;
    } catch (error) {
      logger.error('Failed to setup Gmail watch:', error);
      throw error;
    }
  }

  async handleNewEmail(emailId) {
    try {
      const email = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId
      });

      const headers = email.data.payload.headers;
      const to = headers.find(h => h.name === 'To')?.value;
      
      // Solo procesar emails enviados a info@appraisily.com
      if (!to?.includes('info@appraisily.com')) {
        return;
      }

      const subject = headers.find(h => h.name === 'Subject')?.value;
      const from = headers.find(h => h.name === 'From')?.value;
      const content = this.extractEmailContent(email.data.payload);

      // Crear ticket
      const models = await getModels();
      
      // Extraer email del remitente
      const emailMatch = from.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : from;

      // Buscar o crear cliente
      let customer = await models.Customer.findOne({ 
        where: { email: senderEmail } 
      });

      if (!customer) {
        customer = await models.Customer.create({
          email: senderEmail,
          name: from.split('<')[0].trim()
        });
      }

      // Crear ticket
      const ticket = await models.Ticket.create({
        subject: subject || 'Sin asunto',
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailThreadId: email.data.threadId
      });

      // Crear mensaje inicial
      await models.Message.create({
        content,
        ticketId: ticket.id,
        author: 'customer'
      });

      logger.info(`New ticket created from email: ${ticket.id}`);
      return ticket;
    } catch (error) {
      logger.error('Error processing new email:', error);
      throw error;
    }
  }
}

// Inicializar servicio de Gmail y configurar watch
if (process.env.NODE_ENV === 'production') {
  GmailService.setupGmail()
    .then(() => GmailService.setupGmailWatch())
    .then(() => {
      logger.info('Gmail watch setup completed');
    })
    .catch(error => {
      logger.error('Failed to setup Gmail watch:', error);
    });
} 