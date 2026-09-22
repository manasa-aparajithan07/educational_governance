# Project Progress Tracker

## System: A Blockchain-Based Framework for Transparent Educational Governance
- **Base API URL**: `http://localhost:5000/api/v1`
- **Runtime**: Node.js (>= 18.0.0) + Express 4.x + Sequelize ORM
- **Database**: PostgreSQL (Production/Docker) with SQLite immediate development fallback
- **Blockchain**: Hyperledger Fabric (Target Channel: `educhannel`, Chaincode: `education`)

---

## Development Phases & Status

| Phase | Description | Status | Verification & Test Status |
|---|---|---|---|
| **Phase 1** | Project setup, architecture, database schema design, and configuration | **COMPLETED** | 24/24 Jest tests passing, schema migrated & verified |
| **Phase 2** | Authentication, user management, and backend RBAC (`ADMIN`, `FACULTY`, `STUDENT`) | **COMPLETED** | 87/87 Jest tests passing (63 Phase 2 + 24 foundation), full RBAC, audit logging & migration verified |
| **Phase 3** | Examination management, lifecycle state machine, governance, and RBAC | **COMPLETED** | 80/80 Jest tests passing across Phase 3A (26/26), Phase 3B (33/33), and Phase 3C (21/21) |
| **Phase 4** | Question-paper upload, SHA-256 hashing, tamper-proof storage, integrity verification, and governance | **IN PROGRESS** | Phase 4A (25/25), Phase 4B (13/13), Phase 4C (29/29) COMPLETED (67/67 tests); 234/234 tests passing; Phase 4D NOT STARTED / OPTIONAL |
| **Phase 5** | Result submission by faculty, verification, official publication, and audit-logged correction | **COMPLETED** | Phase 5A (23/23), Phase 5B (23/23), Phase 5C (26/26) COMPLETED; 72/72 Phase 5 tests passing |
| **Phase 6** | Blockchain Integration Readiness & Reconciliation (Canonical Hashing, Anchoring, Verification, Reconciliation) | **COMPLETED** | Phase 6A (20/20), Phase 6B (29/29), Phase 6C (37/37), Phase 6D (20/20) COMPLETED; 412/412 tests passing across 20 suites; Fabric disabled |
| **Phase 7** | Hyperledger Fabric JavaScript chaincode (smart contract for exams, results, grievances) | **IN PROGRESS** | Phase 7A Audit COMPLETED; Phase 7B Smart Contract & Unit Tests COMPLETED (25/25 tests passing); 437/437 tests passing across 21 suites; Fabric disabled |
| **Phase 8** | Fabric Gateway integration, transaction logging, and unified immutable audit trail | **PLANNED** | Pending Phase 8 |
| **Phase 9** | Security hardening, edge cases, input sanitization, and blockchain reconciliation | **PLANNED** | Pending Phase 9 |
| **Phase 10**| Automated regression tests, Postman collection, seed data, Docker setup, and frontend handover | **PLANNED** | Pending Phase 10 |

---

## Phase 2 Final Verification Checkpoint

### Status Summary
- **Phase 2 Status**: **COMPLETE**
- **Feature Completeness**: **16 / 16 Features Verified & Functional**
  - Public Student Registration (`POST /api/v1/auth/register`)
  - User Login with Bcrypt Hashing (`POST /api/v1/auth/login`)
  - Short-Lived JWT Access Tokens (1h)
  - Long-Lived Rotating Refresh Tokens (7d) with SHA-256 Storage
  - Refresh-Token Single-Use Rotation & Token Reuse Detection (`POST /api/v1/auth/refresh`)
  - Session Logout & Token Revocation (`POST /api/v1/auth/logout`)
  - Authenticated Profile Retrieval (`GET /api/v1/auth/me`)
  - Profile Update with Field Protection (`PUT /api/v1/auth/me`)
  - Password Change with Session Invalidation (`POST /api/v1/auth/change-password`)
  - Session Invalidation on Logout, Password Change, Suspension & Token Reuse
  - Role-Based Access Control Middleware (`ADMIN`, `FACULTY`, `STUDENT`)
  - Admin User Management (Paginated List, Create, View, Update, Soft-Delete, Self-Delete Prevention)
  - Rate Limiting on Authentication Endpoints (429 HTTP status)
  - Unified Immutable Audit Logging with Cryptographic Record Hashes
  - Request Input Validation (422 HTTP status with structured details)
  - Centralized Error Handling Envelope (`{ success, message, data, error }`)
- **Automated Tests**: **87/87 Jest tests passing across 7 test suites** (0 failed)
- **Database Migration (`npm run db:migrate`)**: **PASS**
  - Fixed SQLite foreign-key constraint failure during `sync({ alter: true })` in `src/database/migrate.js`.
  - Implemented safe foreign-key toggling (`PRAGMA foreign_keys = OFF / ON`), orphaned `_backup` table cleanup, and `PRAGMA foreign_key_check;` validation.
  - PostgreSQL behavior remains unchanged and compliant.
- **Database Seeding (`npm run db:seed`)**: **PASS** (Departments, subjects, and bcrypt-hashed development accounts verified)
- **Server Startup (`npm start`)**: **PASS** (Connects to database and binds port 5000 cleanly)
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Phase 3 Status**: **NOT STARTED**

---

## Git State & Repository Assessment Record

- **Node.js Implementation**: Currently **untracked** in Git (`src/`, `package.json`, `package-lock.json`, `tests/*.test.js`, `docker-compose.yml`, `project-progress.md`, `PROGRESS.md`, `postman/`, `chaincode/`, `uploads/`).
- **Legacy Python Implementation**: Remains **tracked** in Git from commit `1bd5673` (`app/`, `requirements.txt`, `tests/test_auth.py`).
- **Policy**: No files have been deleted, staged, or committed during this checkpoint. Any cleanup or staging requires explicit instruction.

---

## Phase 2 Deliverables Checklist: Authentication & User Management

### User Model & Security
- [x] Preserved user model fields (`id`, `fullName`, `email`, `passwordHash`, `role`, `studentId`, `facultyId`, `department`, `accountStatus`, timestamps, soft-deletion)
- [x] Automatically stripped `passwordHash` on model serialization via `User.prototype.toJSON`
- [x] Bcrypt password hashing (12 salt rounds, no plaintext storage)
- [x] Strong password policy validation (min 8 chars, uppercase, lowercase, number, special char)
- [x] Account status enforcement (`ACTIVE`, `INACTIVE`, `SUSPENDED`) preventing inactive login or token refresh

### Authentication Endpoints
- [x] Public student registration: `POST /api/v1/auth/register` (returns 201, user, accessToken, refreshToken, expiresIn)
- [x] User login: `POST /api/v1/auth/login` (checks bcrypt hash, active status, returns 200, user, accessToken, refreshToken)
- [x] Authenticated profile: `GET /api/v1/auth/me` (requires Bearer token, returns current user)
- [x] Profile update: `PUT /api/v1/auth/me` (allows updating non-sensitive personal details)
- [x] Rotating refresh tokens: `POST /api/v1/auth/refresh` (revokes old token, issues new dual tokens, detects token reuse)
- [x] Password change: `POST /api/v1/auth/change-password` (verifies current password, updates hash, revokes all active refresh tokens)
- [x] User logout: `POST /api/v1/auth/logout` (revokes refresh token in database, invalidates session)

### JWT Strategy & Token Invalidation
- [x] Short-lived access tokens signed with `JWT_ACCESS_SECRET` (`1h`)
- [x] Long-lived rotating refresh tokens signed with `JWT_REFRESH_SECRET` (`7d`)
- [x] SHA-256 hashed refresh token storage in `refresh_tokens` table
- [x] True token invalidation on logout and password change (sets `revokedAt` in DB)
- [x] Automatic session termination upon token reuse detection

### Authorization Middleware & RBAC
- [x] `authMiddleware`: verifies signature, expiration, malformed status, and active user account state
- [x] `roleMiddleware`: enforces access control for `ADMIN`, `FACULTY`, `STUDENT`
- [x] Rate limiting: `authRateLimiter` protecting auth routes against brute-force attacks (429 HTTP status)

