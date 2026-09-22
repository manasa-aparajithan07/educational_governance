'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env file
dotenv.config();

const requiredEnvVars = [
  'PORT',
  'API_PREFIX',
];

function validateEnv() {
  const missing = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[Startup Error] Missing required environment variables: ${missing.join(', ')}. ` +
      `Please check your .env or .env.example file.`
    );
  }
}

// Run validation
validateEnv();

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  db: {
    dialect: process.env.DB_DIALECT || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.NODE_ENV === 'test'
      ? (process.env.TEST_DB_NAME || 'education_governance_test_db')
      : (process.env.DB_NAME || 'education_governance_db'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres_secure_password_2026',
    storage: process.env.NODE_ENV === 'test'
      ? (process.env.TEST_DB_STORAGE || './education_governance_test.db')
      : (process.env.DB_STORAGE || './education_governance.db'),
    url: process.env.DATABASE_URL,
    logging: false,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_2026_super_secure',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_key_2026_super_secure',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },

  upload: {
    dir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    maxSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760', 10), // 10MB default
  },

  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173'],
  },

  fabric: {
    enabled: process.env.FABRIC_ENABLED === 'true',
    channelName: process.env.FABRIC_CHANNEL_NAME || 'educhannel',
    chaincodeName: process.env.FABRIC_CHAINCODE_NAME || 'education',
    mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
    identityName: process.env.FABRIC_IDENTITY_NAME || 'admin',
    connectionProfilePath: path.resolve(process.cwd(), process.env.FABRIC_CONNECTION_PROFILE_PATH || 'chaincode/education/connection-org1.json'),
    certPath: path.resolve(process.cwd(), process.env.FABRIC_CERT_PATH || 'chaincode/education/msp/signcerts/cert.pem'),
    privateKeyPath: path.resolve(process.cwd(), process.env.FABRIC_PRIVATE_KEY_PATH || 'chaincode/education/msp/keystore/key.pem'),
    peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
    discoveryEnabled: process.env.FABRIC_GATEWAY_DISCOVERY_ENABLED === 'true',
  },
});

module.exports = config;
