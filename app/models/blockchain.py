import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, BigInteger
)
from app.database import Base


class TransactionStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"


class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tx_hash = Column(String(128), unique=True, nullable=False, index=True)
    channel_name = Column(String(100), default="examchannel", nullable=False)
    chaincode_name = Column(String(100), default="examchaincode", nullable=False)
    function_name = Column(String(100), nullable=False)
    payload_hash = Column(String(64), nullable=False, index=True)
    status = Column(String(50), default=TransactionStatus.PENDING.value, nullable=False, index=True)
    block_number = Column(BigInteger, nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
