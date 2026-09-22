'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const notFoundMiddleware = require('./middleware/notFoundMiddleware');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (config.cors.origin.includes('*') || config.cors.origin.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in development
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Request logging via Morgan streamed to Winston logger
if (config.env !== 'test') {
  const morganStream = {
    write: (text) => logger.info(text.trim()),
  };
  app.use(morgan(':method :url :status :response-time ms - :res[content-length]', { stream: morganStream }));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Direct top-level health-check route (in addition to API prefix)
app.get('/health', (req, res, next) => {
  req.url = '/health';
  routes(req, res, next);
});

// Mount versioned API routes
app.use(config.apiPrefix, routes);

// 404 Not Found Middleware
app.use(notFoundMiddleware);

// Centralized Error Handling Middleware
app.use(errorMiddleware);

module.exports = app;