### User Management & Administration (Admin Only)
- [x] Paginated user listing: `GET /api/v1/users` (filters by role, department, accountStatus, search)
- [x] User creation by admin: `POST /api/v1/users` (create Faculty, Admin, or Student)
- [x] User retrieval: `GET /api/v1/users/:id` (Admin or self only)
- [x] User update by admin: `PUT /api/v1/users/:id` (updates role, status, department)
- [x] User soft-deletion: `DELETE /api/v1/users/:id` (soft-deletes record, terminates all sessions, prohibits self-deletion)

### Academic Departments
- [x] Department listing: `GET /api/v1/departments`
- [x] Department creation: `POST /api/v1/departments` (Admin only)

### Unified Audit Logging
- [x] Every auth and user-management action logged to `audit_logs` (`USER_REGISTER`, `USER_LOGIN`, `USER_LOGOUT`, `TOKEN_REFRESH`, `PASSWORD_CHANGE`, `USER_CREATED_BY_ADMIN`, `USER_UPDATED_BY_ADMIN`, `USER_DELETED_BY_ADMIN`)

### Testing
- [x] 7 test suites, 53 total tests passing in Jest (`tests/auth.test.js`, `tests/users.test.js`, `tests/database.test.js`, `tests/health.test.js`, `tests/middleware.test.js`, `tests/apiResponse.test.js`, `tests/hashing.test.js`)

---

## Phase 3A Progress & Verification Checkpoint: Examination Management Foundation

### Overall Status & Boundaries
- **Phase 2 Status**: **COMPLETE** (Verified intact, all 87 Phase 2 tests continue passing)
- **Phase 3A Status**: **COMPLETE** (All Phase 3A requirements, CRUD APIs, validations, and tests verified)
- **Phase 3B Status**: **COMPLETE** (Examination lifecycle, state transitions, generic update hardening, audit logging, and tests verified)
- **Phase 3C Status**: **COMPLETE** (Faculty ownership, department boundaries, immutability, student visibility scoping verified)
- **Phase 3 Overall Status**: **COMPLETED** (Phase 3A, 3B, and 3C complete; 80/80 exam tests passing)
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)

### PHASE 3A STATUS:
- Examination database model: **COMPLETE**
  - Sequelize `Exam` model updated in `src/database/models/Exam.js` with all required fields: `id` (UUID PK), `examCode` (unique), `title` (required), `description`, `subjectId` (FK, required), `departmentId` (FK, required), `createdBy` (FK, required), `examDate` (DATEONLY, required), `startTime`, `endTime`, `duration` (positive integer, required), `maximumMarks` (positive number, required), `status` (controlled enum: `DRAFT`, `SCHEDULED`), `createdAt`, `updatedAt`, and soft-deletion (`deletedAt`).
- Examination relationships: **COMPLETE**
  - Configured in `src/database/models/index.js` following established project association conventions:
    - `Department.hasMany(Exam, { foreignKey: 'departmentId', as: 'exams' })`
    - `Exam.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' })`
    - `Subject.hasMany(Exam, { foreignKey: 'subjectId', as: 'exams' })`
    - `Exam.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' })`
    - `User.hasMany(Exam, { foreignKey: 'createdBy', as: 'createdExams' })`
    - `Exam.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' })`
- Examination migration: **COMPLETE**
  - Ran `npm run db:migrate` successfully with SQLite `alter: true` migration strategy and integrity checks.
- Examination CRUD API: **COMPLETE**
  - `POST /api/v1/exams`: Create examination (accepts custom unique or auto-generates `examCode`, verifies subject/department/creator references, validates duration/marks).
  - `GET /api/v1/exams`: List examinations (supports pagination with page/limit metadata, filters by `status`, `departmentId`, `subjectId`, `examDate`, and keyword search on `title`/`examCode`).
  - `GET /api/v1/exams/:id`: Retrieve single examination by UUID with associated Subject, Department, and Creator. Returns 404 for non-existent IDs.
  - `PUT /api/v1/exams/:id` & `PATCH /api/v1/exams/:id`: Update examination fields, validating changes, ensuring uniqueness of updated exam codes, and preserving record identity.
  - `DELETE /api/v1/exams/:id`: Safely soft-deletes examinations in initial `DRAFT` or `SCHEDULED` status.
- Basic authorization: **COMPLETE**
  - Leveraged existing `authMiddleware` and `roleMiddleware`.
  - Creation, updating, and deletion restricted to `ADMIN` and `FACULTY`.
  - `STUDENT` users are strictly forbidden from creating, modifying, or deleting exams (403 Forbidden).
  - Read access (`GET /api/v1/exams`, `GET /api/v1/exams/:id`) available to all authenticated roles (`ADMIN`, `FACULTY`, `STUDENT`).
- Validation: **COMPLETE**
  - Created `src/modules/exams/examsValidators.js` implementing `validateCreateExam` and `validateUpdateExam`.
  - Validates required fields, UUID formats, positive duration, positive maximumMarks, `YYYY-MM-DD` date format, valid time formats, controlled status values, and unique codes.
  - Formatted using standard API error envelope (`{ success, message, data, error: { code, details } }`).
- Tests: **26 / 26 passing** in `tests/exams.test.js`
- Regression tests: **113 / 113 passing across 8 test suites** (0 failed)
- Database Migration (`npm run db:migrate`): **PASS**
- Database Seeding (`npm run db:seed`): **PASS**
- Server Startup (`npm start`): **PASS** (Binds port 5000 cleanly)

---

## Phase 3B Verification Checkpoint: Examination Lifecycle & State Management

### Overall Status & Boundaries
- **Phase 2 Status**: **COMPLETE** (Verified intact, all 87 Phase 2 tests continue passing)
- **Phase 3A Status**: **COMPLETE** (All Phase 3A requirements, CRUD APIs, validations, and tests verified)
- **Phase 3B Status**: **COMPLETE** (Lifecycle state machine, dedicated transition endpoint, generic update hardening, audit trail, and 33/33 tests verified)
- **Phase 3C Status**: **COMPLETE** (Faculty ownership, department boundaries, immutability, student visibility scoping, and 21/21 tests verified)
- **Phase 3 Overall Status**: **COMPLETED** (Phase 3A, 3B, and 3C complete; 80/80 exam tests passing)
- **Phase 4 Status**: **NOT STARTED**
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Git Operations**: **NONE PERFORMED** (No files staged, committed, or deleted)

### Phase 3B Deliverables & Verification
- **Examination Lifecycle & State Machine**: **COMPLETE**
  - Controlled active lifecycle statuses: `DRAFT`, `SCHEDULED`, `ONGOING`, `COMPLETED`, `CANCELLED`.
  - Strictly enforced allowed transitions:
    - `DRAFT` -> `SCHEDULED`, `CANCELLED`
    - `SCHEDULED` -> `ONGOING`, `CANCELLED`
    - `ONGOING` -> `COMPLETED`, `CANCELLED`
    - `COMPLETED` -> terminal state (no transitions allowed)
    - `CANCELLED` -> terminal state (no transitions allowed)
  - Same-status transitions rejected (400 Bad Request with `SAME_STATUS_TRANSITION`).
  - Terminal state and invalid transition jumps rejected (400 Bad Request with `INVALID_STATUS_TRANSITION`).
- **Dedicated Transition API**: **COMPLETE**
  - `PATCH /api/v1/exams/:id/status`
  - Validates target status against `LIFECYCLE_STATUSES` (422 Unprocessable Entity with `VALIDATION_ERROR`).
  - Returns updated exam entity and lifecycle metadata (`previousStatus`, `currentStatus`, `transitionedAt`).
- **Generic Exam Update Hardening**: **COMPLETE**
  - Generic `PUT /api/v1/exams/:id` and `PATCH /api/v1/exams/:id` completely reject any request containing the `status` field (422 Unprocessable Entity with `VALIDATION_ERROR`).
  - Status transitions are exclusively permitted through the dedicated `PATCH /api/v1/exams/:id/status` endpoint.
- **Role-Based Authorization & Access Control**: **COMPLETE**
  - Restricted to `ADMIN` and `FACULTY` via `roleMiddleware(ROLES.ADMIN, ROLES.FACULTY)`.
  - `STUDENT` requests rejected with 403 Forbidden (`FORBIDDEN`).
  - Unauthenticated requests rejected with 401 Unauthorized (`UNAUTHORIZED`).
