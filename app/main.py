from __future__ import annotations

import os
import secrets
from datetime import date
from pathlib import Path
from typing import Generator, List, Optional, Set

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from sqlmodel import Field, Session, SQLModel, create_engine, select

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DB_PATH = ROOT_DIR / "matrix.db"
STATIC_DIR = BASE_DIR / "static"

DATABASE_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
security = HTTPBasic(auto_error=False)


class OrganizationBase(SQLModel):
    name: str
    description: Optional[str] = None


class Organization(OrganizationBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    id: int


class OrganizationUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None


class EmployeeBase(SQLModel):
    name: str
    role: Optional[str] = None
    employee_type: str = "IC"
    location: Optional[str] = None
    capacity: float = 1.0
    manager_id: Optional[int] = None


class Employee(EmployeeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    manager_id: Optional[int] = Field(default=None, foreign_key="employee.id")


class EmployeeCreate(EmployeeBase):
    organization_id: int


class EmployeeRead(EmployeeBase):
    id: int
    organization_id: int
    organization_name: Optional[str] = None
    manager_name: Optional[str] = None
    direct_report_count: int = 0


class EmployeeUpdate(SQLModel):
    name: Optional[str] = None
    role: Optional[str] = None
    employee_type: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[float] = None
    organization_id: Optional[int] = None
    manager_id: Optional[int] = None


class ProjectBase(SQLModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: int


class ProjectUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class AssignmentBase(SQLModel):
    employee_id: int = Field(foreign_key="employee.id")
    project_id: int = Field(foreign_key="project.id")
    start_date: date
    end_date: date
    allocation: float = 1.0
    notes: Optional[str] = None


class Assignment(AssignmentBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentUpdate(SQLModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    allocation: Optional[float] = None
    notes: Optional[str] = None


class AssignmentRead(SQLModel):
    id: int
    employee_id: int
    project_id: int
    start_date: date
    end_date: date
    allocation: float
    notes: Optional[str]
    employee_name: Optional[str]
    project_name: Optional[str]


app = FastAPI(title="Matrix Manager", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_auth_username() -> str:
    return os.getenv("MATRIX_AUTH_USERNAME", "admin")


def get_auth_password() -> str:
    return os.getenv("MATRIX_AUTH_PASSWORD", "changeme")


def auth_challenge_response() -> Response:
    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Matrix Manager"'},
    )


def verify_basic_auth(credentials: Optional[HTTPBasicCredentials]) -> bool:
    if credentials is None:
        return False
    expected_username = get_auth_username()
    expected_password = get_auth_password()
    return secrets.compare_digest(credentials.username, expected_username) and secrets.compare_digest(credentials.password, expected_password)


@app.middleware("http")
async def require_basic_auth(request: Request, call_next):
    credentials = await security(request)
    if not verify_basic_auth(credentials):
        return auth_challenge_response()
    return await call_next(request)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def run_migrations() -> None:
    with engine.begin() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(employee)").fetchall()
        column_names = {row[1] for row in columns}
        if "manager_id" not in column_names:
            connection.exec_driver_sql("ALTER TABLE employee ADD COLUMN manager_id INTEGER")
        if "employee_type" not in column_names:
            connection.exec_driver_sql("ALTER TABLE employee ADD COLUMN employee_type TEXT DEFAULT 'IC'")
        connection.exec_driver_sql("UPDATE employee SET employee_type = 'IC' WHERE employee_type IS NULL OR employee_type = ''")


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def static_asset_url(relative_path: str) -> str:
    asset_path = STATIC_DIR / relative_path
    version = int(asset_path.stat().st_mtime) if asset_path.exists() else 0
    return f"/static/{relative_path}?v={version}"


def serve_html_page(filename: str, replacements: Optional[dict[str, str]] = None) -> str:
    html = (STATIC_DIR / filename).read_text(encoding="utf-8")
    replacements = replacements or {}
    for old, new in replacements.items():
        html = html.replace(old, new)
    return html


@app.on_event("startup")
def on_startup() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    create_db_and_tables()
    run_migrations()


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def serve_index() -> str:
    return serve_html_page(
        "planning.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/planning.js"': f'src="{static_asset_url("planning.js")}"',
        },
    )


@app.get("/people", response_class=HTMLResponse)
def serve_employees() -> str:
    return serve_html_page(
        "employees.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/employees.js"': f'src="{static_asset_url("employees.js")}"',
        },
    )


@app.get("/staffing", response_class=HTMLResponse)
def serve_assignments() -> str:
    return serve_html_page(
        "assignments.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/assignments.js"': f'src="{static_asset_url("assignments.js")}"',
        },
    )


@app.get("/canvas", response_class=HTMLResponse)
def serve_canvas() -> str:
    return serve_html_page(
        "canvas.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/canvas.js"': f'src="{static_asset_url("canvas.js")}"',
        },
    )


@app.get("/dashboard", response_class=HTMLResponse)
def serve_dashboard() -> str:
    return serve_html_page(
        "project-dashboard.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/project-dashboard.js"': f'src="{static_asset_url("project-dashboard.js")}"',
        },
    )


