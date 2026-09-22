'use strict';

const { DataTypes } = require('sequelize');
const { QUESTION_PAPER_VERIFICATION } = require('../../utils/constants');

module.exports = (sequelize) => {
  const QuestionPaper = sequelize.define(
    'QuestionPaper',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      examId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      filePathOrStorageKey: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      mimeType: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      fileSize: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      sha256Hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      uploadedBy: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      uploadedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      blockchainTransactionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      verificationStatus: {
        type: DataTypes.ENUM(Object.values(QUESTION_PAPER_VERIFICATION)),
        allowNull: false,
        defaultValue: QUESTION_PAPER_VERIFICATION.NOT_VERIFIED,
      },
    },
    {
      tableName: 'question_papers',
      timestamps: true,
      paranoid: true, // soft deletion
      indexes: [
        { fields: ['examId'] },
        { fields: ['sha256Hash'] },
        { fields: ['verificationStatus'] },
        { fields: ['blockchainTransactionId'] },
      ],
    }
  );

  return QuestionPaper;
};
