'use strict';

const { DataTypes } = require('sequelize');
const { GRIEVANCE_CATEGORY, GRIEVANCE_STATUS } = require('../../utils/constants');

module.exports = (sequelize) => {
  const Grievance = sequelize.define(
    'Grievance',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      grievanceCode: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      studentId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      examId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      resultId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM(Object.values(GRIEVANCE_CATEGORY)),
        allowNull: false,
        defaultValue: GRIEVANCE_CATEGORY.MARKS_DISCREPANCY,
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      attachmentPathOrStorageKey: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      descriptionHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(Object.values(GRIEVANCE_STATUS)),
        allowNull: false,
        defaultValue: GRIEVANCE_STATUS.SUBMITTED,
      },
      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'MEDIUM', // LOW, MEDIUM, HIGH, URGENT
      },
      assignedTo: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      resolutionRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      submittedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      assignedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      blockchainTransactionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'grievances',
      timestamps: true,
      paranoid: true, // soft deletion
      indexes: [
        { unique: true, fields: ['grievanceCode'] },
        { fields: ['studentId'] },
        { fields: ['examId'] },
        { fields: ['status'] },
        { fields: ['category'] },
        { fields: ['assignedTo'] },
      ],
    }
  );

  return Grievance;
};