- **Immutable Audit Logging**: **COMPLETE**
  - Successful transitions log `EXAM_STATUS_TRANSITION` events in `audit_logs`.
  - Captures `entityType: 'Exam'`, `entityId`, `performedBy`, `performedByRole`, `previousStatus`, `newStatus`, `transitionedAt`, client IP, and user-agent.
  - Generates SHA-256 cryptographic `recordHash` preserving tamper evidence.
- **Testing & Verification**:
  - **Phase 3B Test Suite**: **33 / 33 passing** in `tests/examsLifecycle.test.js` (31 lifecycle & validation tests + 2 generic update hardening tests).
  - **Full Regression Test Suite**: **146 / 146 passing across 9 test suites** (0 failed).
- **Database Migration (`npm run db:migrate`)**: **PASS** (Synchronized database schema cleanly)
- **Database Seeding (`npm run db:seed`)**: **PASS** (Departments, subjects, and initial user accounts verified)
- **Server Startup (`npm start`)**: **PASS** (Binds port 5000 cleanly)

---

## Phase 3C Verification Checkpoint: Examination Governance & Ownership

### Overall Status & Boundaries
- **Phase 2 Status**: **COMPLETE** (Verified intact, all 87 Phase 2 tests continue passing)
- **Phase 3A Status**: **COMPLETE** (All Phase 3A requirements, CRUD APIs, validations, and tests verified)
- **Phase 3B Status**: **COMPLETE** (Examination lifecycle, state transitions, generic update hardening, audit logging verified)
- **Phase 3C Status**: **COMPLETE** (Faculty ownership, department boundaries, immutability, student visibility scoping verified)
- **Phase 3 Overall Status**: **COMPLETED** (Phase 3A, 3B, and 3C verified with 80/80 passing tests)
- **Phase 4 Status**: **NOT STARTED**
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Git Operations**: **NONE PERFORMED** (No files staged, committed, or deleted)

### Phase 3C Governance & Ownership Deliverables Verified:
1. **Faculty Ownership Enforcement**:
   - `FACULTY` may update, delete, and transition status only for examinations where `exam.createdBy === req.user.id`.
   - Cross-faculty mutation/deletion/transition attempts are strictly rejected with HTTP 403 (`FORBIDDEN`).
   - `ADMIN` retains full institutional override access across all examinations.
   - `createdBy` remains immutable.
2. **Department Boundary Enforcement**:
   - `FACULTY` may create examinations only within their assigned department (`req.user.departmentId === body.departmentId`). Cross-department creation rejected with HTTP 403 (`FORBIDDEN`).
   - For existing examinations, `FACULTY` may update, delete, and transition only examinations within their assigned department (`exam.departmentId === req.user.departmentId`). Cross-department management rejected with HTTP 403 (`FORBIDDEN`).
   - `FACULTY` cannot move examinations outside their assigned department via generic update (rejected with HTTP 403 `FORBIDDEN`).
   - `ADMIN` is exempt from department boundaries and can create, update, delete, and transition examinations across any department.
   - Academic consistency between Subject and Department (`subject.departmentId === exam.departmentId`) is preserved.
3. **Completed / Cancelled Examination Immutability**:
   - Generic `PUT /api/v1/exams/:id` and `PATCH /api/v1/exams/:id` updates on examinations in `COMPLETED` or `CANCELLED` status are strictly rejected with HTTP 400 (`EXAM_IMMUTABLE`).
   - Existing lifecycle terminal-state transition protections (`COMPLETED` -> [], `CANCELLED` -> []) remain intact.
4. **Student Visibility Scoping**:
   - `STUDENT` users are forbidden from viewing examinations in `DRAFT` status.
   - `GET /api/v1/exams` (list) automatically filters out all `DRAFT` examinations for `STUDENT` requests.
   - `GET /api/v1/exams?status=DRAFT` returns an empty items array (`items: []`) for `STUDENT` requests.
   - `GET /api/v1/exams/:id` returns HTTP 404 (`NOT_FOUND`) if a `STUDENT` attempts to retrieve a `DRAFT` examination by UUID.
   - Students retain access to read allowed published/scheduled non-draft examinations.
   - Students remain forbidden from creating, updating, deleting, or transitioning examinations (HTTP 403 `FORBIDDEN`).
5. **Testing & Verification**:
   - **Phase 3C Test Suite**: **21 / 21 passing** in `tests/examsGovernance.test.js`.
   - **Total Jest Test Suite**: **167 / 167 passing across 10 test suites** (0 failed):
     - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
     - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
     - `tests/exams.test.js`: 26 passed (Phase 3A)
     - `tests/users.test.js`: 27 passed (Phase 2)
     - `tests/auth.test.js`: 26 passed (Phase 2)
     - `tests/database.test.js`: 7 passed (Phase 1)
     - `tests/middleware.test.js`: 9 passed (Phase 1/2)
     - `tests/health.test.js`: 3 passed (Phase 1)
     - `tests/apiResponse.test.js`: 7 passed (Phase 1)
     - `tests/hashing.test.js`: 8 passed (Phase 1)
- **Database Migration (`npm run db:migrate`)**: **PASS** (Synchronized database schema cleanly)
- **Database Seeding (`npm run db:seed`)**: **PASS** (Departments, subjects, and initial user accounts verified)
- **Server Startup (`npm start`)**: **PASS** (Binds port 5000 cleanly)

---

## Phase 4A Verification Checkpoint: Question Paper Foundation & Storage

### Overall Status & Boundaries
- **Phase 1 Status**: **COMPLETE** (Verified intact, architecture and schema solid)
- **Phase 2 Status**: **COMPLETE** (Verified intact, 87/87 tests passing)
- **Phase 3 Status**: **COMPLETE** (Verified intact, 80/80 exam tests passing across Phase 3A [26/26], Phase 3B [33/33], Phase 3C [21/21])
- **Phase 4A Status**: **COMPLETE** (25/25 tests passing in `tests/questionPapers.test.js`)
- **Phase 4B Status**: **COMPLETE** (13/13 tests passing in `tests/questionPapersVerification.test.js`)
- **Phase 4 Total Verified Tests**: **38 Phase 4 tests** (Phase 4A: 25 + Phase 4B: 13)
- **Phase 4C Status**: **NOT STARTED**
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Total Test Suite**: **205 / 205 tests passing across 12 test suites** (0 failed)
- **Git Operations**: **NONE PERFORMED** (No Git operations run)

### Phase 4A Deliverables Verified:
1. **Upload Security & Configuration**:
   - Multer middleware configured with safe disk storage to `fileStorageService.uploadDir`.
   - Strict format validation enforcing only PDF (`.pdf`) and DOCX (`.docx`) with verified MIME types.
   - 10MB maximum file size limit enforced (`LIMIT_FILE_SIZE` mapped to 422 `VALIDATION_ERROR`).
   - Unsafe paths and directory traversals neutralized; filenames stored on disk use cryptographically unique UUIDs (`${uuidv4()}${safeExt}`).
   - Original filenames safely sanitized.
2. **QuestionPaper Model**:
   - Paranoid soft deletion (`paranoid: true`) enabled on `QuestionPaper`.
   - Existing schema, fields, and associations (`Exam`, `User`) fully preserved.
   - Verified clean database schema synchronization with SQLite alter strategy.
3. **Upload API (`POST /api/v1/exams/:examId/question-paper`)**:
   - Restricted to `ADMIN` and `FACULTY`.
   - `STUDENT` requests strictly rejected with 403 Forbidden (`FORBIDDEN`).
   - Unauthenticated requests rejected with 401 Unauthorized (`UNAUTHORIZED`).
   - Pre-validation enforces valid UUID format for `examId` (422) and non-deleted exam existence (404).
   - Accidental duplicate/overwrite rejected with 409 Conflict (`QUESTION_PAPER_ALREADY_EXISTS`).
   - Cryptographic SHA-256 hash calculated via existing `HashingService.hashFile` stream.
   - Atomic error cleanup ensures orphaned files are immediately deleted on failure.
4. **Retrieval & Download APIs**:
   - `GET /api/v1/question-papers/:id`: Retrieves metadata and associated Exam and Uploader entities.
   - `GET /api/v1/exams/:examId/question-paper`: Retrieves question paper metadata by Examination ID.
   - `GET /api/v1/question-papers/:id/download`: Securely streams the stored file with verified `Content-Type` and `Content-Disposition`.
   - Students strictly barred from metadata retrieval and file download (403 Forbidden).
