from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Generator, List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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


class EmployeeBase(SQLModel):
    name: str
    role: Optional[str] = None
    location: Optional[str] = None
    capacity: float = 1.0


class Employee(EmployeeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeRead(EmployeeBase):
    id: int


class EmployeeUpdate(SQLModel):
    name: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[float] = None


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


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@app.on_event("startup")
def on_startup() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    create_db_and_tables()


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def serve_index() -> str:
    index_path = STATIC_DIR / "index.html"
    return index_path.read_text(encoding="utf-8")


@app.get("/canvas", response_class=HTMLResponse)
def serve_canvas() -> str:
    canvas_path = STATIC_DIR / "canvas.html"
    return canvas_path.read_text(encoding="utf-8")


@app.get("/dashboard", response_class=HTMLResponse)
def serve_dashboard() -> str:
    dashboard_path = STATIC_DIR / "project-dashboard.html"
    return dashboard_path.read_text(encoding="utf-8")


# Employee routes
@app.get("/employees", response_model=List[EmployeeRead])
def list_employees(session: Session = Depends(get_session)):
    employees = session.exec(select(Employee).order_by(Employee.name)).all()
    return employees


@app.post("/employees", response_model=EmployeeRead, status_code=201)
def create_employee(employee: EmployeeCreate, session: Session = Depends(get_session)):
    if employee.capacity <= 0:
        raise HTTPException(status_code=400, detail="Capacity must be greater than zero")
    db_employee = Employee.from_orm(employee)
    session.add(db_employee)
    session.commit()
    session.refresh(db_employee)
    return db_employee


@app.get("/employees/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: int, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@app.put("/employees/{employee_id}", response_model=EmployeeRead)
def update_employee(employee_id: int, update: EmployeeUpdate, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee_data = update.dict(exclude_unset=True)
    for key, value in employee_data.items():
        setattr(employee, key, value)
    session.add(employee)
    session.commit()
    session.refresh(employee)
    return employee


@app.delete("/employees/{employee_id}", status_code=204)
def delete_employee(employee_id: int, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    assignments = session.exec(select(Assignment).where(Assignment.employee_id == employee_id)).all()
    for assignment in assignments:
        session.delete(assignment)
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
    validate_dates(update.start_date, update.end_date)
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
