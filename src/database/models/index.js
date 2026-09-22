'use strict';

const { sequelize } = require('../../config/database');

// Import model definitions
const UserModel = require('./User');
const DepartmentModel = require('./Department');
const SubjectModel = require('./Subject');
const ExamModel = require('./Exam');
const ExamFacultyAssignmentModel = require('./ExamFacultyAssignment');
const ExamStudentModel = require('./ExamStudent');
const QuestionPaperModel = require('./QuestionPaper');
const FileMetadataModel = require('./FileMetadata');
const ResultModel = require('./Result');
const GrievanceModel = require('./Grievance');
const GrievanceHistoryModel = require('./GrievanceHistory');
const AuditLogModel = require('./AuditLog');
const BlockchainTransactionModel = require('./BlockchainTransaction');
const RefreshTokenModel = require('./RefreshToken');

// Initialize models
const User = UserModel(sequelize);
const Department = DepartmentModel(sequelize);
const Subject = SubjectModel(sequelize);
const Exam = ExamModel(sequelize);
const ExamFacultyAssignment = ExamFacultyAssignmentModel(sequelize);
const ExamStudent = ExamStudentModel(sequelize);
const QuestionPaper = QuestionPaperModel(sequelize);
const FileMetadata = FileMetadataModel(sequelize);
const Result = ResultModel(sequelize);
const Grievance = GrievanceModel(sequelize);
const GrievanceHistory = GrievanceHistoryModel(sequelize);
const AuditLog = AuditLogModel(sequelize);
const BlockchainTransaction = BlockchainTransactionModel(sequelize);
const RefreshToken = RefreshTokenModel(sequelize);

// Associations

// Department <-> User
Department.hasMany(User, { foreignKey: 'departmentId', as: 'users' });
User.belongsTo(Department, { foreignKey: 'departmentId', as: 'departmentRef' });

// Department <-> Subject
Department.hasMany(Subject, { foreignKey: 'departmentId', as: 'subjects' });
Subject.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

// Department <-> Exam
Department.hasMany(Exam, { foreignKey: 'departmentId', as: 'exams' });
Exam.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

// Subject <-> Exam
Subject.hasMany(Exam, { foreignKey: 'subjectId', as: 'exams' });
Exam.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// Exam <-> Creator & Approver (User)
User.hasMany(Exam, { foreignKey: 'createdBy', as: 'createdExams' });
Exam.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
Exam.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

// Exam <-> Faculty Assignments
Exam.hasMany(ExamFacultyAssignment, { foreignKey: 'examId', as: 'facultyAssignments' });
ExamFacultyAssignment.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
User.hasMany(ExamFacultyAssignment, { foreignKey: 'facultyId', as: 'assignedExams' });
ExamFacultyAssignment.belongsTo(User, { foreignKey: 'facultyId', as: 'faculty' });

// Exam <-> Student Enrollments
Exam.hasMany(ExamStudent, { foreignKey: 'examId', as: 'enrolledStudents' });
ExamStudent.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
User.hasMany(ExamStudent, { foreignKey: 'studentId', as: 'studentExams' });
ExamStudent.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

// Exam <-> QuestionPaper
Exam.hasMany(QuestionPaper, { foreignKey: 'examId', as: 'questionPapers' });
QuestionPaper.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
QuestionPaper.belongsTo(User, { foreignKey: 'uploadedBy', as: 'uploader' });

// Exam <-> Result
Exam.hasMany(Result, { foreignKey: 'examId', as: 'results' });
Result.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
User.hasMany(Result, { foreignKey: 'studentId', as: 'studentResults' });
Result.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Result.belongsTo(User, { foreignKey: 'facultyId', as: 'faculty' });
Result.belongsTo(User, { foreignKey: 'verifiedBy', as: 'verifier' });

// Result <-> Grievance
Result.hasMany(Grievance, { foreignKey: 'resultId', as: 'grievances' });
Grievance.belongsTo(Result, { foreignKey: 'resultId', as: 'result' });

// Exam <-> Grievance
Exam.hasMany(Grievance, { foreignKey: 'examId', as: 'examGrievances' });
Grievance.belongsTo(Exam, { foreignKey: 'examId', as: 'exam' });
User.hasMany(Grievance, { foreignKey: 'studentId', as: 'filedGrievances' });
Grievance.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Grievance.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });

// Grievance <-> GrievanceHistory
Grievance.hasMany(GrievanceHistory, { foreignKey: 'grievanceId', as: 'history' });
GrievanceHistory.belongsTo(Grievance, { foreignKey: 'grievanceId', as: 'grievance' });
GrievanceHistory.belongsTo(User, { foreignKey: 'actionBy', as: 'actor' });

// User <-> RefreshToken
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });

// User <-> AuditLog
User.hasMany(AuditLog, { foreignKey: 'performedBy', as: 'auditActions', onDelete: 'SET NULL' });
AuditLog.belongsTo(User, { foreignKey: 'performedBy', as: 'performer', onDelete: 'SET NULL' });

// Result <-> BlockchainTransaction (Phase 6D: Logical association without physical DDL constraint)
Result.belongsTo(BlockchainTransaction, {
  foreignKey: 'blockchainTransactionId',
  targetKey: 'txHash',
  as: 'blockchainTransaction',
  constraints: false,
});
BlockchainTransaction.hasMany(Result, {
  foreignKey: 'blockchainTransactionId',
  sourceKey: 'txHash',
  as: 'results',
  constraints: false,
});

module.exports = {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  ExamFacultyAssignment,
  ExamStudent,
  QuestionPaper,
  FileMetadata,
  Result,
  Grievance,
  GrievanceHistory,
  AuditLog,
  BlockchainTransaction,
  RefreshToken,
};