5. **Soft Deletion & Re-upload Lifecycle**:
   - `DELETE /api/v1/question-papers/:id`: Soft-deletes record (populates `deletedAt`).
   - Subsequent `GET` returns 404 Not Found.
   - Subsequent upload for the same examination succeeds with a new question paper.
6. **Testing & Verification**:
   - **Phase 4A Test Suite**: **25 / 25 passing** in `tests/questionPapers.test.js`.
   - **Total Jest Test Suite**: **192 / 192 passing across 11 test suites** (0 failed):
     - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
     - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
     - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
     - `tests/exams.test.js`: 26 passed (Phase 3A)
     - `tests/users.test.js`: 27 passed (Phase 2)
     - `tests/auth.test.js`: 26 passed (Phase 2)
     - `tests/database.test.js`: 7 passed (Phase 1)
     - `tests/middleware.test.js`: 9 passed (Phase 1/2)
     - `tests/health.test.js`: 3 passed (Phase 1)
     - `tests/apiResponse.test.js`: 7 passed (Phase 1)
     - `tests/hashing.test.js`: 8 passed (Phase 1)
- **Database Migration (`npm run db:migrate`)**: **PASS**
- **Database Seeding (`npm run db:seed`)**: **PASS**

---

## Phase 4B Verification Checkpoint: Question Paper Integrity Verification & Audit Logging

### Overall Status & Boundaries
- **Phase 1 Status**: **COMPLETE** (Verified intact, architecture and schema solid)
- **Phase 2 Status**: **COMPLETE** (Verified intact, 87/87 tests passing)
- **Phase 3 Status**: **COMPLETE** (Verified intact, 80/80 exam tests passing across Phase 3A [26/26], Phase 3B [33/33], Phase 3C [21/21])
- **Phase 4A Status**: **COMPLETE** (25/25 tests passing in `tests/questionPapers.test.js`)
- **Phase 4B Status**: **COMPLETE** (13/13 tests passing in `tests/questionPapersVerification.test.js`)
- **Phase 4 Total Verified Tests**: **38 Phase 4 tests** (Phase 4A: 25 + Phase 4B: 13)
- **Phase 4C Status**: **NOT STARTED**
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Overall Project Tests**: **205 / 205 tests passing across 12 test suites** (0 failed)
- **Git Operations**: **NONE PERFORMED** (No Git operations run)

### Phase 4B Deliverables Verified:
1. **SHA-256 Integrity Verification (`POST /api/v1/question-papers/:id/verify`)**:
   - Re-computes SHA-256 cryptographic checksum of disk file using `HashingService.hashFile`.
   - Compares computed hash directly against stored `sha256Hash`.
   - Updates `verificationStatus` to `VERIFIED` on match with HTTP 200 and structured response payload.
2. **Tamper Detection**:
   - Accurately detects altered disk files upon re-verification, setting `verificationStatus` to `TAMPER_DETECTED`.
   - Returns informative HTTP 200 payload indicating verification failure and tamper detection (`isMatch: false`).
3. **Immutable Stored Hash Preservation**:
   - Original stored `sha256Hash` in database remains strictly immutable and is NEVER overwritten upon tamper detection.
4. **Verification Audit Events**:
   - Integrity matches record `QUESTION_PAPER_VERIFIED` event in `audit_logs` with cryptographic `recordHash`.
   - Tampering incidents record `QUESTION_PAPER_TAMPER_DETECTED` event in `audit_logs` with cryptographic `recordHash`.
5. **Upload & Download Audit Events**:
   - Successful file uploads record `QUESTION_PAPER_UPLOADED` with exam ID, file metadata, hash, and cryptographic `recordHash`.
   - Secure downloads record `QUESTION_PAPER_DOWNLOADED` with question paper ID, recipient user identity, and cryptographic `recordHash`.
6. **Delete Audit Event**:
   - Soft-deletion via `DELETE /api/v1/question-papers/:id` records `QUESTION_PAPER_DELETED` in `audit_logs` with cryptographic `recordHash`.
7. **Error Handling & RBAC**:
   - Missing disk file returns HTTP 404 (`NOT_FOUND`).
   - Non-existent and invalid UUID identifiers return HTTP 404 (`NOT_FOUND`).
   - Student role verification attempts rejected with HTTP 403 (`FORBIDDEN`).
   - Unauthenticated requests rejected with HTTP 401 (`UNAUTHORIZED`).
8. **Testing & Verification**:
   - **Phase 4B Test Suite**: **13 / 13 passing** in `tests/questionPapersVerification.test.js`.
   - **Total Phase 4 Tests**: **38 / 38 passing** (Phase 4A: 25, Phase 4B: 13).
   - **Overall Project Regression**: **205 / 205 passing across 12 test suites** (0 failed):
     - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
     - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
     - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
     - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
     - `tests/exams.test.js`: 26 passed (Phase 3A)
     - `tests/users.test.js`: 27 passed (Phase 2)
     - `tests/auth.test.js`: 26 passed (Phase 2)
     - `tests/database.test.js`: 7 passed (Phase 1)
     - `tests/middleware.test.js`: 9 passed (Phase 1/2)
     - `tests/health.test.js`: 3 passed (Phase 1)
     - `tests/apiResponse.test.js`: 7 passed (Phase 1)
     - `tests/hashing.test.js`: 8 passed (Phase 1)
- **Database Migration (`npm run db:migrate`)**: **PASS**
- **Database Seeding (`npm run db:seed`)**: **PASS**

---

## Phase 5A Verification Checkpoint: Evaluation & Marks Entry Foundation

### Overall Status & Boundaries
- **Phase 1 Status**: **COMPLETE** (Verified intact, architecture and schema solid)
- **Phase 2 Status**: **COMPLETE** (Verified intact, 87/87 tests passing)
- **Phase 3 Status**: **COMPLETE** (Verified intact, 80/80 exam tests passing across Phase 3A [26/26], Phase 3B [33/33], Phase 3C [21/21])
- **Phase 4 Status**: **COMPLETE** (Phase 4A [25/25], Phase 4B [13/13], Phase 4C [29/29] verified, 67/67 tests passing)
- **Phase 5A Status**: **COMPLETE** (23/23 tests passing in `tests/results.test.js`)
- **Phase 5B Status**: **NOT STARTED** (Result lifecycle transitions & approval workflow)
- **Phase 5C Status**: **NOT STARTED** (Faculty ownership, department boundaries, student visibility scoping)
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Git Operations**: **NONE PERFORMED** (No Git operations run)
- **Overall Project Tests**: **257 / 257 tests passing across 14 test suites** (0 failed)

### Phase 5A Deliverables Verified:
1. **Institutional Grading Scale & Calculation Utilities (`src/modules/results/gradingUtils.js`)**:
   - Standard 10-point letter grading scale: `S` (≥90%), `A` (80–89.99%), `B` (70–79.99%), `C` (60–69.99%), `D` (50–59.99%), `E` (40–49.99%), `F` (<40%).
   - Accurate percentage computation rounded to 2 decimal places (`calculatePercentage`).
   - Isolated grading scale definitions allowing configuration updates without modifying business logic.
2. **Result Validation & Constraints (`src/modules/results/resultsValidators.js`)**:
   - Validates marks obtained ensuring non-negative values and decimal precision up to 2 places (`DECIMAL(6,2)`).
   - Validates UUID format for `examId` and `studentId`.
   - Validates batch payload array structure and rejects duplicate student IDs within the same payload.
3. **Single Result Creation (`POST /api/v1/exams/:examId/results`)**:
   - Restricted to `ADMIN` and `FACULTY`.
   - Pre-validates examination existence and enforces eligible evaluation status (`ONGOING` or `COMPLETED`; rejects `DRAFT`, `SCHEDULED`, `CANCELLED`).
   - Verifies target user exists and possesses the `STUDENT` role.
   - Enforces marks bounds against authoritative `exam.maximumMarks`.
   - Prevents duplicate entries per examination and student (returns 409 Conflict with `DUPLICATE_RESULT`).
   - Automatically computes percentage and grade, setting initial status to `DRAFT`.
