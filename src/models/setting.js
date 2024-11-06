module.exports = (sequelize, DataTypes) => {
  const Setting = sequelize.define('Setting', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'settings',
    indexes: [
      {
        unique: true,
        fields: ['key']
      }
    ]
  });

  // Añadir métodos estáticos para manejo de historyId
  Setting.getHistoryId = async function() {
    try {
      const setting = await this.findOne({
        where: { key: 'lastGmailHistoryId' }
      });
      return setting ? parseInt(setting.value) : null;
    } catch (error) {
      throw new Error(`Error getting historyId: ${error.message}`);
    }
  };

  Setting.updateHistoryId = async function(historyId) {
    try {
      await this.upsert({
        key: 'lastGmailHistoryId',
        value: historyId.toString()
      });
    } catch (error) {
      throw new Error(`Error updating historyId: ${error.message}`);
    }
  };

  return Setting;
}; 