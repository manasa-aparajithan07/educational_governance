'use strict';

const {
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
} = require('../src/database/models');

describe('Database Architecture & Model Integrity', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it('should authenticate successfully with the configured database', async () => {
    await expect(sequelize.authenticate()).resolves.not.toThrow();
  });

  it('should have all 14 normalized stable models registered on sequelize', () => {
    const modelNames = Object.keys(sequelize.models);
    const expectedModels = [
      'User',
      'Department',
      'Subject',
      'Exam',
      'ExamFacultyAssignment',
      'ExamStudent',
      'QuestionPaper',
      'FileMetadata',
      'Result',
      'Grievance',
      'GrievanceHistory',
      'AuditLog',
      'BlockchainTransaction',
      'RefreshToken',
    ];

    for (const model of expectedModels) {
      expect(modelNames).toContain(model);
    }
  });

  describe('Model Association Integrity', () => {
    it('should have proper associations for Academic entities', () => {
      expect(Department.associations.users).toBeDefined();
      expect(Department.associations.subjects).toBeDefined();
      expect(Subject.associations.department).toBeDefined();
      expect(Subject.associations.exams).toBeDefined();
      expect(Exam.associations.subject).toBeDefined();
    });

    it('should have proper associations for Exam assignments and enrollments', () => {
      expect(Exam.associations.facultyAssignments).toBeDefined();
      expect(Exam.associations.enrolledStudents).toBeDefined();
      expect(ExamFacultyAssignment.associations.exam).toBeDefined();
      expect(ExamFacultyAssignment.associations.faculty).toBeDefined();
      expect(ExamStudent.associations.exam).toBeDefined();
      expect(ExamStudent.associations.student).toBeDefined();
    });

    it('should have proper associations for QuestionPapers, Results, and Grievances', () => {
      expect(Exam.associations.questionPapers).toBeDefined();
      expect(QuestionPaper.associations.exam).toBeDefined();
      expect(QuestionPaper.associations.uploader).toBeDefined();

      expect(Exam.associations.results).toBeDefined();
      expect(Result.associations.exam).toBeDefined();
      expect(Result.associations.student).toBeDefined();

      expect(Grievance.associations.student).toBeDefined();
      expect(Grievance.associations.exam).toBeDefined();
      expect(Grievance.associations.history).toBeDefined();
      expect(GrievanceHistory.associations.grievance).toBeDefined();
    });

    it('should configure soft deletion (paranoid) for critical operational entities', () => {
      expect(User.options.paranoid).toBe(true);
      expect(Exam.options.paranoid).toBe(true);
      expect(Result.options.paranoid).toBe(true);
      expect(Grievance.options.paranoid).toBe(true);
    });

    it('should configure append-only immutable tracking for audit, blockchain, and history logs', () => {
      expect(AuditLog.options.updatedAt).toBe(false);
      expect(BlockchainTransaction.options.updatedAt).toBe(false);
      expect(GrievanceHistory.options.updatedAt).toBe(false);
      expect(RefreshToken.options.updatedAt).toBe(false);
    });
  });
});