4. **Transactional Batch Result Entry (`POST /api/v1/exams/:examId/results/batch`)**:
   - Atomic database transaction wrapping all insertions via Sequelize.
   - Rolls back completely if any individual entry violates validation, marks bounds, or student constraints (0 records committed).
   - Generates audit log events post-transaction commit.
5. **Result Retrieval APIs**:
   - `GET /api/v1/results/:id`: Retrieves individual result with populated Exam, Student, and Faculty associations and computed percentage.
   - `GET /api/v1/exams/:examId/results`: Paginated results listing with `page`, `limit`, `submissionStatus`, and `studentId` filtering.
6. **Cryptographic Audit Logging**:
   - Successful result creation records `RESULT_CREATED` event in `audit_logs`.
   - Captures `entityType: 'Result'`, `entityId`, `performedBy`, `marksObtained`, `maximumMarks`, `percentage`, `grade`, client IP, and user-agent.
   - Computes SHA-256 cryptographic `recordHash` ensuring immutable tamper evidence.
7. **Testing & Verification**:
   - **Phase 5A Test Suite**: **23 / 23 passing** in `tests/results.test.js`.
   - **Overall Project Regression**: **257 / 257 passing across 14 test suites** (0 failed):
     - `tests/results.test.js`: 23 passed (Phase 5A)
     - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
     - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
     - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
     - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
     - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
     - `tests/exams.test.js`: 26 passed (Phase 3A)
     - `tests/users.test.js`: 27 passed (Phase 2)
     - `tests/auth.test.js`: 26 passed (Phase 2)
     - `tests/database.test.js`: 7 passed (Phase 1)
     - `tests/middleware.test.js`: 9 passed (Phase 1/2)
     - `tests/health.test.js`: 3 passed (Phase 1)
     - `tests/apiResponse.test.js`: 7 passed (Phase 1)
     - `tests/hashing.test.js`: 8 passed (Phase 1)

---

## Phase 5B Verification Checkpoint: Result Lifecycle & Audit Verification

### Overall Status & Boundaries
- **Phase 1 Status**: **COMPLETE** (Verified intact, architecture and schema solid)
- **Phase 2 Status**: **COMPLETE** (Verified intact, 87/87 tests passing)
- **Phase 3 Status**: **COMPLETE** (Verified intact, 80/80 exam tests passing; Exam lifecycle state machine strictly preserved)
- **Phase 4 Status**: **COMPLETE** (Phase 4A [25/25], Phase 4B [13/13], Phase 4C [29/29] verified, 67/67 tests passing)
- **Phase 5A Status**: **COMPLETE** (23/23 tests passing in `tests/results.test.js`)
- **Phase 5B Status**: **COMPLETE** (23/23 tests passing in `tests/resultsLifecycle.test.js`)
- **Phase 5C Status**: **NOT STARTED** (Faculty ownership, department boundaries, student visibility scoping)
- **Hyperledger Fabric**: **NOT YET ENABLED** (`FABRIC_ENABLED=false`, planned for Phases 7–8)
- **Git Operations**: **NONE PERFORMED** (No Git operations run)
- **Overall Project Tests**: **280 / 280 tests passing across 15 test suites** (0 failed)

### Architecture Decision: Decoupled Result Lifecycle
- `Exam.status` remains `COMPLETED` after an examination finishes.
- `Exam.status` is never transitioned to `RESULT_SUBMITTED` or `RESULT_PUBLISHED`.
- Phase 3 exam state machine remains 100% decoupled and intact (`examsService.js` and `examsLifecycle.test.js` unmodified).
- Result progression is managed entirely through `Result.submissionStatus`:
  ```
  DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED → PUBLISHED
                           ↓
                        REJECTED
                           ↓
                         DRAFT
  ```

### Phase 5B Deliverables Verified:
1. **Decoupled Result State Machine (`src/utils/constants.js`)**:
   - Explicit `VALID_RESULT_TRANSITIONS` transition matrix:
     - `DRAFT: [SUBMITTED]`
     - `SUBMITTED: [UNDER_REVIEW]`
     - `UNDER_REVIEW: [VERIFIED, REJECTED]`
     - `REJECTED: [DRAFT]`
     - `VERIFIED: [PUBLISHED]`
     - `PUBLISHED: []` (terminal state)
2. **Transition Validation & Protection (`src/modules/results/resultsValidators.js`)**:
   - `validateUpdateResultStatus`: Validates target result UUID and valid requested status string.
   - `validateBatchResultStatus`: Validates exam UUID and valid requested status string.
3. **Single Result Transition API (`PATCH /api/v1/results/:id/status`)**:
   - Role restricted to `ADMIN` and `FACULTY` (STUDENT rejected with 403 `FORBIDDEN`).
   - Rejects unpermitted jumps (e.g. `DRAFT -> PUBLISHED`, `DRAFT -> VERIFIED`) with 400 `INVALID_STATUS_TRANSITION`.
   - Rejects same-status transitions with 400 `SAME_STATUS_TRANSITION`.
   - Rejects transitions from terminal state `PUBLISHED` with 400 `INVALID_STATUS_TRANSITION`.
   - Enforces RBAC: Only `ADMIN` can transition `VERIFIED -> PUBLISHED` (non-admin receives 403 `FORBIDDEN`).
   - Updates lifecycle timestamps:
     - `SUBMITTED`: sets `submittedAt = new Date()`
     - `VERIFIED`: sets `verifiedBy = req.user.id`, `verifiedAt = new Date()`
     - `PUBLISHED`: sets `publishedAt = new Date()`
4. **Batch Result Transition API (`PATCH /api/v1/exams/:examId/results/status` & `PATCH /api/v1/results/exam/:examId/status`)**:
   - Wrapped in atomic Sequelize database transaction.
   - Pre-validates that all results under the examination can legally transition to the target status.
   - Atomic rollback: If any single result cannot transition legally, entire batch is rolled back and 0 results are updated.
   - Updates lifecycle timestamps on all matching results atomically.
5. **Cryptographic Audit Logging**:
   - Every status transition emits dedicated immutable audit events:
     - `RESULT_SUBMITTED`
     - `RESULT_UNDER_REVIEW`
     - `RESULT_VERIFIED`
     - `RESULT_PUBLISHED`
     - `RESULT_REJECTED`
     - `RESULT_REOPENED`
   - Computes 64-character SHA-256 `recordHash` incorporating entity ID, old status, new status, actor, and timestamp.
6. **SQLite Schema Migration Fix (`src/database/migrate.js`)**:
   - Replaced fragile conditional drop with deterministic SQLite cleanup ensuring `results` table is synchronized cleanly.
   - Disables foreign keys (`PRAGMA foreign_keys = OFF;`) during sync to avoid SQLite foreign key constraint lockouts.
   - Prevents Sequelize's SQLite alter query generator from erroneously injecting inline `UNIQUE` constraint onto `examId`.
7. **Automated Test Results**:
   - **Phase 5B Test Suite**: **23 / 23 passing** in `tests/resultsLifecycle.test.js`.
   - **Overall Project Regression**: **280 / 280 passing across 15 test suites** (0 failed):
     - `tests/resultsLifecycle.test.js`: 23 passed (Phase 5B)
     - `tests/results.test.js`: 23 passed (Phase 5A)
     - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
     - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
     - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
     - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
     - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
     - `tests/exams.test.js`: 26 passed (Phase 3A)
     - `tests/users.test.js`: 27 passed (Phase 2)
     - `tests/auth.test.js`: 26 passed (Phase 2)
     - `tests/database.test.js`: 7 passed (Phase 1)
     - `tests/middleware.test.js`: 9 passed (Phase 1/2)
     - `tests/health.test.js`: 3 passed (Phase 1)
     - `tests/apiResponse.test.js`: 7 passed (Phase 1)
     - `tests/hashing.test.js`: 8 passed (Phase 1)

---

## Phase 5C Progress & Verification Checkpoint: Results Governance, Ownership, Immutability & Student Scoping