@app.get("/orgs", response_class=HTMLResponse)
def serve_org_manager() -> str:
    return serve_html_page(
        "organizations.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/organizations.js"': f'src="{static_asset_url("organizations.js")}"',
        },
    )


# Organization routes
@app.get("/organizations", response_model=List[OrganizationRead])
def list_organizations(session: Session = Depends(get_session)):
    organizations = session.exec(select(Organization).order_by(Organization.name)).all()
    return organizations


@app.post("/organizations", response_model=OrganizationRead, status_code=201)
def create_organization(organization: OrganizationCreate, session: Session = Depends(get_session)):
    db_org = Organization.from_orm(organization)
    session.add(db_org)
    session.commit()
    session.refresh(db_org)
    return db_org


@app.put("/organizations/{organization_id}", response_model=OrganizationRead)
def update_organization(organization_id: int, update: OrganizationUpdate, session: Session = Depends(get_session)):
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    for key, value in update.dict(exclude_unset=True).items():
        setattr(organization, key, value)
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return organization


@app.delete("/organizations/{organization_id}", status_code=204)
def delete_organization(organization_id: int, session: Session = Depends(get_session)):
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    employee_count = session.exec(select(Employee).where(Employee.organization_id == organization_id)).first()
    if employee_count:
        raise HTTPException(status_code=400, detail="Cannot delete organization with assigned employees")
    session.delete(organization)
    session.commit()


# Employee routes
@app.get("/employees", response_model=List[EmployeeRead])
def list_employees(session: Session = Depends(get_session)):
    employees = session.exec(select(Employee).order_by(Employee.name)).all()
    return [serialize_employee(session, emp) for emp in employees]


@app.post("/employees", response_model=EmployeeRead, status_code=201)
def create_employee(employee: EmployeeCreate, session: Session = Depends(get_session)):
    employee_payload = employee.dict()
    validate_employee_payload(session, employee_payload)
    db_employee = Employee.from_orm(employee)
    session.add(db_employee)
    session.commit()
    session.refresh(db_employee)
    return serialize_employee(session, db_employee)


