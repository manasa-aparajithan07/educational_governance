# A Blockchain-Based Framework for Transparent Educational Governance - Backend API

## Overview
A tamper-proof, auditable, and modular backend powering the **Transparent Educational Governance System**. Built with **Node.js**, **Express**, and **Sequelize ORM**, enforcing strict database normalization, role-based access control architecture, SHA-256 cryptographic data hashing, an immutable audit trail, and preparing for Hyperledger Fabric blockchain integration.

---

## 1. Tech Stack & Prerequisites

- **Runtime**: Node.js (>= 18.0.0, tested with Node 20/22)
- **Web Framework**: Express 4.21+
- **ORM / Database**: Sequelize 6.x supporting PostgreSQL (Production/Docker) with SQLite fallback for instant zero-config development
- **Security & Integrity**: Helmet, CORS, Bcryptjs, JSONWebToken, SHA-256 cryptographic verification
- **Logging**: Winston 3.x + Morgan request streaming
- **Testing**: Jest 29.x + Supertest 7.x
- **Blockchain**: Hyperledger Fabric Gateway Integration (Channel: `educhannel`, Chaincode: `education`)

---

## 2. Project Architecture & Structure

```text
education-governance-backend/
├── chaincode/
│   └── education/                  # Hyperledger Fabric smart contract
│       ├── index.js
│       ├── lib/
│       │   ├── educationContract.js
│       │   ├── validation.js
│       │   └── helpers.js
│       ├── package.json
│       └── README.md
│
├── src/
│   ├── app.js                      # Express app configuration & middleware pipeline
│   ├── server.js                   # Server entry point & graceful shutdown
│   │
│   ├── config/                     # Configuration management
│   │   ├── env.js                  # Environment variable parsing & validation
│   │   ├── database.js             # Sequelize connection (Postgres/SQLite)
│   │   └── fabricConfig.js         # Hyperledger Fabric gateway configuration
│   │
│   ├── database/                   # Database layer
│   │   ├── migrate.js              # Database schema sync & migration script
│   │   ├── seed.js                 # Database seeding with Bcrypt hashed passwords
│   │   ├── migrations/             # Migration definitions
│   │   ├── seeders/                # Seeder definitions
│   │   └── models/                 # Normalized Sequelize models (14 entities)
│   │       ├── User.js
│   │       ├── Department.js
│   │       ├── Subject.js
│   │       ├── Exam.js
│   │       ├── ExamFacultyAssignment.js
│   │       ├── ExamStudent.js
│   │       ├── QuestionPaper.js
│   │       ├── FileMetadata.js
│   │       ├── Result.js
│   │       ├── Grievance.js
│   │       ├── GrievanceHistory.js
│   │       ├── AuditLog.js
│   │       ├── BlockchainTransaction.js
│   │       ├── RefreshToken.js
│   │       └── index.js            # Model initialization & relational associations
│   │
│   ├── middleware/                 # Express middleware
│   │   ├── authMiddleware.js       # JWT validation & user attachment
│   │   ├── roleMiddleware.js       # Role-Based Access Control (RBAC)
│   │   ├── validationMiddleware.js # Schema & request payload validation
│   │   ├── errorMiddleware.js      # Centralized error handler
│   │   └── notFoundMiddleware.js   # Standardized 404 response handler
│   │
│   ├── modules/                    # Domain feature modules (staged for Phase 2+)
│   │   ├── auth/
│   │   ├── users/
│   │   ├── exams/
│   │   ├── questionPapers/
│   │   ├── results/
│   │   ├── grievances/
│   │   ├── audit/
│   │   └── blockchain/
│   │
│   ├── routes/
│   │   └── index.js                # Central API router & health endpoints
│   │
│   ├── services/                   # Reusable business & infrastructure services
│   │   ├── auditService.js         # Immutable event logging with SHA-256 record hash
│   │   ├── fileStorageService.js   # Secure file operations with path traversal prevention
│   │   ├── hashingService.js       # SHA-256 hashing for buffers, strings & file streams
│   │   └── notificationService.js  # Notification dispatcher
│   │
│   ├── utils/                      # Utilities
│   │   ├── apiResponse.js          # Success, error, and paginated response envelopes
│   │   ├── constants.js            # System enums & constants
│   │   ├── errors.js               # Structured HTTP AppError classes
│   │   └── logger.js               # Centralized Winston logger
│   │
│   └── validators/                 # Request validation utilities
│       ├── commonValidators.js
│       └── index.js
│
├── tests/                          # Automated test suites
│   ├── health.test.js              # Health-check & root API endpoint tests
│   ├── apiResponse.test.js         # Response envelope formatting tests
│   ├── database.test.js            # Model registration & association integrity tests
│   ├── hashing.test.js             # Cryptographic hashing & verification tests
│   └── middleware.test.js          # 404, error handler, RBAC, and validator tests
│
├── uploads/                        # File storage directory (git-tracked via .gitkeep)
├── postman/                        # Postman API Collection
│   └── education-governance-api.json
├── docker-compose.yml              # PostgreSQL container definition
├── .env.example                    # Environment template
├── package.json                    # Project metadata & npm scripts
└── README.md                       # Documentation
```