### Status Summary
- **Phase 5C Status**: **COMPLETE**
- **Feature Completeness**: **Verified & Functional**
  - **Faculty Ownership**: Faculty creator (`exam.createdBy === user.id`) can create, manage, and retrieve results for their examinations. Faculty not owning the exam are forbidden (403 `FORBIDDEN`).
  - **EVALUATOR Assignment**: Faculty with active `ExamFacultyAssignment` with `assignmentRole === 'EVALUATOR'` can create, manage, and retrieve results for the assigned exam.
  - **INVIGILATOR Exclusion**: Faculty with `assignmentRole === 'INVIGILATOR'` alone are strictly prevented from evaluation and result management (403 `FORBIDDEN`).
  - **Department Boundary**: Faculty can only manage results within their assigned academic department (`exam.departmentId === user.departmentId`). Cross-department operations are rejected (403 `FORBIDDEN`).
  - **Administrative Authority**: Administrators (`ROLES.ADMIN`) retain unrestricted governance access across departments and faculty assignments.
  - **Student Single-Result Privacy**: Students (`ROLES.STUDENT`) can only retrieve their own result records (`result.studentId === userContext.id`) and only when officially published (`result.submissionStatus === 'PUBLISHED'`). Attempting to access another student's result or an interim status result (DRAFT, SUBMITTED, UNDER_REVIEW, VERIFIED, REJECTED) returns 404 `NOT_FOUND` without leaking existence or interim marks.
  - **Student Exam Result List Scoping**: Listing results for an exam (`GET /api/v1/exams/:examId/results`) automatically constrains results to `studentId = userContext.id` and `submissionStatus = 'PUBLISHED'`. Client cannot override these restrictions through query parameters.
  - **Terminal Immutability**: `PUBLISHED` results remain strictly immutable and terminal. Attempts to transition out of `PUBLISHED` status are rejected with 400 `INVALID_STATUS_TRANSITION`.
  - **Immutable Audit Logging**: Status transitions and result operations log cryptographic SHA-256 records via the unified `AuditService`.
- **Automated Tests**:
  - **Phase 5C Test Suite**: **26 / 26 passing** in `tests/resultsGovernance.test.js`
  - **Full Regression Test Suite**: **306 / 306 passing across 16 test suites** (0 failed):
    - `tests/resultsGovernance.test.js`: 26 passed (Phase 5C)
    - `tests/resultsLifecycle.test.js`: 23 passed (Phase 5B)
    - `tests/results.test.js`: 23 passed (Phase 5A)
    - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
    - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
    - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
    - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
    - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
    - `tests/exams.test.js`: 26 passed (Phase 3A)
    - `tests/users.test.js`: 27 passed (Phase 2)
    - `tests/auth.test.js`: 26 passed (Phase 2)
    - `tests/database.test.js`: 7 passed (Phase 1)
    - `tests/middleware.test.js`: 9 passed (Phase 1/2)
    - `tests/health.test.js`: 3 passed (Phase 1)
    - `tests/apiResponse.test.js`: 7 passed (Phase 1)
    - `tests/hashing.test.js`: 8 passed (Phase 1)
- **Database Migration (`npm run db:migrate`)**: **PASS**
- **Database Seeding (`npm run db:seed`)**: **PASS**
- **Hyperledger Fabric**: **DISABLED** (`FABRIC_ENABLED=false`)
- **Git Operations**: **NONE PERFORMED**

---

## Phase 6A Progress & Verification Checkpoint: Canonical Hashing & Deterministic Result Payload Preparation

### Status Summary
- **Phase 6A Status**: **COMPLETE**
- **Canonical Hashing Utility**: Implemented in `src/modules/results/resultHashUtils.js` and exported via `src/modules/results/index.js`.
- **Deterministic Serialization**:
  - Implemented `serializeCanonicalPayload()` ensuring deterministic JSON representation with keys sorted alphabetically.
  - Consistent normalization utilities:
    - `normalizeDecimal`: Formats numeric marks to 2 fixed decimal places (`85`, `85.0`, `85.00` -> `"85.00"`).
    - `normalizeDate`: Standardizes ISO-8601 UTC date string representation (`toISOString()`).
    - `normalizeIdentifier`: Trims whitespace and converts UUID/string identifiers to lowercase.
  - Authority hashing via `calculateResultHash()` producing 64-character lowercase SHA-256 hexadecimal digests via `HashingService`.
  - Hash verification via `verifyResultHash()` supporting case-insensitive constant-time comparisons.
- **Canonical Payload Attributes**:
  - Strictly limited to deterministic, immutable attributes:
    1. `resultId` (normalized string/UUID)
    2. `examId` (normalized string/UUID)
    3. `marksObtained` (normalized string, 2 decimal places)
    4. `maximumMarks` (normalized string, 2 decimal places)
    5. `grade` (trimmed uppercase string or null)
    6. `publishedAt` (ISO-8601 UTC string or null)
    7. `schemaVersion` (fixed string: `"1.0"`)
- **Privacy & PII Protection Decisions**:
  - Excluded sensitive and personally identifiable information (PII) from canonical hashing payload:
    - Student full name, email, remarks, passwords, session tokens, IP address, user agent.
    - Plaintext student identifiers (`studentId`) are intentionally omitted from Phase 6A ledger payload to prevent public or irreversible correlation with real-world identities on immutable ledgers.
    - Formal student pseudonym / reference mechanism is deferred to Phase 6B/7.
- **Hyperledger Fabric State**:
  - **Fabric Remains Disabled**: `FABRIC_ENABLED=false` in environment configuration.
  - **No Blockchain Anchoring Claimed**: Anchoring pipeline is prepared via canonical payload utilities; actual ledger transaction submission is scheduled for future phases.
- **Subsequent Phases State**:
  - **Phase 6B Status**: **COMPLETE**
  - **Phase 6C Status**: **NOT STARTED**
  - **Phase 7 Status**: **NOT STARTED**
- **Automated Tests**:
  - **Phase 6A Test Suite**: **20 / 20 passing** in `tests/resultHashUtils.test.js`
  - **Hashing Baseline Suite**: **3 / 3 passing** in `tests/hashing.test.js`
  - **Full Regression Test Suite**: **326 / 326 passing across 17 test suites** (0 failed)
- **Database Migration**: **NOT REQUIRED** (Existing schema supports all required attributes)
- **Git Operations**: **NONE PERFORMED**

---

## Phase 6B Progress & Verification Checkpoint: Blockchain Service Abstraction & Disabled-Mode Handling

### Status Summary
- **Phase 6B Status**: **COMPLETE**
- **Blockchain Service Abstraction**:
  - Implemented provider-independent service in `src/services/blockchainService.js` and exported via `src/modules/blockchain/index.js`.
  - Exposes unified interface:
    - `anchorResult(payload)`: Anchors result records or safely handles disabled mode.
    - `getTransactionStatus(transactionId)`: Queries local transaction records or safely reports disabled mode.
    - `verifyResultHash(payloadOrReference, expectedHash)`: Verifies canonical SHA-256 hash against expected hash or database reference.
    - `isFabricEnabled()`: Evaluates active Fabric integration configuration.
    - Helper methods: `buildCanonicalResultPayload(payload)`, `calculateResultHash(payload)`.
- **Fabric-Disabled Mode Handling (`FABRIC_ENABLED=false`)**:
  - **No Network / SDK Connection**: No connections, sockets, or HTTP requests to Fabric peers are attempted. Fabric SDK packages (`fabric-network`, `fabric-ca-client`) are not imported, required, or installed.
  - **Explicit Disabled-Mode Response**: `anchorResult` returns an explicit structured response with `anchored: false`, `status: 'DISABLED'`, `enabled: false`, and an informative message.
  - **No False Commitments**: Operations are never marked as `COMMITTED` or `PENDING` in disabled mode. No blockchain commitment is claimed.
  - **No Fake Hashes**: `txHash`, `transactionId`, and `blockNumber` remain strictly `null`.
  - **Canonical Hash Preservation**: Computes and preserves authoritative canonical payload SHA-256 hash (`payloadHash`) and deterministic canonical payload structure.
  - **Determinism**: Repeated calls with identical inputs produce identical canonical hashes and identical responses.
- **Database Safety & Persistence Contract**:
  - In disabled mode, no records are persisted to the `blockchain_transactions` table.
  - `BlockchainTransaction` schema constraints require a non-null unique `txHash` and ENUM status (`PENDING`, `COMMITTED`, `FAILED`). Because disabled mode cannot be represented accurately within these constraints without generating fake transaction hashes or misleading records, disabled mode is handled strictly at the service level without database persistence.
  - `Result` record's `blockchainTransactionId` remains `null`.
