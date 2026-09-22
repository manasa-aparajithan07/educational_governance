import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


class GrievanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"


class Grievance(Base):
    __tablename__ = "grievances"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    result_id = Column(Integer, ForeignKey("results.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    grievance_type = Column(String(100), nullable=False)  # RE_EVALUATION, TOTALING_ERROR, MISSING_MARKS, OTHER
    description = Column(Text, nullable=False)
    status = Column(String(50), default=GrievanceStatus.PENDING.value, nullable=False, index=True)
    assigned_faculty_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    result = relationship("Result", back_populates="grievances")
    student = relationship("User", foreign_keys=[student_id])
    assigned_faculty = relationship("User", foreign_keys=[assigned_faculty_id])
    history = relationship("GrievanceHistory", back_populates="grievance", cascade="all, delete-orphan")


class GrievanceHistory(Base):
    __tablename__ = "grievance_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    grievance_id = Column(Integer, ForeignKey("grievances.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    previous_status = Column(String(50), nullable=False)
    new_status = Column(String(50), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    grievance = relationship("Grievance", back_populates="history")
    actor = relationship("User")