---

## 3. Environment & Configuration

Create a local `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Key environment variables:
```env
# Application
NODE_ENV=development
PORT=5000
API_PREFIX=/api/v1

# Database (Default: SQLite for immediate development, or PostgreSQL)
DB_DIALECT=sqlite
DB_STORAGE=./education_governance.db
# For PostgreSQL:
# DB_DIALECT=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=education_governance_db
# DB_USER=postgres
# DB_PASSWORD=postgres_secure_password_2026

# Security & Tokens
JWT_ACCESS_SECRET=dev_access_secret_key_2026_super_secure
JWT_REFRESH_SECRET=dev_refresh_secret_key_2026_super_secure
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12

# File Uploads
UPLOAD_DIR=uploads
MAX_FILE_SIZE_BYTES=10485760

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Hyperledger Fabric Blockchain Configuration
FABRIC_ENABLED=false
FABRIC_CHANNEL_NAME=educhannel
FABRIC_CHAINCODE_NAME=education
```

---

## 4. Getting Started

### Installation
```bash
npm install
```

### Starting PostgreSQL (Optional)
If running with PostgreSQL rather than the default SQLite:
```bash
docker compose up -d
```

### Database Migration & Synchronization
Synchronize all 14 Sequelize models, indexes, unique constraints, and foreign keys:
```bash
npm run db:migrate
```

### Database Seeding
Seed initial departments, subject records, and hashed development accounts:
```bash
npm run db:seed
```

### Running the Server
```bash
# Production mode:
npm start

# Development mode with hot-reload:
npm run dev
```
The server will be running at:
- **Base API URL**: `http://localhost:5000/api/v1`
- **Health Check**: `http://localhost:5000/api/v1/health` or `http://localhost:5000/health`

### Running Automated Tests
```bash
npm test
```
Executes all Jest test suites covering endpoints, response envelopes, database models/associations, middleware, and cryptographic hashing.

---

## 5. Seed Credentials (Bcrypt Hashed, No Plaintext)

| Role | Email | Password | Identifier | Department |
|---|---|---|---|---|
| **ADMIN** | `admin@vit.ac.in` | `Admin@12345` | `ADM-001` | CSE |
| **FACULTY** | `faculty@vit.ac.in` | `Faculty@12345` | `FAC-1001` | CSE |
| **STUDENT** | `student@vit.ac.in` | `Student@12345` | `25BCE5152` | CSE |

---

## 6. Standard API Response Envelopes

