const { GoogleSpreadsheet } = require('google-spreadsheet');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

class SheetsService {
  constructor() {
    this.salesSpreadsheet = null;
    this.pendingAppraisalsSpreadsheet = null;
    this.initialized = false;
    this.initPromise = null;
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
      const [salesSpreadsheetId, pendingAppraisalsSpreadsheetId] = await Promise.all([
        secretManager.getSecret('SALES_SPREADSHEET_ID'),
        secretManager.getSecret('PENDING_APPRAISALS_SPREADSHEET_ID')
      ]);

      if (!salesSpreadsheetId || !pendingAppraisalsSpreadsheetId) {
        throw new Error('Spreadsheet IDs not configured');
      }

      // Initialize spreadsheets
      this.salesSpreadsheet = new GoogleSpreadsheet(salesSpreadsheetId);
      this.pendingAppraisalsSpreadsheet = new GoogleSpreadsheet(pendingAppraisalsSpreadsheetId);

      // Authenticate using the same credentials as Gmail
      await Promise.all([
        this.salesSpreadsheet.useServiceAccountAuth({
          client_email: process.env.GMAIL_CLIENT_ID,
          private_key: process.env.GMAIL_CLIENT_SECRET,
        }),
        this.pendingAppraisalsSpreadsheet.useServiceAccountAuth({
          client_email: process.env.GMAIL_CLIENT_ID,
          private_key: process.env.GMAIL_CLIENT_SECRET,
        })
      ]);

      // Load spreadsheet info
      await Promise.all([
        this.salesSpreadsheet.loadInfo(),
        this.pendingAppraisalsSpreadsheet.loadInfo()
      ]);

      logger.info('Sheets service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Sheets service:', error);
      throw error;
    }
  }

  async getCustomerInfo(email) {
    await this.ensureInitialized();

    try {
      logger.info('Getting customer info from sheets', { email });
      const normalizedEmail = email.toLowerCase();

      // Get sales info from "Sales" sheet
      const salesSheet = this.salesSpreadsheet.sheetsByTitle['Sales'];
      if (!salesSheet) {
        throw new Error('Sales sheet not found');
      }

      await salesSheet.loadCells();
      const salesRows = await salesSheet.getRows();
      
      const sales = salesRows
        .filter(row => row.get('Customer email').toLowerCase() === normalizedEmail)
        .map(row => ({
          sessionId: row.get('Session ID'),
          chargeId: row.get('Charge ID'),
          stripeCustomerId: row.get('Stripe Customer ID'),
          customerName: row.get('Customer Name'),
          amount: parseFloat(row.get('Amount') || '0'),
          date: row.get('Date')
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first

      // Get pending appraisals
      const pendingSheet = this.pendingAppraisalsSpreadsheet.sheetsByIndex[0];
      await pendingSheet.loadCells();
      const pendingRows = await pendingSheet.getRows();
      
      const pendingAppraisals = pendingRows
        .filter(row => row.get('Email').toLowerCase() === normalizedEmail)
        .map(row => ({
          date: row.get('Date'),
          type: row.get('Type'),
          status: row.get('Status')
        }));

      // Calculate summary
      const totalSpent = sales.reduce((sum, sale) => sum + sale.amount, 0);
      const lastPurchase = sales[0]; // Already sorted by date
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
      throw error;
    }
  }
}

module.exports = new SheetsService();