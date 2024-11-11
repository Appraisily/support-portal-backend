const logger = require('../utils/logger');

class AnalysisService {
  analyzeSentiment(message) {
    const positiveWords = ['happy', 'great', 'thanks', 'good', 'excellent'];
    const negativeWords = ['bad', 'issue', 'problem', 'wrong', 'error', 'cannot'];
    
    const words = message.toLowerCase().split(' ');
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  analyzePriority(message, purchaseHistory) {
    const urgentWords = ['urgent', 'immediately', 'asap', 'emergency'];
    const isUrgent = urgentWords.some(word => 
      message.toLowerCase().includes(word)
    );

    const recentPurchase = purchaseHistory.some(purchase => {
      const purchaseDate = new Date(purchase.date);
      const daysSincePurchase = (Date.now() - purchaseDate) / (1000 * 60 * 60 * 24);
      return daysSincePurchase <= 7;
    });

    if (isUrgent || recentPurchase) return 'high';
    return 'medium';
  }

  analyzeTopics(message) {
    const topicKeywords = {
      'billing': ['charge', 'bill', 'payment', 'refund', 'price'],
      'access': ['login', 'access', 'password', 'account'],
      'features': ['feature', 'premium', 'upgrade', 'function'],
      'technical': ['error', 'bug', 'issue', 'problem', 'broken']
    };

    return Object.entries(topicKeywords)
      .filter(([, keywords]) => 
        keywords.some(keyword => message.toLowerCase().includes(keyword))
      )
      .map(([topicName]) => topicName);
  }

  analyzePurchaseHistory(purchaseHistory) {
    const totalSpent = purchaseHistory.reduce((sum, purchase) => 
      purchase.status === 'completed' ? sum + purchase.amount : sum, 0
    );

    const productPreferences = [...new Set(
      purchaseHistory
        .filter(p => p.status === 'completed')
        .flatMap(p => p.items.map(item => item.name))
    )];

    const recentIssues = purchaseHistory.some(purchase => {
      const isRecent = (Date.now() - new Date(purchase.date)) / (1000 * 60 * 60 * 24) <= 30;
      return isRecent && purchase.status === 'refunded';
    });

    const purchaseFrequency = this.calculatePurchaseFrequency(purchaseHistory);

    return {
      totalSpent,
      purchaseFrequency,
      recentIssues,
      productPreferences
    };
  }

  calculatePurchaseFrequency(purchaseHistory) {
    if (purchaseHistory.length <= 1) return 'new customer';
    
    const completedPurchases = purchaseHistory
      .filter(p => p.status === 'completed')
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (completedPurchases.length <= 1) return 'occasional';

    const avgDaysBetweenPurchases = completedPurchases
      .slice(1)
      .reduce((sum, purchase, index) => {
        const daysDiff = (new Date(completedPurchases[index].date) - new Date(purchase.date)) 
          / (1000 * 60 * 60 * 24);
        return sum + daysDiff;
      }, 0) / (completedPurchases.length - 1);

    if (avgDaysBetweenPurchases <= 30) return 'frequent';
    if (avgDaysBetweenPurchases <= 90) return 'regular';
    return 'occasional';
  }

  async analyzeCustomer(customerId, message, purchaseHistory) {
    try {
      const sentiment = this.analyzeSentiment(message);
      const priority = this.analyzePriority(message, purchaseHistory);
      const topics = this.analyzeTopics(message);
      const context = this.analyzePurchaseHistory(purchaseHistory);
      
      const analysis = {
        sentiment,
        priority,
        topics,
        context
      };

      const suggestedReply = this.generateSuggestedReply(message, analysis, purchaseHistory);

      return {
        suggestedReply,
        analysis
      };
    } catch (error) {
      logger.error('Error analyzing customer data:', error);
      throw error;
    }
  }

  generateSuggestedReply(message, analysis, purchaseHistory) {
    let reply = '';

    if (analysis.context.totalSpent > 1000) {
      reply += 'Thank you for being a valued customer. ';
    }

    const recentPurchase = purchaseHistory
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (recentPurchase && analysis.topics.includes('features')) {
      reply += `I can see your recent ${recentPurchase.items[0].name} purchase. `;
    }

    if (analysis.topics.includes('technical')) {
      reply += 'I understand you\'re experiencing technical difficulties. ';
    } else if (analysis.topics.includes('billing')) {
      reply += 'I\'ll help you with your billing concern. ';
    }

    if (analysis.priority === 'high') {
      reply += 'I\'ll prioritize this issue and help you get it resolved quickly.';
    } else {
      reply += 'I\'ll be happy to help you with this.';
    }

    return reply;
  }
}

module.exports = new AnalysisService();