### Success Envelope (`200`, `201`)
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "error": null
}
```

### Error Envelope (`400`, `401`, `403`, `404`, `422`, `500`)
```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "examDate",
        "message": "Exam date is required"
      }
    ]
  }
}
```

### Paginated Envelope (`200`)
```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalItems": 25,
      "totalPages": 3
    }
  },
  "error": null
}
```

---

## 7. Stable Database Schema & Entity Relationships

1. **`users`**: Central account entity for `ADMIN`, `FACULTY`, `STUDENT`. Soft-deletable (`paranoid: true`).
2. **`departments`**: Academic units (e.g. CSE, IT, ECE).
3. **`subjects`**: Courses affiliated with a department.
4. **`exams`**: Academic examination schedules, states (`DRAFT` to `RESULT_PUBLISHED`), creator and approver tracking.
5. **`exam_faculty_assignments`**: M:N mapping of faculty to exams with assignment roles (`INVIGILATOR`, `EVALUATOR`).
6. **`exam_students`**: Examination enrollments with attendance state.
7. **`question_papers`**: Uploaded question papers with SHA-256 content hashes, storage keys, and verification status (`NOT_VERIFIED`, `VERIFIED`, `TAMPER_DETECTED`).
8. **`file_metadata`**: Generalized file store metadata with SHA-256 digest and size tracking.
9. **`results`**: Student evaluation marks, grades, submission and publication states, soft-deletable.
10. **`grievances`**: Student grievance filings with description hashes, categories, priority, and assignees.
11. **`grievance_history`**: Append-only status progression audit log (`updatedAt: false`).
12. **`audit_logs`**: Append-only immutable system event log (`updatedAt: false`) with SHA-256 payload snapshot hash.
13. **`blockchain_transactions`**: Append-only registry of Fabric transaction submissions, status (`PENDING`, `COMMITTED`, `FAILED`), channel, chaincode, and block number.
14. **`refresh_tokens`**: Rotating session refresh tokens with revocation support.

---

## 8. Authentication & User Management API Reference (Phase 2)

### Authentication Endpoints (`/api/v1/auth`)
- `POST /api/v1/auth/register`: Public student registration (creates student, returns dual tokens, logs audit trail)
- `POST /api/v1/auth/login`: Authenticate with email and password (returns `user`, `accessToken`, `refreshToken`, `expiresIn`)
- `GET /api/v1/auth/me`: Get current authenticated user profile
- `PUT /api/v1/auth/me`: Update personal profile details (`fullName`, `department`)
- `POST /api/v1/auth/refresh`: Rotate refresh token and issue fresh token pair (with token reuse detection)
- `POST /api/v1/auth/change-password`: Verify current password, set new hash, and revoke all active sessions
- `POST /api/v1/auth/logout`: Revoke active refresh token and terminate session

### User Management Endpoints (`/api/v1/users` - Admin Only)
- `GET /api/v1/users`: Paginated user list with filters (`page`, `limit`, `role`, `department`, `accountStatus`, `search`)
- `POST /api/v1/users`: Create user with any role (`ADMIN`, `FACULTY`, `STUDENT`)
- `GET /api/v1/users/:id`: View user details (Admin, or Self only)
- `PUT /api/v1/users/:id`: Update user role, department, or status (Admin only)
- `DELETE /api/v1/users/:id`: Soft-delete user account and revoke all tokens (Admin only, self-deletion prohibited)

### Academic Department Endpoints (`/api/v1/departments`)
- `GET /api/v1/departments`: List all departments (Authenticated)
- `POST /api/v1/departments`: Create department (Admin only)

---

## 9. Current Phase Status & Handover

- **Phase 1: Backend Foundation & Database Architecture**: **COMPLETED** (24 tests passing)
- **Phase 2: Authentication & User Management (RBAC)**: **COMPLETED** (53 tests passing)
  - Features: Student registration, JWT dual-token generation, rotating refresh token invalidation, bcrypt hashing, password change, authenticated profiles, role-based access control (`ADMIN`, `FACULTY`, `STUDENT`), rate limiting, soft deletion, and immutable audit logging.
- **Phase 3: Examination Management**: **READY TO IMPLEMENT**
  - Planned next: Examination creation, scheduling, approval workflow, subject mapping, and faculty assignment.
