'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FileMetadata = sequelize.define(
    'FileMetadata',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      originalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      storageKey: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      mimeType: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      sizeBytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      sha256Hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      uploadedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: 'file_metadata',
      timestamps: true,
      indexes: [
        { fields: ['sha256Hash'] },
      ],
    }
  );

  return FileMetadata;
};
