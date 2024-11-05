const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');

async function setup() {
  try {
    // 1. Configurar autenticación
    const auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/pubsub',
        'https://www.googleapis.com/auth/gmail.settings.basic'
      ]
    });

    // 2. Obtener cliente autenticado
    const client = await auth.getClient();
    console.log('Authentication successful');

    // 3. Configurar Gmail API
    const gmail = google.gmail({
      version: 'v1',
      auth: client
    });

    // 4. Verificar permisos de Pub/Sub
    const pubsub = new PubSub();
    const [topics] = await pubsub.getTopics();
    console.log('Available topics:', topics.map(t => t.name));

    // 5. Configurar watch
    const response = await gmail.users.watch({
      userId: 'info@appraisily.com',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/civil-forge-403609/topics/gmail-notifications`,
        labelFilterAction: 'include'
      }
    });

    console.log('Watch setup successful:', response.data);
  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
}

setup().catch(console.error); 