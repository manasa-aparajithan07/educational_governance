'use strict';

const { DataTypes } = require('sequelize');
const { ROLES, ACCOUNT_STATUS } = require('../../utils/constants');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      fullName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM(Object.values(ROLES)),
        allowNull: false,
        defaultValue: ROLES.STUDENT,
      },
      studentId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      facultyId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      department: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      accountStatus: {
        type: DataTypes.ENUM(Object.values(ACCOUNT_STATUS)),
        allowNull: false,
        defaultValue: ACCOUNT_STATUS.ACTIVE,
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      paranoid: true, // soft deletion
      indexes: [
        { unique: true, fields: ['email'] },
        { unique: true, fields: ['studentId'], where: { deletedAt: null } },
        { unique: true, fields: ['facultyId'], where: { deletedAt: null } },
        { fields: ['role'] },
        { fields: ['accountStatus'] },
      ],
    }
  );

  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.passwordHash;
    return values;
  };

  return User;
};
