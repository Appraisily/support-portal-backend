const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');

class StorageService {
  constructor() {
    // Only initialize real storage in production with bucket configured
    if (process.env.NODE_ENV === 'production') {
      try {
        this.storage = new Storage();
        this.bucket = this.storage.bucket('support-portal-attachments-civil-forge-403609');
        logger.info('Storage service initialized with bucket: support-portal-attachments-civil-forge-403609');
      } catch (error) {
        logger.error('Failed to initialize storage service:', error);
        this.mockMode = true;
      }
    } else {
      logger.info('Running in development mode - using mock storage');
      this.mockMode = true;
    }
  }

  async uploadFile(file, ticketId) {
    try {
      if (this.mockMode) {
        const mockUrl = `https://storage.mock/${ticketId}/${Date.now()}-${file.originalname}`;
        logger.info('Mock file upload:', mockUrl);
        return {
          name: `${ticketId}/${file.originalname}`,
          url: mockUrl,
          contentType: file.mimetype,
          size: file.size
        };
      }

      const fileName = `${ticketId}/${Date.now()}-${file.originalname}`;
      const blob = this.bucket.file(fileName);
      
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          ticketId,
          originalName: file.originalname
        }
      });

      const [url] = await blob.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      logger.info(`File uploaded successfully: ${fileName}`);
      return {
        name: fileName,
        url,
        contentType: file.mimetype,
        size: file.size
      };
    } catch (error) {
      logger.error('File upload error:', error);
      throw error;
    }
  }

  async deleteFile(fileName) {
    try {
      if (this.mockMode) {
        logger.info(`Mock delete file: ${fileName}`);
        return;
      }

      await this.bucket.file(fileName).delete();
      logger.info(`File ${fileName} deleted successfully`);
    } catch (error) {
      logger.error('File deletion error:', error);
      throw error;
    }
  }
}

module.exports = new StorageService();