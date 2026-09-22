import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.user import User, Department, UserRole
from app.core.security import get_password_hash

from sqlalchemy.pool import StaticPool

# Test database setup (in-memory SQLite with StaticPool)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Seed Department
    dept = Department(name="Computer Science and Engineering", code="CSE")
    db.add(dept)
    db.commit()

    # Seed Admin
    admin = User(
        email="admin@vit.ac.in",
        password_hash=get_password_hash("Admin@12345"),
        full_name="System Administrator",
        role=UserRole.ADMIN.value,
        registration_number="ADM-001",
        department_id=dept.id,
        is_active=True
    )
    # Seed Faculty
    faculty = User(
        email="faculty@vit.ac.in",
        password_hash=get_password_hash("Faculty@12345"),
        full_name="Dr. Faculty",
        role=UserRole.FACULTY.value,
        registration_number="FAC-001",
        department_id=dept.id,
        is_active=True
    )
    # Seed Student
    student = User(
        email="student@vit.ac.in",
        password_hash=get_password_hash("Student@12345"),
        full_name="Student One",
        role=UserRole.STUDENT.value,
        registration_number="25BCE5152",
        department_id=dept.id,
        is_active=True
    )
    db.add_all([admin, faculty, student])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_login_success():
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@vit.ac.in",
        "password": "Admin@12345"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["error"] is None
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]
    assert data["data"]["user"]["role"] == "ADMIN"


def test_login_invalid_credentials():
    response = client.post("/api/v1/auth/login", json={
        "email": "admin@vit.ac.in",
        "password": "WrongPassword!99"
    })
    assert response.status_code == 401
    data = response.json()
    assert data["success"] is False
    assert data["data"] is None
    assert data["error"]["code"] == "INVALID_CREDENTIALS"


def test_student_registration():
    response = client.post("/api/v1/auth/register", json={
        "full_name": "New Student",
        "email": "newstudent@vit.ac.in",
        "password": "NewStudent@12345",
        "registration_number": "25BCE9999",
        "department_id": 1,
        "phone": "+919876543210"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == "newstudent@vit.ac.in"
    assert data["data"]["role"] == "STUDENT"


def test_student_duplicate_email_registration():
    response = client.post("/api/v1/auth/register", json={
        "full_name": "Another Student",
        "email": "newstudent@vit.ac.in",
        "password": "AnotherPass@12345",
        "registration_number": "25BCE8888",
        "department_id": 1
    })
    assert response.status_code == 409
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "EMAIL_EXISTS"


def test_get_my_profile():
    # Login as student
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    token = login_res.json()["data"]["access_token"]

    # Get /auth/me
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["data"]["email"] == "student@vit.ac.in"


def test_rbac_student_forbidden_from_admin_user_list():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    student_token = login_res.json()["data"]["access_token"]

    # Attempt to access admin user list
    res = client.get("/api/v1/users", headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403
    data = response = res.json()
    assert data["success"] is False
    assert data["error"]["code"] == "FORBIDDEN"


def test_rbac_admin_allowed_user_list():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@vit.ac.in",
        "password": "Admin@12345"
    })
    admin_token = login_res.json()["data"]["access_token"]

    # Access admin user list
    res = client.get("/api/v1/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "items" in data["data"]
    assert "pagination" in data["data"]
    assert data["data"]["pagination"]["page"] == 1


def test_student_cannot_view_other_student_account():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    student_token = login_res.json()["data"]["access_token"]
    student_id = login_res.json()["data"]["user"]["id"]

    # Student trying to view user 1 (Admin)
    other_id = 1 if student_id != 1 else 2
    res = client.get(f"/api/v1/users/{other_id}", headers={"Authorization": f"Bearer {student_token}"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN_USER_ACCESS"


def test_token_refresh():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    refresh_token = login_res.json()["data"]["refresh_token"]

    refresh_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    data = refresh_res.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]


def test_logout():
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    token = login_res.json()["data"]["access_token"]
    refresh_token = login_res.json()["data"]["refresh_token"]

    res = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_validation_error_structure():
    # Attempt to login with invalid email format and missing password
    response = client.post("/api/v1/auth/login", json={
        "email": "not-an-email"
    })
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert data["data"] is None
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(data["error"]["details"], list)
    assert len(data["error"]["details"]) > 0
    assert "field" in data["error"]["details"][0]
    assert "message" in data["error"]["details"][0]


def test_change_password_workflow():
    # Login as student
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    token = login_res.json()["data"]["access_token"]

    # Change password
    change_res = client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "Student@12345",
            "new_password": "NewStudentPassword@2026"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert change_res.status_code == 200
    assert change_res.json()["success"] is True

    # Old password should fail now
    old_login = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "Student@12345"
    })
    assert old_login.status_code == 401

    # New password should succeed
    new_login = client.post("/api/v1/auth/login", json={
        "email": "student@vit.ac.in",
        "password": "NewStudentPassword@2026"
    })
    assert new_login.status_code == 200
    assert new_login.json()["success"] is True


def test_admin_create_and_delete_user():
    # Login as admin
    login_res = client.post("/api/v1/auth/login", json={
        "email": "admin@vit.ac.in",
        "password": "Admin@12345"
    })
    admin_token = login_res.json()["data"]["access_token"]

    # Admin creates faculty
    create_res = client.post(
        "/api/v1/users",
        json={
            "full_name": "Prof. Alan Turing",
            "email": "turing@vit.ac.in",
            "password": "TuringPassword@123",
            "role": "FACULTY",
            "registration_number": "FAC-9999",
            "department_id": 1,
            "phone": "+919876543299"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert create_res.status_code == 201
    faculty_id = create_res.json()["data"]["id"]

    # Admin soft-deletes the created faculty
    del_res = client.delete(f"/api/v1/users/{faculty_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Deleted faculty should no longer appear in active user list
    get_res = client.get(f"/api/v1/users/{faculty_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert get_res.status_code == 404


def test_department_endpoints():
    res = client.get("/api/v1/departments")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