- **Privacy & PII Protection**:
  - Canonical payload strictly excludes all student personal identifiable information: student names, emails, remarks, passwords, session tokens, IP addresses, and user agents.
  - Plaintext `studentId` remains excluded from ledger payload; formal student pseudonym / reference design remains deferred.
- **Result Publication Workflow Integration**:
  - Existing `VERIFIED -> PUBLISHED` lifecycle transition in `src/modules/results/resultsService.js` includes a safe, non-blocking post-publication hook.
  - Publication completes successfully with HTTP 200, sets `publishedAt`, updates `submissionStatus` to `PUBLISHED`, and creates an immutable `AuditLog` entry.
  - Publication is never blocked by, dependent on, or coupled to Fabric availability.
  - Existing publication behavior, response format, and HTTP status codes remain 100% unchanged.
- **Hyperledger Fabric State**:
  - **Fabric Remains Disabled**: `FABRIC_ENABLED=false` in environment configuration.
  - **No Fabric Network or Chaincode Required**: Gateway implementation deferred to Phase 8.
- **Subsequent Phases State**:
  - **Phase 6C Status**: **COMPLETE** (Authenticated Result Hash Verification API & Governance Scoping)
  - **Phase 7 Status**: **NOT STARTED** (Hyperledger Fabric Chaincode Smart Contracts)
  - **Phase 8 Status**: **NOT STARTED** (Fabric Gateway & Unified Immutable Audit Trail)
- **Automated Tests**:
  - **Phase 6B Test Suite**: **29 / 29 passing** in `tests/blockchainService.test.js`
  - **Phase 6A Canonical Hash Suite**: **20 / 20 passing** in `tests/resultHashUtils.test.js`
  - **Results Lifecycle Suite**: **23 / 23 passing** in `tests/resultsLifecycle.test.js`
  - **Results Governance Suite**: **26 / 26 passing** in `tests/resultsGovernance.test.js`
  - **Results Evaluation Suite**: **23 / 23 passing** in `tests/results.test.js`
  - **Hashing Baseline Suite**: **3 / 3 passing** in `tests/hashing.test.js`
  - **Full Regression Test Suite**: **355 / 355 passing across 18 test suites** (0 failed):
    - `tests/blockchainService.test.js`: 29 passed (Phase 6B)
    - `tests/resultHashUtils.test.js`: 20 passed (Phase 6A)
    - `tests/resultsGovernance.test.js`: 26 passed (Phase 5C)
    - `tests/resultsLifecycle.test.js`: 23 passed (Phase 5B)
    - `tests/results.test.js`: 23 passed (Phase 5A)
    - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
    - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
    - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
    - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
    - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
    - `tests/exams.test.js`: 26 passed (Phase 3A)
    - `tests/users.test.js`: 27 passed (Phase 2)
    - `tests/auth.test.js`: 26 passed (Phase 2)
    - `tests/database.test.js`: 7 passed (Phase 1)
    - `tests/middleware.test.js`: 9 passed (Phase 1/2)
    - `tests/health.test.js`: 3 passed (Phase 1)
    - `tests/apiResponse.test.js`: 7 passed (Phase 1)
    - `tests/hashing.test.js`: 3 passed (Phase 1)
- **Database Migration**: **NOT REQUIRED** (Existing schema fully preserved)
- **Git Operations**: **NONE PERFORMED**

---

## Phase 6C Progress & Verification Checkpoint: Result Hash Verification & Controlled API

### Status Summary
- **Phase 6C Status**: **COMPLETE (Security Corrected)**
- **Result Verification Endpoint**:
  - Implemented `GET /api/v1/results/:id/verify` (optional query param: `?expectedHash=<hash>`, alias: `?hash=<hash>`).
  - Registered route in `src/modules/results/resultsRoutes.js` strictly preceding generic parameter routes (`/:id`).
  - Implemented query validation middleware `validationMiddleware(validateVerifyResult)` in `src/modules/results/resultsValidators.js`.
  - Implemented controller method `verify` in `src/modules/results/resultsController.js`.
  - Implemented service method `verifyResult(id, userContext, options)` in `src/modules/results/resultsService.js`.
- **Security Corrections Applied**:
  1. **Trusted Hash Authority Enforced**: Stored `BlockchainTransaction.payloadHash` is strictly authoritative and can never be overridden by a caller-supplied `expectedHash`. If a trusted anchor exists, it is the sole reference; conflicting caller hashes produce an explicit `MISMATCH`. Tampered records can never be verified by submitting a matching tampered hash.
  2. **Unanchored Result Handling**: When no trusted blockchain transaction exists and Fabric is disabled, submitting a matching hash returns `isMatch: true`, but strictly `verified: false` and `status: 'DISABLED'`. No false claims of institutional or blockchain verification are made.
  3. **Strict Parameter Validation**: Validated via `validateVerifyResult`: `expectedHash` and `hash` must be valid 64-character hexadecimal SHA-256 strings. Malformed strings, invalid lengths, and multiple query array parameters are rejected with HTTP 422 (`VALIDATION_ERROR`). Uppercase hex is supported and normalized.
- **Cryptographic Verification Engine**:
  - Powered by Phase 6B `BlockchainService.verifyResultHash()` and Phase 6A `resultHashUtils.js`.
  - Canonical hash calculation: Deterministically reconstructs canonical payload from stored result attributes (`resultId`, `examId`, `marksObtained`, `maximumMarks`, `grade`, `publishedAt`, `schemaVersion: '1.0'`) and produces 64-character lowercase SHA-256 hash.
  - Verification outcome: Boolean `isMatch`, `verified`, `tamperDetected`, `calculatedHash`, `expectedHash`, `status`, `message`.
- **Distinction Between Hashing & Status Concepts**:
  - `calculatedHash`: Deterministic SHA-256 hash calculated from current database result attributes.
  - `expectedHash`: Authoritative target hash (trusted `payloadHash` when anchored, or caller-supplied hash when unanchored).
  - `payloadHash`: Authoritative canonical payload hash stored on `BlockchainTransaction`.
  - `txHash`: Unique blockchain transaction identifier (e.g. `tx-hash-anchor-...`).
  - `blockchain.committed`: Strictly `false` in Fabric-disabled mode (never false positive).
  - `blockchain.enabled`: Strictly `false` when `FABRIC_ENABLED=false`.
- **Role-Based Access Control & IDOR Protection**:
  - Integrated with `ResultsService.getResultById(id, userContext)` enforcing Phase 5C governance rules:
    - **ADMIN**: Unrestricted verification access across all examinations and results; response payload strips PII.
    - **FACULTY**: Restricted by academic department boundary (`exam.departmentId === user.departmentId`) and either exam creator (`exam.createdBy === user.id`) or assigned `EVALUATOR` (`assignmentRole === 'EVALUATOR'`). Faculty with `INVIGILATOR` assignment only or unassigned/cross-department are strictly rejected with 403 `FORBIDDEN`.
    - **STUDENT**: Restricted strictly to their own published result (`result.studentId === user.id` and `result.submissionStatus === 'PUBLISHED'`). Accessing other students' results or interim statuses (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`) returns 404 `NOT_FOUND` without leaking existence or interim marks.
    - **Unauthenticated**: Missing or invalid Bearer token returns 401 `UNAUTHORIZED`.
    - **Invalid Identifiers / Missing Records**: Invalid UUIDs or non-existent results return 404 `NOT_FOUND`.
- **Safe Read-Only Operation & Zero Database Writes**:
  - Pure query verification: 0 database writes, updates, or deletions.
  - Results table unmodified; `blockchain_transactions` table unmodified; `audit_logs` table unmodified during verification requests.
  - Idempotent: Repeated verification requests return identical deterministic outputs.
- **Privacy & PII Protection**:
  - Response payload strictly contains result metadata, calculation details, and blockchain verification status.
  - Student names, emails, internal remarks, creator IDs, evaluator IDs, and user tokens are completely excluded.
- **Hyperledger Fabric State**:
  - **Fabric Remains Disabled**: `FABRIC_ENABLED=false` in environment configuration.
  - No Fabric SDK packages installed; no peer network connections attempted.
  - No mock/fake transaction IDs, block numbers, or committed states generated.
