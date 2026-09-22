'use strict';

const { DataTypes } = require('sequelize');
const { EXAM_STATUS, EXAM_TYPE } = require('../../utils/constants');

module.exports = (sequelize) => {
  const Exam = sequelize.define(
    'Exam',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      examCode: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'subjects',
          key: 'id',
        },
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'departments',
          key: 'id',
        },
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      examDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      endTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 180,
        validate: {
          min: 1,
        },
      },
      maximumMarks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        validate: {
          min: 1,
        },
      },
      status: {
        type: DataTypes.ENUM(Object.values(EXAM_STATUS)),
        allowNull: false,
        defaultValue: EXAM_STATUS.DRAFT,
      },
      subjectCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      subjectName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      academicYear: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      semester: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      examType: {
        type: DataTypes.ENUM(Object.values(EXAM_TYPE)),
        allowNull: true,
        defaultValue: EXAM_TYPE.END_SEMESTER,
      },
      approvedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      approvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'exams',
      timestamps: true,
      paranoid: true, // soft deletion
      indexes: [
        { unique: true, fields: ['examCode'] },
        { fields: ['status'] },
        { fields: ['examDate'] },
        { fields: ['subjectId'] },
        { fields: ['departmentId'] },
        { fields: ['createdBy'] },
      ],
    }
  );

  return Exam;
};
