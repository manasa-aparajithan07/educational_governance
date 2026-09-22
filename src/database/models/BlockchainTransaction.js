'use strict';

const { DataTypes } = require('sequelize');
const { BLOCKCHAIN_TX_STATUS } = require('../../utils/constants');

module.exports = (sequelize) => {
  const BlockchainTransaction = sequelize.define(
    'BlockchainTransaction',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      txHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      channelName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'educhannel',
      },
      chaincodeName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'education',
      },
      functionName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      payloadHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(Object.values(BLOCKCHAIN_TX_STATUS)),
        allowNull: false,
        defaultValue: BLOCKCHAIN_TX_STATUS.PENDING,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'blockchain_transactions',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['txHash'] },
        { fields: ['status'] },
        { fields: ['functionName'] },
        { fields: ['payloadHash'] },
      ],
    }
  );

  return BlockchainTransaction;
};