@app.get("/employees/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: int, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return serialize_employee(session, employee)


@app.put("/employees/{employee_id}", response_model=EmployeeRead)
def update_employee(employee_id: int, update: EmployeeUpdate, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee_data = update.dict(exclude_unset=True)
    proposed_employee = {
        "name": employee_data.get("name", employee.name),
        "role": employee_data.get("role", employee.role),
        "employee_type": employee_data.get("employee_type", employee.employee_type),
        "location": employee_data.get("location", employee.location),
        "capacity": employee_data.get("capacity", employee.capacity),
        "organization_id": employee_data.get("organization_id", employee.organization_id),
        "manager_id": employee_data.get("manager_id", employee.manager_id),
        "employee_id": employee_id,
    }

    validate_employee_payload(session, proposed_employee)
    for key, value in employee_data.items():
        setattr(employee, key, value)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    return serialize_employee(session, employee)


@app.delete("/employees/{employee_id}", status_code=204)
def delete_employee(employee_id: int, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    assignments = session.exec(select(Assignment).where(Assignment.employee_id == employee_id)).all()
    for assignment in assignments:
        session.delete(assignment)
    direct_reports = session.exec(select(Employee).where(Employee.manager_id == employee_id)).all()
    for report in direct_reports:
        report.manager_id = None
        session.add(report)
    session.delete(employee)
    session.commit()


# Project routes
@app.get("/projects", response_model=List[ProjectRead])
def list_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(Project).order_by(Project.name)).all()
    return projects


@app.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(project: ProjectCreate, session: Session = Depends(get_session)):
    validate_dates(project.start_date, project.end_date)
    db_project = Project.from_orm(project)
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project


@app.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.put("/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, update: ProjectUpdate, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    validate_dates(update.start_date, project.end_date if update.end_date is None else update.end_date)
    project_data = update.dict(exclude_unset=True)
    for key, value in project_data.items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@app.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assignments = session.exec(select(Assignment).where(Assignment.project_id == project_id)).all()
    for assignment in assignments:
        session.delete(assignment)
    session.delete(project)
    session.commit()


# Assignment helpers

def validate_dates(start: Optional[date], end: Optional[date]) -> None:
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="End date must be after start date")


def ensure_employee(session: Session, employee_id: int) -> Employee:
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


def ensure_project(session: Session, project_id: int) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def ensure_organization(session: Session, organization_id: int) -> Organization:
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


def validate_employee_type(employee_type: str) -> str:
    if employee_type not in {"IC", "L"}:
        raise HTTPException(status_code=400, detail="Employee type must be IC or L")
    return employee_type


def validate_employee_payload(session: Session, payload: dict) -> None:
    capacity = payload.get("capacity")
    organization_id = payload.get("organization_id")
    manager_id = payload.get("manager_id")
    employee_type = payload.get("employee_type")
    employee_id = payload.get("employee_id")

    if capacity is None or capacity <= 0:
        raise HTTPException(status_code=400, detail="Capacity must be greater than zero")
    if organization_id is None:
        raise HTTPException(status_code=400, detail="Organization is required")
    ensure_organization(session, organization_id)
    normalized_type = validate_employee_type(employee_type or "IC")
    if normalized_type == "IC" and manager_id is None:
        raise HTTPException(status_code=400, detail="Individual contributors must have a manager")
    if manager_id is not None:
        ensure_valid_manager(session, employee_id=employee_id, manager_id=manager_id)
    if employee_id is not None and normalized_type != "L":
        direct_report_exists = session.exec(select(Employee).where(Employee.manager_id == employee_id)).first()
        if direct_report_exists:
            raise HTTPException(status_code=400, detail="Employees with direct reports must remain type L")


def ensure_valid_manager(session: Session, employee_id: Optional[int], manager_id: int) -> Employee:
    manager = ensure_employee(session, manager_id)
    if manager.employee_type != "L":
        raise HTTPException(status_code=400, detail="Only leaders can be assigned as managers")
    if employee_id is not None and manager_id == employee_id:
        raise HTTPException(status_code=400, detail="Employee cannot manage themselves")
    if employee_id is not None and creates_manager_cycle(session, employee_id, manager_id):
        raise HTTPException(status_code=400, detail="Manager relationship creates a cycle")
    return manager


def creates_manager_cycle(session: Session, employee_id: int, manager_id: int) -> bool:
    seen: Set[int] = set()
    current_id: Optional[int] = manager_id
    while current_id is not None:
        if current_id == employee_id:
            return True
        if current_id in seen:
            return True
        seen.add(current_id)
        current = session.get(Employee, current_id)
        if not current:
            return False
        current_id = current.manager_id
    return False


def serialize_employee(session: Session, employee: Employee) -> EmployeeRead:
    organization_name = None
    manager_name = None
    direct_report_count = 0
    if employee.organization_id is not None:
        organization = session.get(Organization, employee.organization_id)
        organization_name = organization.name if organization else None
    if employee.manager_id is not None:
        manager = session.get(Employee, employee.manager_id)
        manager_name = manager.name if manager else None
    direct_report_count = len(session.exec(select(Employee).where(Employee.manager_id == employee.id)).all())
    return EmployeeRead(
        id=employee.id,
        name=employee.name,
        role=employee.role,
        employee_type=validate_employee_type(employee.employee_type or "IC"),
        location=employee.location,
        capacity=employee.capacity,
        organization_id=employee.organization_id,
        organization_name=organization_name,
        manager_id=employee.manager_id,
        manager_name=manager_name,
        direct_report_count=direct_report_count,
    )


def ensure_employee_and_project(session: Session, employee_id: int, project_id: int) -> None:
    ensure_employee(session, employee_id)
    ensure_project(session, project_id)


def serialize_assignment(session: Session, assignment: Assignment) -> AssignmentRead:
    employee = session.get(Employee, assignment.employee_id)
    project = session.get(Project, assignment.project_id)
    return AssignmentRead(
        id=assignment.id,
        employee_id=assignment.employee_id,
        project_id=assignment.project_id,
        start_date=assignment.start_date,
        end_date=assignment.end_date,
        allocation=assignment.allocation,
        notes=assignment.notes,
        employee_name=employee.name if employee else None,
        project_name=project.name if project else None,
    )


# Assignment routes
@app.get("/assignments", response_model=List[AssignmentRead])
def list_assignments(
    employee_id: Optional[int] = None,
    project_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    statement = select(Assignment)
    if employee_id is not None:
        statement = statement.where(Assignment.employee_id == employee_id)
    if project_id is not None:
        statement = statement.where(Assignment.project_id == project_id)
    statement = statement.order_by(Assignment.start_date)
    assignments = session.exec(statement).all()
    return [serialize_assignment(session, a) for a in assignments]


@app.post("/assignments", response_model=AssignmentRead, status_code=201)
def create_assignment(assignment: AssignmentCreate, session: Session = Depends(get_session)):
    ensure_employee_and_project(session, assignment.employee_id, assignment.project_id)
    validate_dates(assignment.start_date, assignment.end_date)
    if not 0 < assignment.allocation <= 1:
        raise HTTPException(status_code=400, detail="Allocation must be between 0 and 1")
    db_assignment = Assignment.from_orm(assignment)
    session.add(db_assignment)
    session.commit()
    session.refresh(db_assignment)
    return serialize_assignment(session, db_assignment)


@app.put("/assignments/{assignment_id}", response_model=AssignmentRead)
def update_assignment(
    assignment_id: int,
    update: AssignmentUpdate,
    session: Session = Depends(get_session),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if update.start_date or update.end_date:
        validate_dates(update.start_date or assignment.start_date, update.end_date or assignment.end_date)
    if update.allocation is not None and not 0 < update.allocation <= 1:
        raise HTTPException(status_code=400, detail="Allocation must be between 0 and 1")
    data = update.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(assignment, key, value)
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return serialize_assignment(session, assignment)


@app.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, session: Session = Depends(get_session)):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    session.delete(assignment)
    session.commit()


@app.get("/schedule/employee/{employee_id}", response_model=List[AssignmentRead])
def get_employee_schedule(employee_id: int, session: Session = Depends(get_session)):
    ensure_employee(session, employee_id)
    assignments = session.exec(
        select(Assignment).where(Assignment.employee_id == employee_id).order_by(Assignment.start_date)
    ).all()
    return [serialize_assignment(session, a) for a in assignments]


@app.get("/schedule/project/{project_id}", response_model=List[AssignmentRead])
def get_project_schedule(project_id: int, session: Session = Depends(get_session)):
    ensure_project(session, project_id)
    assignments = session.exec(
        select(Assignment).where(Assignment.project_id == project_id).order_by(Assignment.start_date)
    ).all()
    return [serialize_assignment(session, a) for a in assignments]
