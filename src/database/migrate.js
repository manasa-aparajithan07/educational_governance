'use strict';

const { sequelize } = require('./models');
const logger = require('../utils/logger');

async function migrate() {
  const isSqlite = sequelize.getDialect() === 'sqlite';

  try {
    logger.info('Running database schema synchronization (migration)...');

    if (isSqlite) {
      // 1. Temporarily disable foreign key constraints during table recreate/alteration
      await sequelize.query('PRAGMA foreign_keys = OFF;');

      // 2. Clean up any orphaned backup tables from previous interrupted syncs
      const [backupTables] = await sequelize.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_backup';"
      );
      for (const table of backupTables) {
        await sequelize.query(`DROP TABLE IF EXISTS \`${table.name}\`;`);
      }

      // Clean up results table in SQLite before sync to avoid Sequelize's SQLite alter bug
      // where composite unique indexes incorrectly inject a standalone UNIQUE on examId
      await sequelize.query('DROP TABLE IF EXISTS `results`;');
    }

    await sequelize.sync({ alter: true });

    if (isSqlite) {
      // 3. Re-enable foreign key constraints and verify integrity
      await sequelize.query('PRAGMA foreign_keys = ON;');
      const [fkErrors] = await sequelize.query('PRAGMA foreign_key_check;');
      if (fkErrors && fkErrors.length > 0) {
        logger.warn('Foreign key integrity check flagged references:', fkErrors);
      }
    }

    logger.info('Database schema synchronized successfully.');
    return true;
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    if (isSqlite) {
      try {
        await sequelize.query('PRAGMA foreign_keys = ON;');
      } catch (_) {}
    }
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      logger.info('Migration process finished.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration process exited with error:', err);
      process.exit(1);
    });
}

module.exports = migrate;
