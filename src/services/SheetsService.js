const { google } = require('googleapis');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const ApiError = require('../utils/apiError');

class SheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.initialized = false;
    this.initPromise = null;
    this.salesSpreadsheetId = null;
    this.appraisalsSpreadsheetId = null;
    this.mockMode = process.env.NODE_ENV !== 'production';
    this.initializationError = null;
  }

  async ensureInitialized() {
    // If already initialized successfully, return true
    if (this.initialized && !this.initializationError) {
      return true;
    }

    // If there's a pending initialization, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
      this.initializationError = null;
      return true;
    } catch (error) {
      this.initPromise = null;
      this.initializationError = error;

      // In development, continue in mock mode
      if (this.mockMode) {
        logger.warn('Running in mock mode due to initialization failure', {
          error: error.message
        });
        this.initialized = true;
        return true;
      }

      throw error;
    }
  }

  async _initialize() {
    try {
      // Get spreadsheet IDs
      [
        this.salesSpreadsheetId,
        this.appraisalsSpreadsheetId
      ] = await Promise.all([
        secretManager.getSecret('SALES_SPREADSHEET_ID'),
        secretManager.getSecret('PENDING_APPRAISALS_SPREADSHEET_ID')
      ]);

      // Clean spreadsheet IDs
      this.salesSpreadsheetId = this.salesSpreadsheetId?.trim();
      this.appraisalsSpreadsheetId = this.appraisalsSpreadsheetId?.trim();

      if (!this.salesSpreadsheetId || !this.appraisalsSpreadsheetId) {
        if (this.mockMode) {
          logger.warn('Missing spreadsheet IDs, using mock values');
          this.salesSpreadsheetId = 'mock-sales-sheet';
          this.appraisalsSpreadsheetId = 'mock-appraisals-sheet';
        } else {
          throw new ApiError(503, 'Missing spreadsheet IDs in Secret Manager');
        }
      }

      // Initialize auth with default credentials (uses service account in Cloud Run)
      this.auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      // Initialize sheets API
      this.sheets = google.sheets({ 
        version: 'v4', 
        auth: this.auth 
      });

      logger.info('Sheets service initialized successfully', {
        salesSpreadsheetId: this.salesSpreadsheetId,
        appraisalsSpreadsheetId: this.appraisalsSpreadsheetId,
        mode: this.mockMode ? 'mock' : 'production'
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize Sheets service:', {
        error: error.message,
        stack: error.stack,
        isAuthError: error.message.includes('authentication')
      });

      // Store initialization error
      this.initializationError = error;

      // In development, continue in mock mode
      if (this.mockMode) {
        return true;
      }

      throw error;
    }
  }

  async getCustomerInfo(email) {
    try {
      // Check initialization status first
      if (this.initializationError && !this.mockMode) {
        throw this.initializationError;
      }

      await this.ensureInitialized();

      if (!email) {
        logger.warn('No email provided for customer info lookup');
        return this._getEmptyCustomerData();
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      logger.info('Getting customer info from sheets', { 
        email: normalizedEmail,
        mode: this.mockMode ? 'mock' : 'production'
      });

      // In mock mode or if there was an initialization error, return mock data
      if (this.mockMode || this.initializationError) {
        return this._getMockCustomerData(normalizedEmail);
      }

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

      logger.debug('Sales data retrieved', { 
        salesCount: sales.length 
      });

      // Get pending appraisals
      const pendingResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.appraisalsSpreadsheetId,
        range: "'Pending Appraisals'!A2:O",
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

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

      logger.debug('Pending appraisals retrieved', { 
        pendingCount: pendingAppraisals.length 
      });

      // Get completed appraisals
      const completedResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.appraisalsSpreadsheetId,
        range: "'Completed Appraisals'!A2:O",
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

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

      logger.debug('Completed appraisals retrieved', { 
        completedCount: completedAppraisals.length 
      });

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
        email: normalizedEmail,
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
        stack: error.stack,
        email,
        isAuthError: error.message.includes('authentication')
      });

      // If there's an initialization error, throw it
      if (error instanceof ApiError) {
        throw error;
      }

      // For other errors, return empty data in development or mock data
      return this.mockMode ? 
        this._getMockCustomerData(email) : 
        this._getEmptyCustomerData();
    }
  }

  _getMockCustomerData(email) {
    const mockDate = new Date().toISOString();
    return {
      sales: [
        {
          sessionId: 'mock-session-1',
          chargeId: 'mock-charge-1',
          stripeCustomerId: 'mock-stripe-1',
          customerName: email.split('@')[0],
          amount: 99.99,
          date: mockDate
        }
      ],
      pendingAppraisals: [
        {
          date: mockDate,
          serviceType: 'Standard',
          sessionId: 'mock-session-1',
          status: 'pending',
          editLink: 'https://example.com/edit',
          imageDescription: 'Mock image description',
          customerDescription: 'Mock customer description',
          value: '150.00'
        }
      ],
      completedAppraisals: [
        {
          date: mockDate,
          serviceType: 'Premium',
          sessionId: 'mock-session-2',
          status: 'completed',
          editLink: 'https://example.com/edit',
          imageDescription: 'Mock completed image',
          customerDescription: 'Mock completed description',
          value: '200.00',
          appraisersDescription: 'Mock appraiser notes',
          finalDescription: 'Mock final description',
          pdfLink: 'https://example.com/pdf',
          docLink: 'https://example.com/doc'
        }
      ],
      summary: {
        totalPurchases: 1,
        totalSpent: 99.99,
        hasPendingAppraisals: true,
        hasCompletedAppraisals: true,
        totalAppraisals: 2,
        isExistingCustomer: true,
        lastPurchaseDate: mockDate,
        stripeCustomerId: 'mock-stripe-1'
      }
    };
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