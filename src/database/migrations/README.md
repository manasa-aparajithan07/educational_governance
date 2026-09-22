# Database Migrations

This directory is designated for Sequelize migration files.

For immediate development and test environments, `src/database/migrate.js` executes automatic schema synchronization via `sequelize.sync({ alter: true })`.

To run schema migration:
```bash
npm run db:migrate
```
