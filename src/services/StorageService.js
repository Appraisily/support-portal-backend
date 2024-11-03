const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');

class StorageService {
  constructor() {
    this.storage = new Storage();
    this.bucket = this.storage.bucket(process.env.STORAGE_BUCKET);
  }

  async uploadFile(file, ticketId) {
    const fileName = `${ticketId}/${Date.now()}-${file.originalname}`;
    const blob = this.bucket.file(fileName);
    
    try {
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
      await this.bucket.file(fileName).delete();
      logger.info(`File ${fileName} deleted successfully`);
    } catch (error) {
      logger.error('File deletion error:', error);
      throw error;
    }
  }
}

module.exports = new StorageService();