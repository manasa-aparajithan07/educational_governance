'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');

let server;

async function startServer() {
  try {
    // 1. Verify Database Connection
    logger.info('Connecting to database...');
    await testConnection();

    // 2. Start HTTP listener
    const PORT = config.port;
    server = app.listen(PORT, () => {
      logger.info(`========================================================`);
      logger.info(` Educational Governance Backend API Server Started `);
      logger.info(` Environment : ${config.env}`);
      logger.info(` Port        : ${PORT}`);
      logger.info(` Base API URL: http://localhost:${PORT}${config.apiPrefix}`);
      logger.info(` Health Check: http://localhost:${PORT}${config.apiPrefix}/health`);
      logger.info(` Database    : ${config.db.dialect}`);
      logger.info(` Blockchain  : Fabric enabled = ${config.fabric.enabled}`);
      logger.info(`========================================================`);
    });

    // Graceful Shutdown handling
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Initiating graceful shutdown...`);
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed.');
          try {
            const { sequelize } = require('./config/database');
            await sequelize.close();
            logger.info('Database connection pool closed.');
          } catch (err) {
            logger.error('Error closing database connection:', err);
          }
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Fatal startup error:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

module.exports = { startServer, app };
