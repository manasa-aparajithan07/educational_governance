import logging
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy setup
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    future=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True
)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session and ensures it closes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Initializes database schema and populates initial seed data.
    Ensures that no plain-text passwords are ever stored.
    """
    # Import all models to ensure metadata registration
    import app.models  # noqa: F401
    from app.models.user import User, Department, UserRole
    from app.core.security import get_password_hash

    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified/created successfully.")

    db = SessionLocal()
    try:
        # 1. Seed standard Departments if none exist
        if db.query(Department).count() == 0:
            departments = [
                Department(name="Computer Science and Engineering", code="CSE"),
                Department(name="Information Technology", code="IT"),
                Department(name="Electronics and Communication Engineering", code="ECE"),
                Department(name="Mechanical Engineering", code="MECH"),
            ]
            db.add_all(departments)
            db.commit()
            logger.info("Seeded initial departments.")

        cse_dept = db.query(Department).filter(Department.code == "CSE").first()
        cse_id = cse_dept.id if cse_dept else None

        # 2. Seed initial Administrator if none exists
        admin_email = "admin@vit.ac.in"
        existing_admin = db.query(User).filter(User.email == admin_email).first()
        if not existing_admin:
            admin_user = User(
                email=admin_email,
                full_name="System Administrator",
                password_hash=get_password_hash("Admin@12345"),
                role=UserRole.ADMIN.value,
                registration_number="ADM-001",
                department_id=cse_id,
                is_active=True
            )
            db.add(admin_user)
            logger.info("Seeded default administrator.")

        # 3. Seed initial Faculty if none exists
        faculty_email = "faculty@vit.ac.in"
        existing_faculty = db.query(User).filter(User.email == faculty_email).first()
        if not existing_faculty:
            faculty_user = User(
                email=faculty_email,
                full_name="Dr. S. Ramanathan",
                password_hash=get_password_hash("Faculty@12345"),
                role=UserRole.FACULTY.value,
                registration_number="FAC-1001",
                department_id=cse_id,
                is_active=True
            )
            db.add(faculty_user)
            logger.info("Seeded default faculty member.")

        # 4. Seed initial Student if none exists
        student_email = "student@vit.ac.in"
        existing_student = db.query(User).filter(User.email == student_email).first()
        if not existing_student:
            student_user = User(
                email=student_email,
                full_name="Manasa Aparajithan",
                password_hash=get_password_hash("Student@12345"),
                role=UserRole.STUDENT.value,
                registration_number="25BCE5152",
                department_id=cse_id,
                is_active=True
            )
            db.add(student_user)
            logger.info("Seeded default student member.")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding database: {e}")
        raise
    finally:
        db.close()
