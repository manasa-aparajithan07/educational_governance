import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


class ExamStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    RESULTS_PUBLISHED = "RESULTS_PUBLISHED"
    CANCELLED = "CANCELLED"


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    credits = Column(Integer, default=3, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    department = relationship("Department", back_populates="subjects")
    exams = relationship("Exam", back_populates="subject")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_date = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=180)
    total_marks = Column(Float, nullable=False, default=100.0)
    passing_marks = Column(Float, nullable=False, default=40.0)
    status = Column(String(50), default=ExamStatus.DRAFT.value, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    deleted_at = Column(DateTime, nullable=True, index=True)

    subject = relationship("Subject", back_populates="exams")
    faculty_assignments = relationship("ExamFacultyAssignment", back_populates="exam", cascade="all, delete-orphan")
    student_enrollments = relationship("ExamStudent", back_populates="exam", cascade="all, delete-orphan")
    question_papers = relationship("QuestionPaper", back_populates="exam", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="exam")


class ExamFacultyAssignment(Base):
    __tablename__ = "exam_faculty_assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    faculty_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="INVIGILATOR", nullable=False)  # INVIGILATOR, EVALUATOR
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "faculty_id", "role", name="uq_exam_faculty_assignment"),
    )

    exam = relationship("Exam", back_populates="faculty_assignments")


class ExamStudent(Base):
    __tablename__ = "exam_students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    attendance_status = Column(String(50), default="PENDING", nullable=False)  # PENDING, PRESENT, ABSENT
    registered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_exam_student_enrollment"),
    )

    exam = relationship("Exam", back_populates="student_enrollments")
