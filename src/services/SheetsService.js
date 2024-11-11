const { google } = require('googleapis');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

class SheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.initialized = false;
    this.initPromise = null;
    this.salesSpreadsheetId = null;
    this.pendingAppraisalsSpreadsheetId = null;
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
      // Don't throw, allow service to continue with limited functionality
      this.initialized = true;
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
        logger.error('Missing spreadsheet IDs');
        return;
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

      logger.info('Sheets service initialized successfully', {
        salesSpreadsheetId: this.salesSpreadsheetId,
        pendingAppraisalsSpreadsheetId: this.pendingAppraisalsSpreadsheetId
      });
    } catch (error) {
      logger.error('Failed to initialize Sheets service:', {
        error: error.message,
        stack: error.stack,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });
      throw error;
    }
  }

  async _verifyAccess() {
    try {
      // Try to access both spreadsheets to verify permissions
      const [salesResponse, pendingResponse] = await Promise.allSettled([
        this.sheets.spreadsheets.get({
          spreadsheetId: this.salesSpreadsheetId,
          fields: 'spreadsheetId,properties.title'
        }),
        this.sheets.spreadsheets.get({
          spreadsheetId: this.pendingAppraisalsSpreadsheetId,
          fields: 'spreadsheetId,properties.title'
        })
      ]);

      // Log access verification results
      logger.info('Spreadsheet access verification:', {
        sales: salesResponse.status === 'fulfilled' ? 'success' : 'failed',
        pending: pendingResponse.status === 'fulfilled' ? 'success' : 'failed',
        salesError: salesResponse.status === 'rejected' ? salesResponse.reason.message : null,
        pendingError: pendingResponse.status === 'rejected' ? pendingResponse.reason.message : null
      });

      if (salesResponse.status === 'rejected' || pendingResponse.status === 'rejected') {
        throw new Error('Failed to verify access to one or more spreadsheets');
      }
    } catch (error) {
      logger.error('Spreadsheet access verification failed:', {
        error: error.message,
        salesSpreadsheetId: this.salesSpreadsheetId,
        pendingAppraisalsSpreadsheetId: this.pendingAppraisalsSpreadsheetId
      });
      throw error;
    }
  }

  async getCustomerInfo(email) {
    try {
      await this.ensureInitialized();
      
      if (!this.sheets) {
        logger.warn('Sheets service not properly initialized, returning empty data');
        return this._getEmptyCustomerData();
      }

      const normalizedEmail = email.toLowerCase();
      logger.info('Getting customer info from sheets', { email });

      // Get sales data
      const salesResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.salesSpreadsheetId,
        range: 'Sales!A2:G',
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
        .filter(row => row[4]?.toString().toLowerCase() === normalizedEmail)
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
        range: 'Sheet1!A2:D'
      }).catch(error => {
        logger.error('Error fetching pending appraisals:', {
          error: error.message,
          spreadsheetId: this.pendingAppraisalsSpreadsheetId
        });
        return { data: { values: [] } };
      });

      const pendingRows = pendingResponse.data.values || [];
      const pendingAppraisals = pendingRows
        .filter(row => row[1]?.toString().toLowerCase() === normalizedEmail)
        .map(row => ({
          date: row[0],
          type: row[2],
          status: row[3]
        }));

      // Calculate summary
      const totalSpent = sales.reduce((sum, sale) => sum + sale.amount, 0);
      const lastPurchase = sales[0];
      const stripeCustomerId = lastPurchase?.stripeCustomerId;

      const summary = {
        totalPurchases: sales.length,
        totalSpent,
        hasPendingAppraisals: pendingAppraisals.length > 0,
        isExistingCustomer: sales.length > 0,
        lastPurchaseDate: lastPurchase?.date || null,
        stripeCustomerId: stripeCustomerId || null
      };

      logger.info('Customer info retrieved successfully', {
        email,
        salesCount: sales.length,
        pendingAppraisalsCount: pendingAppraisals.length,
        totalSpent
      });

      return { sales, pendingAppraisals, summary };

    } catch (error) {
      logger.error('Error getting customer info from sheets:', {
        error: error.message,
        email
      });
      return this._getEmptyCustomerData();
    }
  }

  _getEmptyCustomerData() {
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

module.exports = new SheetsService();