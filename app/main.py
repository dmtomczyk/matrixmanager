from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Generator, List, Optional, Set
from urllib.parse import quote, quote_plus

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Field, Session, SQLModel, create_engine, select

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DB_PATH = Path(os.getenv("MATRIX_SQLITE_PATH", str(ROOT_DIR / "matrix.db"))).expanduser()
CONTROL_DB_PATH = Path(os.getenv("MATRIX_CONTROL_DB_PATH", str(ROOT_DIR / "matrixmanager_control.db"))).expanduser()
STATIC_DIR = BASE_DIR / "static"
SESSION_COOKIE_NAME = "matrixmanager_session"
MATRIX_INSTALL_MODE = os.getenv("MATRIX_INSTALL_MODE", "sqlite").strip().lower()
MATRIX_ACTIVE_DB_TYPE = os.getenv("MATRIX_ACTIVE_DB_TYPE", MATRIX_INSTALL_MODE).strip().lower()
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "matrixmanager")
POSTGRES_USER = os.getenv("POSTGRES_USER", "matrixmanager")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
POSTGRES_SSLMODE = os.getenv("POSTGRES_SSLMODE", "prefer")

DATABASE_URL = f"sqlite:///{DB_PATH}"
CONTROL_DATABASE_URL = f"sqlite:///{CONTROL_DB_PATH}"
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
control_engine = create_engine(
    CONTROL_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
engine_cache: dict[str, Any] = {}


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


class AuditEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    entity_type: str
    entity_id: Optional[int] = None
    entity_label: Optional[str] = None
    action: str
    actor_username: str
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    before_json: Optional[str] = None
    after_json: Optional[str] = None


class AuditEntryRead(SQLModel):
    id: int
    entity_type: str
    entity_id: Optional[int]
    entity_label: Optional[str]
    action: str
    actor_username: str
    occurred_at: datetime
    before_json: Optional[str]
    after_json: Optional[str]


class DBConnectionBase(SQLModel):
    name: str
    db_type: str
    sqlite_path: Optional[str] = None
    postgres_host: Optional[str] = None
    postgres_port: int = 5432
    postgres_database: Optional[str] = None
    postgres_username: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_sslmode: str = "prefer"


class DBConnectionConfig(DBConnectionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    is_active: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DBConnectionCreate(DBConnectionBase):
    pass


class DBConnectionUpdate(SQLModel):
    name: Optional[str] = None
    db_type: Optional[str] = None
    sqlite_path: Optional[str] = None
    postgres_host: Optional[str] = None
    postgres_port: Optional[int] = None
    postgres_database: Optional[str] = None
    postgres_username: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_sslmode: Optional[str] = None


class DBConnectionRead(DBConnectionBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    connection_summary: str


class UserAccount(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    password_hash: str
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserAccountCreate(SQLModel):
    username: str
    password: str
    is_admin: bool = False


class UserAccountUpdate(SQLModel):
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class UserAccountRead(SQLModel):
    id: int
    username: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    auth_source: str = "database"


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


def get_session_secret() -> str:
    return os.getenv("MATRIX_AUTH_SECRET") or f"{get_auth_username()}:{get_auth_password()}"


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 600000)
    return f"pbkdf2_sha256$600000${base64.b64encode(salt_bytes).decode('ascii')}${base64.b64encode(digest).decode('ascii')}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = base64.b64decode(salt_text.encode("ascii"))
        expected = base64.b64decode(digest_text.encode("ascii"))
    except Exception:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return secrets.compare_digest(candidate, expected)


def sign_session_value(username: str) -> str:
    secret = get_session_secret().encode("utf-8")
    payload = username.encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return f"{username}:{digest}"


def user_exists(username: str) -> bool:
    with Session(control_engine) as session:
        user = session.exec(select(UserAccount).where(UserAccount.username == username)).first()
        return bool(user and user.is_active)


def verify_session_value(cookie_value: Optional[str]) -> bool:
    if not cookie_value or ":" not in cookie_value:
        return False
    username, provided_sig = cookie_value.split(":", 1)
    expected = sign_session_value(username)
    signature_ok = secrets.compare_digest(cookie_value, expected) and secrets.compare_digest(provided_sig, expected.split(":", 1)[1])
    if not signature_ok:
        return False
    if username == get_auth_username():
        return True
    return user_exists(username)


def get_session_username(cookie_value: Optional[str]) -> Optional[str]:
    if not verify_session_value(cookie_value):
        return None
    return cookie_value.split(":", 1)[0]


def render_app_nav(current_path: str, username: str) -> str:
    links = [
        ("/", "Planning"),
        ("/people", "Employees"),
        ("/staffing", "Assignments"),
        ("/orgs", "Organizations"),
        ("/canvas", "Canvas"),
        ("/dashboard", "Project Dashboard"),
        ("/audit", "Audit"),
    ]
    if is_admin_username(username):
        links.append(("/users", "Users"))
        links.append(("/db-management", "DB Management"))
    rendered_links = []
    for href, label in links:
        class_name = "nav-link active" if href == current_path else "nav-link"
        aria_current = ' aria-current="page"' if href == current_path else ""
        rendered_links.append(f'<a href="{href}" class="{class_name}"{aria_current}>{label}</a>')
    link_markup = "".join(rendered_links)
    return f'''<nav class="app-nav" aria-label="Primary">
        <div class="app-nav-main">
          <div class="nav-links nav-links-desktop">{link_markup}</div>
          <details class="hamburger-menu">
            <summary class="hamburger-trigger" aria-label="Open navigation menu">
              <span class="hamburger-icon" aria-hidden="true"></span>
              <span>Menu</span>
            </summary>
            <div class="hamburger-panel">
              <div class="nav-links nav-links-mobile">{link_markup}</div>
            </div>
          </details>
        </div>
        <details class="account-menu">
          <summary class="account-menu-trigger">
            <span class="account-icon" aria-hidden="true">👤</span>
            <span class="account-menu-copy">
              <span class="account-menu-label">Signed in as</span>
              <span class="account-menu-username">{username}</span>
            </span>
          </summary>
          <div class="account-menu-panel">
            <div class="account-menu-meta">
              <div class="account-menu-meta-top">
                <span class="account-icon account-icon-panel" aria-hidden="true">👤</span>
                <div>
                  <span class="account-menu-label">Signed in as</span>
                  <strong>{username}</strong>
                </div>
              </div>
            </div>
            <form method="post" action="/logout" class="logout-form">
              <button type="submit" class="logout-button">Logout</button>
            </form>
          </div>
        </details>
      </nav>'''


def build_login_page(error: str = "", next_path: str = "/") -> str:
    error_markup = f'<p class="login-error">{error}</p>' if error else ""
    styles_href = static_asset_url("styles.css")
    safe_next = next_path if next_path.startswith("/") else "/"
    return f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Matrix Manager · Login</title>
    <link rel=\"stylesheet\" href=\"{styles_href}\" />
  </head>
  <body class=\"login-page\">
    <main class=\"login-shell\">
      <section class=\"card login-card\">
        <div class=\"section-head\">
          <h1>Matrix Manager</h1>
          <p>Sign in to continue.</p>
        </div>
        {error_markup}
        <form method=\"post\" action=\"/login\" class=\"panel\">
          <input type=\"hidden\" name=\"next\" value=\"{safe_next}\" />
          <label>Username<input name=\"username\" autocomplete=\"username\" required /></label>
          <label>Password<input name=\"password\" type=\"password\" autocomplete=\"current-password\" required /></label>
          <button type=\"submit\">Sign in</button>
        </form>
      </section>
    </main>
  </body>
</html>"""


def is_html_request(request: Request) -> bool:
    accept = request.headers.get("accept", "")
    return "text/html" in accept or request.url.path in {"/", "/people", "/staffing", "/orgs", "/canvas", "/dashboard", "/audit", "/users", "/db-management", "/docs", "/redoc"}


def create_db_and_tables(bind_engine=engine) -> None:
    SQLModel.metadata.create_all(bind_engine)


def run_migrations(bind_engine=engine) -> None:
    engine_url = str(bind_engine.url)
    with bind_engine.begin() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(employee)").fetchall() if engine_url.startswith("sqlite") else []
        column_names = {row[1] for row in columns}
        if engine_url.startswith("sqlite"):
            if "manager_id" not in column_names:
                connection.exec_driver_sql("ALTER TABLE employee ADD COLUMN manager_id INTEGER")
            if "employee_type" not in column_names:
                connection.exec_driver_sql("ALTER TABLE employee ADD COLUMN employee_type TEXT DEFAULT 'IC'")
            connection.exec_driver_sql("UPDATE employee SET employee_type = 'IC' WHERE employee_type IS NULL OR employee_type = ''")
        AuditEntry.__table__.create(bind=connection, checkfirst=True)
        DBConnectionConfig.__table__.create(bind=connection, checkfirst=True)
        UserAccount.__table__.create(bind=connection, checkfirst=True)


def get_control_session() -> Generator[Session, None, None]:
    create_db_and_tables(control_engine)
    run_migrations(control_engine)
    with Session(control_engine) as session:
        yield session


def build_connection_summary(connection: DBConnectionConfig) -> str:
    if connection.db_type == "sqlite":
        return connection.sqlite_path or "SQLite"
    return f"{connection.postgres_host or 'localhost'}:{connection.postgres_port}/{connection.postgres_database or ''}"


def serialize_db_connection(connection: DBConnectionConfig) -> DBConnectionRead:
    return DBConnectionRead(
        id=connection.id,
        name=connection.name,
        db_type=connection.db_type,
        sqlite_path=connection.sqlite_path,
        postgres_host=connection.postgres_host,
        postgres_port=connection.postgres_port,
        postgres_database=connection.postgres_database,
        postgres_username=connection.postgres_username,
        postgres_password=connection.postgres_password,
        postgres_sslmode=connection.postgres_sslmode,
        is_active=connection.is_active,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
        connection_summary=build_connection_summary(connection),
    )


def normalize_db_connection_payload(payload: dict[str, Any]) -> dict[str, Any]:
    db_type = (payload.get("db_type") or "").strip().lower()
    if db_type not in {"sqlite", "postgresql"}:
        raise HTTPException(status_code=400, detail="Database type must be sqlite or postgresql")
    payload["db_type"] = db_type
    payload["name"] = (payload.get("name") or "").strip()
    if not payload["name"]:
        raise HTTPException(status_code=400, detail="Connection name is required")
    if db_type == "sqlite":
        sqlite_path = (payload.get("sqlite_path") or "").strip()
        if not sqlite_path:
            raise HTTPException(status_code=400, detail="SQLite path is required")
        payload.update({
            "sqlite_path": sqlite_path,
            "postgres_host": None,
            "postgres_database": None,
            "postgres_username": None,
            "postgres_password": None,
            "postgres_sslmode": "prefer",
            "postgres_port": 5432,
        })
    else:
        host = (payload.get("postgres_host") or "").strip()
        database = (payload.get("postgres_database") or "").strip()
        username = (payload.get("postgres_username") or "").strip()
        password = payload.get("postgres_password") or ""
        if not host or not database or not username:
            raise HTTPException(status_code=400, detail="PostgreSQL host, database, and username are required")
        payload.update({
            "sqlite_path": None,
            "postgres_host": host,
            "postgres_database": database,
            "postgres_username": username,
            "postgres_password": password,
            "postgres_sslmode": (payload.get("postgres_sslmode") or "prefer").strip() or "prefer",
            "postgres_port": int(payload.get("postgres_port") or 5432),
        })
    return payload


def build_database_url(connection: DBConnectionConfig) -> str:
    if connection.db_type == "sqlite":
        sqlite_path = Path(connection.sqlite_path or "matrix.db").expanduser()
        if not sqlite_path.is_absolute():
            sqlite_path = ROOT_DIR / sqlite_path
        return f"sqlite:///{sqlite_path}"
    username = quote_plus(connection.postgres_username or "")
    password = connection.postgres_password or ""
    auth = username
    if password:
        auth = f"{username}:{quote_plus(password)}"
    database = quote_plus(connection.postgres_database or "")
    host = connection.postgres_host or "localhost"
    return f"postgresql+psycopg://{auth}@{host}:{connection.postgres_port}/{database}?sslmode={connection.postgres_sslmode or 'prefer'}"


def get_or_create_data_engine(connection: DBConnectionConfig):
    global engine
    database_url = build_database_url(connection)
    if database_url in engine_cache:
        engine = engine_cache[database_url]
        return engine
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    built_engine = create_engine(database_url, connect_args=connect_args)
    create_db_and_tables(built_engine)
    run_migrations(built_engine)
    engine_cache[database_url] = built_engine
    engine = built_engine
    return built_engine


def build_bootstrap_connection() -> DBConnectionConfig:
    if MATRIX_ACTIVE_DB_TYPE == "postgresql":
        return DBConnectionConfig(
            name="Bundled PostgreSQL",
            db_type="postgresql",
            postgres_host=POSTGRES_HOST,
            postgres_port=POSTGRES_PORT,
            postgres_database=POSTGRES_DB,
            postgres_username=POSTGRES_USER,
            postgres_password=POSTGRES_PASSWORD,
            postgres_sslmode=POSTGRES_SSLMODE,
            is_active=True,
        )
    return DBConnectionConfig(
        name="Local SQLite",
        db_type="sqlite",
        sqlite_path=str(DB_PATH),
        is_active=True,
    )


def ensure_default_db_connection() -> None:
    bootstrap_connection = build_bootstrap_connection()
    with Session(control_engine) as session:
        existing = session.exec(select(DBConnectionConfig).order_by(DBConnectionConfig.id)).all()
        if existing:
            active_matches_bootstrap = False
            for item in existing:
                should_be_active = False
                if bootstrap_connection.db_type == "sqlite":
                    should_be_active = item.db_type == "sqlite" and (item.sqlite_path or "") == (bootstrap_connection.sqlite_path or "")
                else:
                    should_be_active = (
                        item.db_type == "postgresql"
                        and (item.postgres_host or "") == (bootstrap_connection.postgres_host or "")
                        and int(item.postgres_port or 5432) == int(bootstrap_connection.postgres_port or 5432)
                        and (item.postgres_database or "") == (bootstrap_connection.postgres_database or "")
                        and (item.postgres_username or "") == (bootstrap_connection.postgres_username or "")
                    )
                if should_be_active:
                    item.name = bootstrap_connection.name
                    item.db_type = bootstrap_connection.db_type
                    item.sqlite_path = bootstrap_connection.sqlite_path
                    item.postgres_host = bootstrap_connection.postgres_host
                    item.postgres_port = bootstrap_connection.postgres_port
                    item.postgres_database = bootstrap_connection.postgres_database
                    item.postgres_username = bootstrap_connection.postgres_username
                    item.postgres_password = bootstrap_connection.postgres_password
                    item.postgres_sslmode = bootstrap_connection.postgres_sslmode
                    item.is_active = True
                    item.updated_at = datetime.now(timezone.utc)
                    session.add(item)
                    active_matches_bootstrap = True
                elif item.is_active and MATRIX_INSTALL_MODE in {"sqlite", "postgresql"}:
                    item.is_active = False
                    item.updated_at = datetime.now(timezone.utc)
                    session.add(item)
            if not active_matches_bootstrap:
                bootstrap_connection.updated_at = datetime.now(timezone.utc)
                session.add(bootstrap_connection)
            session.commit()
            if not any(item.is_active for item in session.exec(select(DBConnectionConfig)).all()):
                first = session.exec(select(DBConnectionConfig).order_by(DBConnectionConfig.id)).first()
                if first:
                    first.is_active = True
                    first.updated_at = datetime.now(timezone.utc)
                    session.add(first)
                    session.commit()
            return
        session.add(bootstrap_connection)
        session.commit()


def get_active_db_connection_config() -> DBConnectionConfig:
    with Session(control_engine) as session:
        connection = session.exec(select(DBConnectionConfig).where(DBConnectionConfig.is_active == True)).first()
        if connection:
            return connection
        fallback = session.exec(select(DBConnectionConfig).order_by(DBConnectionConfig.id)).first()
        if not fallback:
            raise HTTPException(status_code=500, detail="No database connections configured")
        return fallback


def get_session() -> Generator[Session, None, None]:
    active_connection = get_active_db_connection_config()
    data_engine = get_or_create_data_engine(active_connection)
    with Session(data_engine) as session:
        yield session


def static_asset_url(relative_path: str) -> str:
    asset_path = STATIC_DIR / relative_path
    version = int(asset_path.stat().st_mtime) if asset_path.exists() else 0
    return f"/static/{relative_path}?v={version}"


def get_request_username(request: Request) -> str:
    return get_session_username(request.cookies.get(SESSION_COOKIE_NAME)) or "unknown"


def is_database_admin(username: Optional[str]) -> bool:
    if not username:
        return False
    with Session(control_engine) as session:
        user = session.exec(select(UserAccount).where(UserAccount.username == username)).first()
        return bool(user and user.is_active and user.is_admin)


def authenticate_username_password(username: str, password: str) -> bool:
    if secrets.compare_digest(username, get_auth_username()) and secrets.compare_digest(password, get_auth_password()):
        return True
    with Session(control_engine) as session:
        user = session.exec(select(UserAccount).where(UserAccount.username == username)).first()
        if not user or not user.is_active:
            return False
        return verify_password(password, user.password_hash)


def serialize_user_account(user: UserAccount) -> UserAccountRead:
    return UserAccountRead(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        auth_source="database",
    )


def is_admin_username(username: Optional[str]) -> bool:
    return username == "admin" or is_database_admin(username)


def require_admin_user(request: Request) -> str:
    username = get_request_username(request)
    if not is_admin_username(username):
        raise HTTPException(status_code=403, detail="Only the admin user can perform this action")
    return username


def jsonable_audit_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def audit_snapshot_from_model(model: Any, extra: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    if model is None:
        data: dict[str, Any] = {}
    elif hasattr(model, "model_dump"):
        data = model.model_dump()
    elif hasattr(model, "dict"):
        data = model.dict()
    elif isinstance(model, dict):
        data = dict(model)
    else:
        data = {"value": str(model)}
    if extra:
        data.update(extra)
    return {key: jsonable_audit_value(value) for key, value in data.items()}


def dump_audit_json(value: Optional[dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, sort_keys=True)


def serialize_audit_entry(entry: AuditEntry) -> AuditEntryRead:
    return AuditEntryRead(
        id=entry.id,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        entity_label=entry.entity_label,
        action=entry.action,
        actor_username=entry.actor_username,
        occurred_at=entry.occurred_at,
        before_json=entry.before_json,
        after_json=entry.after_json,
    )


def record_audit_entry(
    session: Session,
    *,
    actor_username: str,
    entity_type: str,
    action: str,
    entity_id: Optional[int] = None,
    entity_label: Optional[str] = None,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
) -> AuditEntry:
    entry = AuditEntry(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        action=action,
        actor_username=actor_username,
        before_json=dump_audit_json(before),
        after_json=dump_audit_json(after),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


BASE_NAV_MARKUP = """<nav>
        <a href="/">Planning</a>
        <a href="/people">Employees</a>
        <a href="/staffing">Assignments</a>
        <a href="/orgs">Organizations</a>
        <a href="/canvas">Canvas</a>
        <a href="/dashboard">Project Dashboard</a>
        <form method="post" action="/logout" class="logout-form">
          <button type="submit" class="logout-button">Logout</button>
        </form>
      </nav>"""


def serve_html_page(
    filename: str,
    replacements: Optional[dict[str, str]] = None,
    current_path: Optional[str] = None,
    username: Optional[str] = None,
) -> str:
    html = (STATIC_DIR / filename).read_text(encoding="utf-8")
    replacements = replacements or {}
    if current_path and username:
        replacements[BASE_NAV_MARKUP] = render_app_nav(current_path=current_path, username=username)
        replacements["</body>"] = f'    <script src="{static_asset_url("app-shell.js")}"></script>\n  </body>'
    for old, new in replacements.items():
        html = html.replace(old, new)
    return html


@app.on_event("startup")
def on_startup() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTROL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    create_db_and_tables(control_engine)
    run_migrations(control_engine)
    ensure_default_db_connection()
    ensure_default_admin_user()
    active_connection = get_active_db_connection_config()
    get_or_create_data_engine(active_connection)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def require_login(request: Request, call_next):
    public_paths = {"/login", "/health"}
    if request.url.path in public_paths:
        return await call_next(request)
    if request.url.path.startswith("/static/"):
        return await call_next(request)
    if verify_session_value(request.cookies.get(SESSION_COOKIE_NAME)):
        return await call_next(request)
    if is_html_request(request):
        return RedirectResponse(url=f"/login?next={quote(str(request.url.path))}", status_code=302)
    raise HTTPException(status_code=401, detail="Authentication required")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "install_mode": MATRIX_INSTALL_MODE,
        "active_db_type": MATRIX_ACTIVE_DB_TYPE,
    }


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: str = "", next: str = "/") -> str:
    if verify_session_value(request.cookies.get(SESSION_COOKIE_NAME)):
        return RedirectResponse(url="/", status_code=302)
    return build_login_page(error=error, next_path=next)


def ensure_default_admin_user() -> None:
    with Session(control_engine) as session:
        env_admin = session.exec(select(UserAccount).where(UserAccount.username == get_auth_username())).first()
        if env_admin:
            return
        session.add(
            UserAccount(
                username=get_auth_username(),
                password_hash=hash_password(get_auth_password()),
                is_admin=True,
                is_active=True,
            )
        )
        session.commit()


@app.post("/login")
async def login_submit(request: Request):
    raw_body = (await request.body()).decode("utf-8")
    fields = {}
    for pair in raw_body.split("&"):
        if not pair:
            continue
        key, _, value = pair.partition("=")
        fields[key] = value.replace("+", " ")
    username = fields.get("username", "")
    password = fields.get("password", "")
    next_target = fields.get("next", "/")
    from urllib.parse import unquote_plus
    username = unquote_plus(username)
    password = unquote_plus(password)
    next_target = unquote_plus(next_target)
    if not authenticate_username_password(username, password):
        return HTMLResponse(build_login_page(error="Invalid username or password.", next_path=next_target), status_code=401)
    target = next_target if next_target.startswith("/") else "/"
    response = RedirectResponse(url=target, status_code=302)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        sign_session_value(username),
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return response


@app.post("/logout")
def logout():
    response = RedirectResponse(url="/login", status_code=302)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@app.get("/", response_class=HTMLResponse)
def serve_index(request: Request) -> str:
    return serve_html_page(
        "planning.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/planning.js"': f'src="{static_asset_url("planning.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/people", response_class=HTMLResponse)
def serve_employees(request: Request) -> str:
    return serve_html_page(
        "employees.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/employees.js"': f'src="{static_asset_url("employees.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/staffing", response_class=HTMLResponse)
def serve_assignments(request: Request) -> str:
    return serve_html_page(
        "assignments.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/assignments.js"': f'src="{static_asset_url("assignments.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/canvas", response_class=HTMLResponse)
def serve_canvas(request: Request) -> str:
    return serve_html_page(
        "canvas.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/canvas.js"': f'src="{static_asset_url("canvas.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/dashboard", response_class=HTMLResponse)
def serve_dashboard(request: Request) -> str:
    return serve_html_page(
        "project-dashboard.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/project-dashboard.js"': f'src="{static_asset_url("project-dashboard.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/orgs", response_class=HTMLResponse)
def serve_org_manager(request: Request) -> str:
    return serve_html_page(
        "organizations.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/organizations.js"': f'src="{static_asset_url("organizations.js")}"',
        },
        current_path=request.url.path,
        username=get_session_username(request.cookies.get(SESSION_COOKIE_NAME)),
    )


@app.get("/audit", response_class=HTMLResponse)
def serve_audit_page(request: Request) -> str:
    username = get_session_username(request.cookies.get(SESSION_COOKIE_NAME))
    return serve_html_page(
        "audit.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/audit.js"': f'src="{static_asset_url("audit.js")}"',
            'data-is-admin="false"': f'data-is-admin="{"true" if is_admin_username(username) else "false"}"',
            'data-current-user=""': f'data-current-user="{username or ""}"',
        },
        current_path=request.url.path,
        username=username,
    )


@app.get("/users", response_class=HTMLResponse)
def serve_users_page(request: Request) -> str:
    username = get_session_username(request.cookies.get(SESSION_COOKIE_NAME))
    if not is_admin_username(username):
        raise HTTPException(status_code=403, detail="Only admin can manage users")
    return serve_html_page(
        "users.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/users.js"': f'src="{static_asset_url("users.js")}"',
        },
        current_path=request.url.path,
        username=username,
    )


@app.get("/db-management", response_class=HTMLResponse)
def serve_db_management_page(request: Request) -> str:
    username = get_session_username(request.cookies.get(SESSION_COOKIE_NAME))
    if not is_admin_username(username):
        raise HTTPException(status_code=403, detail="Only admin can manage database connections")
    return serve_html_page(
        "db-management.html",
        {
            'href="/static/styles.css"': f'href="{static_asset_url("styles.css")}"',
            'src="/static/db-management.js"': f'src="{static_asset_url("db-management.js")}"',
        },
        current_path=request.url.path,
        username=username,
    )


@app.get("/organizations", response_model=List[OrganizationRead])
def list_organizations(session: Session = Depends(get_session)):
    organizations = session.exec(select(Organization).order_by(Organization.name)).all()
    return organizations


@app.post("/organizations", response_model=OrganizationRead, status_code=201)
def create_organization(organization: OrganizationCreate, request: Request, session: Session = Depends(get_session)):
    db_org = Organization.from_orm(organization)
    session.add(db_org)
    session.commit()
    session.refresh(db_org)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="organization",
        action="create",
        entity_id=db_org.id,
        entity_label=db_org.name,
        after=audit_snapshot_from_model(db_org),
    )
    return db_org


@app.put("/organizations/{organization_id}", response_model=OrganizationRead)
def update_organization(organization_id: int, update: OrganizationUpdate, request: Request, session: Session = Depends(get_session)):
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    before = audit_snapshot_from_model(organization)
    for key, value in update.dict(exclude_unset=True).items():
        setattr(organization, key, value)
    session.add(organization)
    session.commit()
    session.refresh(organization)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="organization",
        action="update",
        entity_id=organization.id,
        entity_label=organization.name,
        before=before,
        after=audit_snapshot_from_model(organization),
    )
    return organization


@app.delete("/organizations/{organization_id}", status_code=204)
def delete_organization(organization_id: int, request: Request, session: Session = Depends(get_session)):
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    employee_count = session.exec(select(Employee).where(Employee.organization_id == organization_id)).first()
    if employee_count:
        raise HTTPException(status_code=400, detail="Cannot delete organization with assigned employees")
    before = audit_snapshot_from_model(organization)
    label = organization.name
    session.delete(organization)
    session.commit()
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="organization",
        action="delete",
        entity_id=organization_id,
        entity_label=label,
        before=before,
    )


@app.get("/employees", response_model=List[EmployeeRead])
def list_employees(session: Session = Depends(get_session)):
    employees = session.exec(select(Employee).order_by(Employee.name)).all()
    return [serialize_employee(session, emp) for emp in employees]


@app.post("/employees", response_model=EmployeeRead, status_code=201)
def create_employee(employee: EmployeeCreate, request: Request, session: Session = Depends(get_session)):
    employee_payload = employee.dict()
    validate_employee_payload(session, employee_payload)
    db_employee = Employee.from_orm(employee)
    session.add(db_employee)
    session.commit()
    session.refresh(db_employee)
    employee_read = serialize_employee(session, db_employee)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="employee",
        action="create",
        entity_id=db_employee.id,
        entity_label=db_employee.name,
        after=audit_snapshot_from_model(employee_read),
    )
    return employee_read


@app.get("/employees/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: int, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return serialize_employee(session, employee)


@app.put("/employees/{employee_id}", response_model=EmployeeRead)
def update_employee(employee_id: int, update: EmployeeUpdate, request: Request, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    before = audit_snapshot_from_model(serialize_employee(session, employee))
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
    employee_read = serialize_employee(session, employee)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="employee",
        action="update",
        entity_id=employee.id,
        entity_label=employee.name,
        before=before,
        after=audit_snapshot_from_model(employee_read),
    )
    return employee_read


@app.delete("/employees/{employee_id}", status_code=204)
def delete_employee(employee_id: int, request: Request, session: Session = Depends(get_session)):
    employee = session.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    actor_username = get_request_username(request)
    before = audit_snapshot_from_model(serialize_employee(session, employee))
    label = employee.name
    assignments = session.exec(select(Assignment).where(Assignment.employee_id == employee_id)).all()
    for assignment in assignments:
        assignment_before = serialize_assignment(session, assignment)
        assignment_label = f"{assignment_before.employee_name or assignment.employee_id} → {assignment_before.project_name or assignment.project_id}"
        session.delete(assignment)
        session.commit()
        record_audit_entry(
            session,
            actor_username=actor_username,
            entity_type="assignment",
            action="delete",
            entity_id=assignment.id,
            entity_label=assignment_label,
            before=audit_snapshot_from_model(assignment_before),
        )
    direct_reports = session.exec(select(Employee).where(Employee.manager_id == employee_id)).all()
    for report in direct_reports:
        report_before = audit_snapshot_from_model(serialize_employee(session, report))
        report.manager_id = None
        session.add(report)
        session.commit()
        session.refresh(report)
        record_audit_entry(
            session,
            actor_username=actor_username,
            entity_type="employee",
            action="update",
            entity_id=report.id,
            entity_label=report.name,
            before=report_before,
            after=audit_snapshot_from_model(serialize_employee(session, report)),
        )
    session.delete(employee)
    session.commit()
    record_audit_entry(
        session,
        actor_username=actor_username,
        entity_type="employee",
        action="delete",
        entity_id=employee_id,
        entity_label=label,
        before=before,
    )


@app.get("/projects", response_model=List[ProjectRead])
def list_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(Project).order_by(Project.name)).all()
    return projects


@app.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(project: ProjectCreate, request: Request, session: Session = Depends(get_session)):
    validate_dates(project.start_date, project.end_date)
    db_project = Project.from_orm(project)
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="project",
        action="create",
        entity_id=db_project.id,
        entity_label=db_project.name,
        after=audit_snapshot_from_model(db_project),
    )
    return db_project


@app.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.put("/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, update: ProjectUpdate, request: Request, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    before = audit_snapshot_from_model(project)
    validate_dates(update.start_date, project.end_date if update.end_date is None else update.end_date)
    project_data = update.dict(exclude_unset=True)
    for key, value in project_data.items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    session.refresh(project)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="project",
        action="update",
        entity_id=project.id,
        entity_label=project.name,
        before=before,
        after=audit_snapshot_from_model(project),
    )
    return project


@app.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, request: Request, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    actor_username = get_request_username(request)
    before = audit_snapshot_from_model(project)
    label = project.name
    assignments = session.exec(select(Assignment).where(Assignment.project_id == project_id)).all()
    for assignment in assignments:
        assignment_before = serialize_assignment(session, assignment)
        assignment_label = f"{assignment_before.employee_name or assignment.employee_id} → {assignment_before.project_name or assignment.project_id}"
        session.delete(assignment)
        session.commit()
        record_audit_entry(
            session,
            actor_username=actor_username,
            entity_type="assignment",
            action="delete",
            entity_id=assignment.id,
            entity_label=assignment_label,
            before=audit_snapshot_from_model(assignment_before),
        )
    session.delete(project)
    session.commit()
    record_audit_entry(
        session,
        actor_username=actor_username,
        entity_type="project",
        action="delete",
        entity_id=project_id,
        entity_label=label,
        before=before,
    )


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
def create_assignment(assignment: AssignmentCreate, request: Request, session: Session = Depends(get_session)):
    ensure_employee_and_project(session, assignment.employee_id, assignment.project_id)
    validate_dates(assignment.start_date, assignment.end_date)
    if not 0 < assignment.allocation <= 1:
        raise HTTPException(status_code=400, detail="Allocation must be between 0 and 1")
    db_assignment = Assignment.from_orm(assignment)
    session.add(db_assignment)
    session.commit()
    session.refresh(db_assignment)
    assignment_read = serialize_assignment(session, db_assignment)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="assignment",
        action="create",
        entity_id=db_assignment.id,
        entity_label=f"{assignment_read.employee_name or db_assignment.employee_id} → {assignment_read.project_name or db_assignment.project_id}",
        after=audit_snapshot_from_model(assignment_read),
    )
    return assignment_read


@app.put("/assignments/{assignment_id}", response_model=AssignmentRead)
def update_assignment(
    assignment_id: int,
    update: AssignmentUpdate,
    request: Request,
    session: Session = Depends(get_session),
):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    before = audit_snapshot_from_model(serialize_assignment(session, assignment))
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
    assignment_read = serialize_assignment(session, assignment)
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="assignment",
        action="update",
        entity_id=assignment.id,
        entity_label=f"{assignment_read.employee_name or assignment.employee_id} → {assignment_read.project_name or assignment.project_id}",
        before=before,
        after=audit_snapshot_from_model(assignment_read),
    )
    return assignment_read


@app.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, request: Request, session: Session = Depends(get_session)):
    assignment = session.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    before_assignment = serialize_assignment(session, assignment)
    label = f"{before_assignment.employee_name or assignment.employee_id} → {before_assignment.project_name or assignment.project_id}"
    before = audit_snapshot_from_model(before_assignment)
    session.delete(assignment)
    session.commit()
    record_audit_entry(
        session,
        actor_username=get_request_username(request),
        entity_type="assignment",
        action="delete",
        entity_id=assignment_id,
        entity_label=label,
        before=before,
    )


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


@app.get("/audit-log", response_model=List[AuditEntryRead])
def list_audit_log(
    entity_type: str = "",
    action: str = "",
    actor: str = "",
    query: str = "",
    session: Session = Depends(get_session),
):
    statement = select(AuditEntry).order_by(AuditEntry.occurred_at.desc(), AuditEntry.id.desc())
    entries = session.exec(statement).all()
    query_text = query.strip().lower()
    if entity_type:
        entries = [entry for entry in entries if entry.entity_type == entity_type]
    if action:
        entries = [entry for entry in entries if entry.action == action]
    if actor:
        entries = [entry for entry in entries if entry.actor_username == actor]
    if query_text:
        entries = [
            entry for entry in entries
            if query_text in (entry.entity_label or "").lower()
            or query_text in (entry.before_json or "").lower()
            or query_text in (entry.after_json or "").lower()
            or query_text in entry.entity_type.lower()
        ]
    return [serialize_audit_entry(entry) for entry in entries]


@app.get("/audit-log/export")
def export_audit_log_csv(
    entity_type: str = "",
    action: str = "",
    actor: str = "",
    query: str = "",
    session: Session = Depends(get_session),
):
    entries = list_audit_log(entity_type=entity_type, action=action, actor=actor, query=query, session=session)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "occurred_at", "actor_username", "entity_type", "entity_id", "entity_label", "action", "before_json", "after_json"])
    for entry in entries:
        writer.writerow([
            entry.id,
            entry.occurred_at.isoformat(),
            entry.actor_username,
            entry.entity_type,
            entry.entity_id or "",
            entry.entity_label or "",
            entry.action,
            entry.before_json or "",
            entry.after_json or "",
        ])
    return PlainTextResponse(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit_log_{date.today().isoformat()}.csv"'},
    )


@app.delete("/audit-log", status_code=204)
def clear_audit_log(request: Request, session: Session = Depends(get_session)):
    actor_username = require_admin_user(request)
    existing_entries = session.exec(select(AuditEntry)).all()
    removed_count = len(existing_entries)
    for entry in existing_entries:
        session.delete(entry)
    session.commit()
    record_audit_entry(
        session,
        actor_username=actor_username,
        entity_type="audit",
        action="clear",
        entity_label="Audit history",
        after={"removed_entries": removed_count},
    )


@app.get("/users-api", response_model=List[UserAccountRead])
def list_users(request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    items = session.exec(select(UserAccount).order_by(UserAccount.username)).all()
    return [serialize_user_account(item) for item in items]


@app.post("/users-api", response_model=UserAccountRead, status_code=201)
def create_user(user: UserAccountCreate, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    username = user.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if session.exec(select(UserAccount).where(UserAccount.username == username)).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if len(user.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    db_user = UserAccount(
        username=username,
        password_hash=hash_password(user.password),
        is_admin=user.is_admin,
        is_active=True,
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return serialize_user_account(db_user)


@app.put("/users-api/{user_id}", response_model=UserAccountRead)
def update_user(user_id: int, update: UserAccountUpdate, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    user = session.get(UserAccount, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = update.model_dump(exclude_unset=True)
    if "password" in data and data["password"] is not None:
        if len(data["password"]) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        user.password_hash = hash_password(data.pop("password"))
    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user_account(user)


@app.delete("/users-api/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, session: Session = Depends(get_control_session)):
    current_username = require_admin_user(request)
    user = session.get(UserAccount, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == current_username:
        raise HTTPException(status_code=400, detail="You cannot delete your current user")
    session.delete(user)
    session.commit()


@app.get("/db-connections", response_model=List[DBConnectionRead])
def list_db_connections(request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    items = session.exec(select(DBConnectionConfig).order_by(DBConnectionConfig.name)).all()
    return [serialize_db_connection(item) for item in items]


@app.post("/db-connections", response_model=DBConnectionRead, status_code=201)
def create_db_connection(connection: DBConnectionCreate, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    payload = normalize_db_connection_payload(connection.model_dump())
    db_connection = DBConnectionConfig(**payload)
    if not session.exec(select(DBConnectionConfig)).first():
        db_connection.is_active = True
    session.add(db_connection)
    session.commit()
    session.refresh(db_connection)
    if db_connection.is_active:
        get_or_create_data_engine(db_connection)
    return serialize_db_connection(db_connection)


@app.put("/db-connections/{connection_id}", response_model=DBConnectionRead)
def update_db_connection(connection_id: int, update: DBConnectionUpdate, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    db_connection = session.get(DBConnectionConfig, connection_id)
    if not db_connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    current = db_connection.model_dump()
    for key, value in update.model_dump(exclude_unset=True).items():
        current[key] = value
    payload = normalize_db_connection_payload(current)
    for key, value in payload.items():
        setattr(db_connection, key, value)
    db_connection.updated_at = datetime.now(timezone.utc)
    session.add(db_connection)
    session.commit()
    session.refresh(db_connection)
    if db_connection.is_active:
        get_or_create_data_engine(db_connection)
    return serialize_db_connection(db_connection)


@app.post("/db-connections/{connection_id}/activate", response_model=DBConnectionRead)
def activate_db_connection(connection_id: int, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    db_connection = session.get(DBConnectionConfig, connection_id)
    if not db_connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    all_connections = session.exec(select(DBConnectionConfig)).all()
    for item in all_connections:
        item.is_active = item.id == connection_id
        item.updated_at = datetime.now(timezone.utc)
        session.add(item)
    session.commit()
    session.refresh(db_connection)
    get_or_create_data_engine(db_connection)
    return serialize_db_connection(db_connection)


@app.delete("/db-connections/{connection_id}", status_code=204)
def delete_db_connection(connection_id: int, request: Request, session: Session = Depends(get_control_session)):
    require_admin_user(request)
    db_connection = session.get(DBConnectionConfig, connection_id)
    if not db_connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    if db_connection.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active database connection")
    session.delete(db_connection)
    session.commit()
