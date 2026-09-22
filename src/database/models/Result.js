'use strict';

const { DataTypes } = require('sequelize');
const { RESULT_STATUS } = require('../../utils/constants');

module.exports = (sequelize) => {
  const Result = sequelize.define(
    'Result',
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
      studentId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      facultyId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      marksObtained: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
      },
      maximumMarks: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 100.0,
      },
      grade: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      submissionStatus: {
        type: DataTypes.ENUM(Object.values(RESULT_STATUS)),
        allowNull: false,
        defaultValue: RESULT_STATUS.DRAFT,
      },
      submittedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      verifiedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      verifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      blockchainTransactionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'results',
      timestamps: true,
      paranoid: true, // soft deletion
      indexes: [
        { unique: true, fields: ['examId', 'studentId'], where: { deletedAt: null } },
        { fields: ['studentId'] },
        { fields: ['submissionStatus'] },
        { fields: ['publishedAt'] },
      ],
    }
  );

  return Result;
};
