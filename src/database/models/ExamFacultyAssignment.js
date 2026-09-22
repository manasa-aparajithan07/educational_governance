'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ExamFacultyAssignment = sequelize.define(
    'ExamFacultyAssignment',
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
      facultyId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      assignmentRole: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'INVIGILATOR', // INVIGILATOR, EVALUATOR
      },
      assignedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
    },
    {
      tableName: 'exam_faculty_assignments',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['examId', 'facultyId', 'assignmentRole'] },
        { fields: ['facultyId'] },
      ],
    }
  );

  return ExamFacultyAssignment;
};
