'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subject = sequelize.define(
    'Subject',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      credits: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        allowNull: false,
      },
    },
    {
      tableName: 'subjects',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['code'] },
        { fields: ['departmentId'] },
      ],
    }
  );

  return Subject;
};