- **Subsequent Phases State**:
  - **Phase 7 Status**: **NOT STARTED** (Hyperledger Fabric Chaincode Smart Contracts)
  - **Phase 8 Status**: **NOT STARTED** (Fabric Gateway & Unified Immutable Audit Trail)
  - **Phase 9 Status**: **NOT STARTED** (Security Hardening, Edge Cases, Reconciliation)
  - **Phase 10 Status**: **NOT STARTED** (Automated Regression, Postman, Seed Data, Frontend Handover)
- **Automated Tests**:
  - **Phase 6C Test Suite**: **37 / 37 passing** in `tests/resultsVerification.test.js`
  - **Phase 6B Service Suite**: **29 / 29 passing** in `tests/blockchainService.test.js`
  - **Phase 6A Canonical Hash Suite**: **20 / 20 passing** in `tests/resultHashUtils.test.js`
  - **Full Regression Test Suite**: **392 / 392 passing across 19 test suites** (0 failed):
    - `tests/resultsVerification.test.js`: 37 passed (Phase 6C)
    - `tests/blockchainService.test.js`: 29 passed (Phase 6B)
    - `tests/resultHashUtils.test.js`: 20 passed (Phase 6A)
    - `tests/resultsGovernance.test.js`: 26 passed (Phase 5C)
    - `tests/resultsLifecycle.test.js`: 23 passed (Phase 5B)
    - `tests/results.test.js`: 23 passed (Phase 5A)
    - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
    - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
    - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
    - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
    - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
    - `tests/exams.test.js`: 26 passed (Phase 3A)
    - `tests/users.test.js`: 27 passed (Phase 2)
    - `tests/auth.test.js`: 26 passed (Phase 2)
    - `tests/database.test.js`: 7 passed (Phase 1)
    - `tests/middleware.test.js`: 9 passed (Phase 1/2)
    - `tests/health.test.js`: 3 passed (Phase 1)
    - `tests/apiResponse.test.js`: 7 passed (Phase 1)
    - `tests/hashing.test.js`: 3 passed (Phase 1)
- **Database Migration**: **NOT REQUIRED** (Existing schema fully preserved)
- **Git Operations**: **NONE PERFORMED**

---

## Phase 6D Progress & Verification Checkpoint: Blockchain Integration Readiness & Reconciliation

### Status Summary
- **Phase 6D Status**: **COMPLETE**
- **Phase 6 Overall Status**: **COMPLETED (Phase 6A, 6B, 6C, 6D)**
- **Result–Blockchain Transaction Relationship**:
  - Registered formal Sequelize association in `src/database/models/index.js`:
    - `Result.belongsTo(BlockchainTransaction, { foreignKey: 'blockchainTransactionId', targetKey: 'txHash', as: 'blockchainTransaction', constraints: false })`
    - `BlockchainTransaction.hasMany(Result, { foreignKey: 'blockchainTransactionId', sourceKey: 'txHash', as: 'results', constraints: false })`
  - Eager-loading verified (`as: 'blockchainTransaction'` and `as: 'results'`).
  - Zero DDL migration required (`constraints: false` preserves SQLite and PostgreSQL relational stability).
- **Blockchain Transaction Consistency**:
  - Reaffirmed separation of `txHash` (blockchain transaction identifier) and `payloadHash` (canonical result SHA-256 digest).
  - Maintained authoritative anchor precedence: caller `expectedHash` cannot override trusted database transaction anchors.
  - Zero fake transaction hashes, fake block numbers, or fake `COMMITTED` statuses generated in disabled mode.
  - Student PII strictly excluded from canonical payloads and responses.
- **Published Result Reconciliation**:
  - Implemented provider-independent reconciliation in `BlockchainService.reconcilePublishedResults({ examId, limit, offset })`.
  - Exposed admin-only service method in `ResultsService.reconcileResults(options, userContext)`.
  - Mounted admin-only endpoint: `GET /api/v1/results/reconciliation` (restricted to `ADMIN` role; `FACULTY` and `STUDENT` rejected with 403 `FORBIDDEN`).
  - Accurate classification across 4 required states:
    1. `DISABLED_UNANCHORED`: Fabric disabled and intentionally unanchored in local storage.
    2. `MISSING_TRANSACTION`: Fabric enabled but published result lacks transaction reference.
    3. `UNRESOLVED_REFERENCE`: Transaction reference exists on result but lacks corresponding database transaction record.
    4. `PAYLOAD_HASH_MISMATCH`: Stored transaction anchor does not match current canonical result calculation.
    5. `ANCHORED_COMMITTED` / `ANCHORED_PENDING` / `ANCHORED_CONSISTENT`: Consistent anchored records.
  - Strictly read-only: does not modify, publish, unpublish, or delete results; does not create fake blockchain transactions.
  - Zero student PII exposed in reconciliation response.
- **Hyperledger Fabric Readiness Non-Network Health Information**:
  - Implemented `BlockchainService.checkFabricReadiness(overrideConfig)`.
  - Extended `GET /api/v1/health` with `blockchain.readiness` property preserving existing keys.
  - Accurately reports non-network status without attempting live connections:
    - `DISABLED`: when `FABRIC_ENABLED=false`.
    - `CONFIG_MISSING`: when configuration parameters or connection profile are missing.
    - `CRYPTO_MATERIAL_MISSING`: when MSP certificate or private key files are missing on disk.
    - `CONFIG_READY`: when all local configuration and cryptographic files exist and are readable.
  - Zero secrets, private key contents, or absolute sensitive paths exposed in API responses.
- **Hyperledger Fabric State**:
  - **Fabric Remains Disabled**: `FABRIC_ENABLED=false` in environment configuration.
  - **No Live Fabric Gateway or Chaincode Required**: Gateway implementation deferred to Phase 8.
- **Subsequent Phases State**:
  - **Phase 7 Status**: **PLANNED** (Hyperledger Fabric Chaincode Smart Contracts)
  - **Phase 8 Status**: **PLANNED** (Fabric Gateway & Unified Immutable Audit Trail)
  - **Phase 9 Status**: **PLANNED** (Security Hardening, Edge Cases, Reconciliation)
  - **Phase 10 Status**: **PLANNED** (Automated Regression, Postman, Seed Data, Frontend Handover)
- **Automated Tests**:
  - **Phase 6D Test Suite**: **20 / 20 passing** in `tests/blockchainReconciliation.test.js`
  - **Phase 6C Test Suite**: **37 / 37 passing** in `tests/resultsVerification.test.js`
  - **Phase 6B Service Suite**: **29 / 29 passing** in `tests/blockchainService.test.js`
  - **Phase 6A Canonical Hash Suite**: **20 / 20 passing** in `tests/resultHashUtils.test.js`
  - **Full Regression Test Suite**: **412 / 412 passing across 20 test suites** (0 failed):
    - `tests/blockchainReconciliation.test.js`: 20 passed (Phase 6D)
    - `tests/resultsVerification.test.js`: 37 passed (Phase 6C)
    - `tests/blockchainService.test.js`: 29 passed (Phase 6B)
    - `tests/resultHashUtils.test.js`: 20 passed (Phase 6A)
    - `tests/resultsGovernance.test.js`: 26 passed (Phase 5C)
    - `tests/resultsLifecycle.test.js`: 23 passed (Phase 5B)
    - `tests/results.test.js`: 23 passed (Phase 5A)
    - `tests/questionPapersGovernance.test.js`: 29 passed (Phase 4C)
    - `tests/questionPapersVerification.test.js`: 13 passed (Phase 4B)
    - `tests/questionPapers.test.js`: 25 passed (Phase 4A)
    - `tests/examsGovernance.test.js`: 21 passed (Phase 3C)
    - `tests/examsLifecycle.test.js`: 33 passed (Phase 3B)
    - `tests/exams.test.js`: 26 passed (Phase 3A)
    - `tests/users.test.js`: 27 passed (Phase 2)
    - `tests/auth.test.js`: 26 passed (Phase 2)
    - `tests/database.test.js`: 7 passed (Phase 1)
    - `tests/middleware.test.js`: 9 passed (Phase 1/2)
    - `tests/health.test.js`: 3 passed (Phase 1)
    - `tests/apiResponse.test.js`: 7 passed (Phase 1)
    - `tests/hashing.test.js`: 8 passed (Phase 1)
- **Database Migration**: **NOT REQUIRED** (`constraints: false` preserves existing schema)
- **Git Operations**: **NONE PERFORMED**





