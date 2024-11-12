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
    this.appraisalsSpreadsheetId = null;
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
      this.initialized = true;
    }
  }

  async _initialize() {
    try {
      // Get spreadsheet IDs from Secret Manager and clean them
      [
        this.salesSpreadsheetId,
        this.appraisalsSpreadsheetId
      ] = await Promise.all([
        secretManager.getSecret('SALES_SPREADSHEET_ID'),
        secretManager.getSecret('PENDING_APPRAISALS_SPREADSHEET_ID')
      ]);

      // Clean spreadsheet IDs (remove any whitespace or newlines)
      this.salesSpreadsheetId = this.salesSpreadsheetId?.trim();
      this.appraisalsSpreadsheetId = this.appraisalsSpreadsheetId?.trim();

      if (!this.salesSpreadsheetId || !this.appraisalsSpreadsheetId) {
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

      logger.info('Sheets service initialized successfully', {
        salesSpreadsheetId: this.salesSpreadsheetId,
        appraisalsSpreadsheetId: this.appraisalsSpreadsheetId
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
        spreadsheetId: this.appraisalsSpreadsheetId,
        range: "'Pending Appraisals'!A2:O",
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      // Process pending appraisals - Column D (index 3) is Customer Email
      const pendingRows = pendingResponse.data.values || [];
      const pendingAppraisals = pendingRows
        .filter(row => row[3]?.toString().toLowerCase() === normalizedEmail)
        .map(row => ({
          date: row[0],
          serviceType: row[1],
          sessionId: row[2],
          status: row[5],
          editLink: row[6],
          imageDescription: row[7],
          customerDescription: row[8],
          value: row[9]
        }));

      // Get completed appraisals
      const completedResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.appraisalsSpreadsheetId,
        range: "'Completed Appraisals'!A2:O",
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      // Process completed appraisals - Column D (index 3) is Customer Email
      const completedRows = completedResponse.data.values || [];
      const completedAppraisals = completedRows
        .filter(row => row[3]?.toString().toLowerCase() === normalizedEmail)
        .map(row => ({
          date: row[0],
          serviceType: row[1],
          sessionId: row[2],
          status: row[5],
          editLink: row[6],
          imageDescription: row[7],
          customerDescription: row[8],
          value: row[9],
          appraisersDescription: row[10],
          finalDescription: row[11],
          pdfLink: row[12],
          docLink: row[13]
        }));

      // Calculate summary
      const totalSpent = sales.reduce((sum, sale) => sum + sale.amount, 0);
      const lastPurchase = sales[0];
      const stripeCustomerId = lastPurchase?.stripeCustomerId;

      const summary = {
        totalPurchases: sales.length,
        totalSpent,
        hasPendingAppraisals: pendingAppraisals.length > 0,
        hasCompletedAppraisals: completedAppraisals.length > 0,
        totalAppraisals: pendingAppraisals.length + completedAppraisals.length,
        isExistingCustomer: sales.length > 0,
        lastPurchaseDate: lastPurchase?.date || null,
        stripeCustomerId: stripeCustomerId || null
      };

      logger.info('Customer info retrieved successfully', {
        email,
        salesCount: sales.length,
        pendingAppraisalsCount: pendingAppraisals.length,
        completedAppraisalsCount: completedAppraisals.length,
        totalSpent
      });

      return { 
        sales, 
        pendingAppraisals, 
        completedAppraisals,
        summary 
      };

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
      completedAppraisals: [],
      summary: {
        totalPurchases: 0,
        totalSpent: 0,
        hasPendingAppraisals: false,
        hasCompletedAppraisals: false,
        totalAppraisals: 0,
        isExistingCustomer: false,
        lastPurchaseDate: null,
        stripeCustomerId: null
      }
    };
  }
}

module.exports = new SheetsService();