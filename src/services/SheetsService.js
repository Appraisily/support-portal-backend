const { google } = require('googleapis');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

class SheetsService {
  constructor() {
    this.sheets = null;
    this.initialized = false;
    this.initPromise = null;
    this.salesSpreadsheetId = null;
    this.pendingAppraisalsSpreadsheetId = null;
    this.auth = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      this.initPromise = null;
      logger.error('Sheets service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async _initialize() {
    try {
      // Get spreadsheet IDs from Secret Manager
      [this.salesSpreadsheetId, this.pendingAppraisalsSpreadsheetId] = await Promise.all([
        secretManager.getSecret('SALES_SPREADSHEET_ID'),
        secretManager.getSecret('PENDING_APPRAISALS_SPREADSHEET_ID')
      ]);

      if (!this.salesSpreadsheetId || !this.pendingAppraisalsSpreadsheetId) {
        throw new Error('Spreadsheet IDs not configured');
      }

      // Initialize auth with service account credentials
      this.auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });

      // Initialize sheets API
      this.sheets = google.sheets({ 
        version: 'v4', 
        auth: this.auth 
      });

      // Verify access to spreadsheets
      await this._verifyAccess();

      logger.info('Sheets service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Sheets service:', error);
      throw error;
    }
  }

  async _verifyAccess() {
    try {
      // Try to access both spreadsheets to verify permissions
      await Promise.all([
        this.sheets.spreadsheets.get({
          spreadsheetId: this.salesSpreadsheetId,
          fields: 'spreadsheetId'
        }),
        this.sheets.spreadsheets.get({
          spreadsheetId: this.pendingAppraisalsSpreadsheetId,
          fields: 'spreadsheetId'
        })
      ]);
    } catch (error) {
      throw new Error(`Failed to verify spreadsheet access: ${error.message}`);
    }
  }

  async getCustomerInfo(email) {
    await this.ensureInitialized();

    try {
      logger.info('Getting customer info from sheets', { email });
      const normalizedEmail = email.toLowerCase();

      // Get sales data
      const salesResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.salesSpreadsheetId,
        range: 'Sales!A2:G', // Assuming headers are in row 1
        valueRenderOption: 'UNFORMATTED_VALUE'
      }).catch(error => {
        logger.error('Error fetching sales data:', {
          error: error.message,
          spreadsheetId: this.salesSpreadsheetId
        });
        return { data: { values: [] } };
      });

      const salesRows = salesResponse.data.values || [];
      const sales = salesRows
        .filter(row => row[4]?.toString().toLowerCase() === normalizedEmail) // Column E is Customer email
        .map(row => ({
          sessionId: row[0],
          chargeId: row[1],
          stripeCustomerId: row[2],
          customerName: row[3],
          amount: parseFloat(row[5] || '0'),
          date: row[6]
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      // Get pending appraisals
      const pendingResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.pendingAppraisalsSpreadsheetId,
        range: 'Sheet1!A2:D' // Assuming headers are in row 1
      }).catch(error => {
        logger.error('Error fetching pending appraisals:', {
          error: error.message,
          spreadsheetId: this.pendingAppraisalsSpreadsheetId
        });
        return { data: { values: [] } };
      });

      const pendingRows = pendingResponse.data.values || [];
      const pendingAppraisals = pendingRows
        .filter(row => row[1]?.toString().toLowerCase() === normalizedEmail) // Column B is Email
        .map(row => ({
          date: row[0],
          type: row[2],
          status: row[3]
        }));

      // Calculate summary
      const totalSpent = sales.reduce((sum, sale) => sum + sale.amount, 0);
      const lastPurchase = sales[0];
      const stripeCustomerId = lastPurchase?.stripeCustomerId;

      logger.info('Customer info retrieved', {
        email,
        salesCount: sales.length,
        pendingAppraisalsCount: pendingAppraisals.length,
        totalSpent
      });

      return {
        sales,
        pendingAppraisals,
        summary: {
          totalPurchases: sales.length,
          totalSpent,
          hasPendingAppraisals: pendingAppraisals.length > 0,
          isExistingCustomer: sales.length > 0,
          lastPurchaseDate: lastPurchase?.date || null,
          stripeCustomerId: stripeCustomerId || null
        }
      };

    } catch (error) {
      logger.error('Error getting customer info from sheets:', {
        error: error.message,
        email
      });
      // Return empty data structure instead of throwing
      return {
        sales: [],
        pendingAppraisals: [],
        summary: {
          totalPurchases: 0,
          totalSpent: 0,
          hasPendingAppraisals: false,
          isExistingCustomer: false,
          lastPurchaseDate: null,
          stripeCustomerId: null
        }
      };
    }
  }
}

module.exports = new SheetsService();