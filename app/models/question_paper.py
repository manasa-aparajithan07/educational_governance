import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger, Text
from sqlalchemy.orm import relationship
from app.database import Base


class PaperStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    original_filename = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class QuestionPaper(Base):
    __tablename__ = "question_papers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    file_metadata_id = Column(Integer, ForeignKey("file_metadata.id", ondelete="RESTRICT"), nullable=False)
    title = Column(String(255), nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    status = Column(String(50), default=PaperStatus.DRAFT.value, nullable=False, index=True)
    blockchain_tx_id = Column(String(100), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    exam = relationship("Exam", back_populates="question_papers")
    file = relationship("FileMetadata")
