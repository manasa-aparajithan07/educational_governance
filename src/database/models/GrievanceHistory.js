'use strict';

const { DataTypes } = require('sequelize');
const { GRIEVANCE_STATUS } = require('../../utils/constants');

module.exports = (sequelize) => {
  const GrievanceHistory = sequelize.define(
    'GrievanceHistory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      grievanceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      previousStatus: {
        type: DataTypes.ENUM(Object.values(GRIEVANCE_STATUS)),
        allowNull: false,
      },
      newStatus: {
        type: DataTypes.ENUM(Object.values(GRIEVANCE_STATUS)),
        allowNull: false,
      },
      actionBy: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      actionByRole: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      blockchainTransactionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'grievance_history',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['grievanceId'] },
        { fields: ['actionBy'] },
      ],
    }
  );

  return GrievanceHistory;
};
