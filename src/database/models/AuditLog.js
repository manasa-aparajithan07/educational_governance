'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      entityType: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      entityId: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      eventType: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      performedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      performedByRole: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      recordHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      blockchainTransactionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'audit_logs',
      timestamps: true,
      updatedAt: false, // Append-only immutable log
      indexes: [
        { fields: ['entityType', 'entityId'] },
        { fields: ['eventType'] },
        { fields: ['performedBy'] },
        { fields: ['createdAt'] },
        { fields: ['blockchainTransactionId'] },
      ],
    }
  );

  return AuditLog;
};
