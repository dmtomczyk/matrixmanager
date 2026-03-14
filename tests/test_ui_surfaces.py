from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_assignment, create_employee, create_organization, create_project


# Page and surface-oriented tests that validate rendered app structure and high-value UI-backed data flows.
# These cover the browser-facing TPs without requiring a full browser automation stack yet.


def test_main_page_contains_core_ui_sections(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    html = response.text
    assert "Matrix Manager" in html
    assert "Organizations" in html
    assert "Employees" in html
    assert "Projects" in html
    assert "Assignments" in html
    assert "employee-type" in html
    assert "employee-manager" in html


# TP-028, TP-031, TP-032, TP-033

def test_main_page_contains_visualization_and_export_surfaces(client: TestClient):
    response = client.get("/")
    html = response.text
    assert "allocation-chart" in html
    assert "assignment-graph" in html
    assert "assignment-export" in html
    assert "allocation-preset" in html
    assert "allocation-apply" in html


# TP-034, TP-035, TP-036, TP-037, TP-038, TP-039, TP-040, TP-041, TP-042

def test_canvas_page_contains_hierarchy_and_canvas_controls(client: TestClient):
    response = client.get("/canvas")
    assert response.status_code == 200
    html = response.text
    assert "canvas-stage" in html
    assert "resource-list" in html
    assert "canvas-org-filter" in html
    assert "Expand managers" in html or "Expand managers to browse" in html
    assert "allocation-units" in html
    assert "context-menu" in html


# TP-035, TP-036, TP-038, TP-044

def test_employee_api_exposes_hierarchy_metadata_for_canvas(client: TestClient):
    org = create_organization(client, name="Engineering")
    ceo = create_employee(client, org["id"], name="CEO", employee_type="L")
    manager = create_employee(client, org["id"], name="Manager", employee_type="L", manager_id=ceo["id"])
    report = create_employee(client, org["id"], name="Engineer", employee_type="IC", manager_id=manager["id"])

    employees = client.get("/employees")
    assert employees.status_code == 200
    payload = employees.json()

    manager_row = next(item for item in payload if item["id"] == manager["id"])
    report_row = next(item for item in payload if item["id"] == report["id"])

    assert manager_row["direct_report_count"] == 1
    assert report_row["manager_id"] == manager["id"]
    assert report_row["manager_name"] == "Manager"
    assert report_row["employee_type"] == "IC"


# TP-029, TP-030, TP-031, TP-042, TP-043

def test_data_endpoints_support_ui_views_after_state_changes(client: TestClient):
    org = create_organization(client, name="Engineering")
    leader = create_employee(client, org["id"], name="Lead", employee_type="L")
    engineer = create_employee(client, org["id"], name="Engineer", employee_type="IC", manager_id=leader["id"])
    project = create_project(client, name="Project Atlas", start_date="2026-03-01", end_date="2026-03-31")
    create_assignment(client, engineer["id"], project["id"], allocation=1.0)

    root_html = client.get("/").text
    canvas_html = client.get("/canvas").text
    assert "schedule-employee" in root_html
    assert "schedule-project" in root_html
    assert "canvas-content" in canvas_html

    employee_schedule = client.get(f"/schedule/employee/{engineer['id']}").json()
    project_schedule = client.get(f"/schedule/project/{project['id']}").json()
    assignments = client.get("/assignments").json()

    assert len(employee_schedule) == 1
    assert len(project_schedule) == 1
    assert len(assignments) == 1
    assert assignments[0]["allocation"] == 1.0
