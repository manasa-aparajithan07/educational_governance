'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ExamStudent = sequelize.define(
    'ExamStudent',
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
      attendanceStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'REGISTERED', // REGISTERED, PRESENT, ABSENT
      },
    },
    {
      tableName: 'exam_students',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['examId', 'studentId'] },
        { fields: ['studentId'] },
      ],
    }
  );

  return ExamStudent;
};
