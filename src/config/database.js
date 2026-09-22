'use strict';

const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('../utils/logger');

let sequelize;

if (config.db.dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.db.storage,
    logging: config.db.logging ? (msg) => logger.debug(msg) : false,
  });
} else if (config.db.url) {
  sequelize = new Sequelize(config.db.url, {
    dialect: 'postgres',
    logging: config.db.logging ? (msg) => logger.debug(msg) : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
} else {
  sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'postgres',
    logging: config.db.logging ? (msg) => logger.debug(msg) : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
}

async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info(`Database connected successfully using dialect: ${sequelize.getDialect()}`);
    return true;
  } catch (error) {
    logger.error('Unable to connect to the database:', error.message);
    throw error;
  }
}

module.exports = {
  sequelize,
  testConnection,
};
