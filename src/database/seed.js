'use strict';

const bcrypt = require('bcryptjs');
const {
  sequelize,
  Department,
  Subject,
  User,
} = require('./models');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');
const config = require('../config/env');

async function seed() {
  try {
    logger.info('Starting database seeding...');
    await sequelize.sync();

    // 1. Seed Departments
    const deptCount = await Department.count();
    let cseDept;
    let itDept;
    let eceDept;
    if (deptCount === 0) {
      logger.info('Seeding departments...');
      cseDept = await Department.create({
        name: 'Computer Science and Engineering',
        code: 'CSE',
      });
      itDept = await Department.create({
        name: 'Information Technology',
        code: 'IT',
      });
      eceDept = await Department.create({
        name: 'Electronics and Communication Engineering',
        code: 'ECE',
      });
    } else {
      cseDept = await Department.findOne({ where: { code: 'CSE' } });
      itDept = await Department.findOne({ where: { code: 'IT' } });
      eceDept = await Department.findOne({ where: { code: 'ECE' } });
    }

    // 2. Seed Subjects
    const subjectCount = await Subject.count();
    if (subjectCount === 0 && cseDept) {
      logger.info('Seeding subjects...');
      await Subject.create({
        code: 'BACSE350',
        name: 'Blockchain Architecture and Design',
        departmentId: cseDept.id,
        credits: 4,
      });
    } else if (cseDept) {
      await Subject.update({ departmentId: cseDept.id }, { where: { code: 'BACSE350' } });
    }
    if (eceDept) {
      await Subject.update({ departmentId: eceDept.id }, { where: { code: 'BTECE201' } });
    }

    // 3. Seed Users (Bcrypt hashed, no plaintext)
    const saltRounds = config.jwt.bcryptSaltRounds;

    // Seed Admin
    const adminExists = await User.findOne({ where: { email: 'admin@vit.ac.in' } });
    if (!adminExists) {
      logger.info('Seeding default administrator...');
      const adminPasswordHash = await bcrypt.hash('Admin@12345', saltRounds);
      await User.create({
        fullName: 'System Administrator',
        email: 'admin@vit.ac.in',
        passwordHash: adminPasswordHash,
        role: ROLES.ADMIN,
        facultyId: 'ADM-001',
        department: 'CSE',
        departmentId: cseDept ? cseDept.id : null,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }

    // Seed Faculty
    const facultyExists = await User.findOne({ where: { email: 'faculty@vit.ac.in' } });
    if (!facultyExists) {
      logger.info('Seeding default faculty member...');
      const facultyPasswordHash = await bcrypt.hash('Faculty@12345', saltRounds);
      await User.create({
        fullName: 'Dr. S. Ramanathan',
        email: 'faculty@vit.ac.in',
        passwordHash: facultyPasswordHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-1001',
        department: 'CSE',
        departmentId: cseDept ? cseDept.id : null,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }

    // Seed Student
    const studentExists = await User.findOne({ where: { email: 'student@vit.ac.in' } });
    if (!studentExists) {
      logger.info('Seeding default student member...');
      const studentPasswordHash = await bcrypt.hash('Student@12345', saltRounds);
      await User.create({
        fullName: 'Manasa Aparajithan',
        email: 'student@vit.ac.in',
        passwordHash: studentPasswordHash,
        role: ROLES.STUDENT,
        studentId: '25BCE5152',
        department: 'CSE',
        departmentId: cseDept ? cseDept.id : null,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }

    // Align departmentId on all existing users by department code
    if (cseDept) {
      await User.update({ departmentId: cseDept.id }, { where: { department: 'CSE' } });
    }
    if (itDept) {
      await User.update({ departmentId: itDept.id }, { where: { department: 'IT' } });
    }
    if (eceDept) {
      await User.update({ departmentId: eceDept.id }, { where: { department: 'ECE' } });
    }

    logger.info('Database seeding completed successfully.');
    return true;
  } catch (error) {
    logger.error('Seeding failed:', error);
    throw error;
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      logger.info('Seed process finished.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Seed process exited with error:', err);
      process.exit(1);
    });
}

module.exports = seed;
