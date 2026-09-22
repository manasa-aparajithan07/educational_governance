import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


class ResultStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    marks_obtained = Column(Float, nullable=False)
    total_marks = Column(Float, nullable=False)
    grade = Column(String(10), nullable=True)
    status = Column(String(50), default=ResultStatus.DRAFT.value, nullable=False, index=True)
    remarks = Column(Text, nullable=True)
    evaluator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    blockchain_tx_id = Column(String(100), nullable=True, index=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_exam_student_result"),
    )

    exam = relationship("Exam", back_populates="results")
    student = relationship("User", foreign_keys=[student_id])
    evaluator = relationship("User", foreign_keys=[evaluator_id])
    grievances = relationship("Grievance", back_populates="result")
