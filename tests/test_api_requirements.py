from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import create_assignment, create_employee, create_organization, create_project


# TP-001, TP-002, TP-003, TP-004

def test_organizations_crud_and_headcount(client: TestClient):
    org = create_organization(client, name="Engineering", description="Builds things")

    update_response = client.put(
        f"/organizations/{org['id']}",
        json={"name": "Platform Engineering", "description": "Core systems"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Platform Engineering"

    leader = create_employee(client, org["id"], name="Dana Leader", employee_type="L")
    create_employee(client, org["id"], name="Ivy IC", employee_type="IC", manager_id=leader["id"])

    list_response = client.get("/organizations")
    assert list_response.status_code == 200
    organizations = list_response.json()
    assert any(item["name"] == "Platform Engineering" for item in organizations)

    blocked_delete = client.delete(f"/organizations/{org['id']}")
    assert blocked_delete.status_code == 400
    assert "assigned employees" in blocked_delete.text

    empty_org = create_organization(client, name="Empty Org")
    delete_response = client.delete(f"/organizations/{empty_org['id']}")
    assert delete_response.status_code == 204


# TP-005, TP-006, TP-008, TP-009, TP-010, TP-011, TP-012, TP-013, TP-014, TP-015, TP-016, TP-017, TP-044

def test_employee_hierarchy_rules_and_updates(client: TestClient):
    org_a = create_organization(client, name="Engineering")
    org_b = create_organization(client, name="Product")

    ceo = create_employee(client, org_a["id"], name="CEO", employee_type="L")
    manager = create_employee(client, org_a["id"], name="Manager", employee_type="L", manager_id=ceo["id"])
    ic = create_employee(client, org_a["id"], name="Engineer", employee_type="IC", manager_id=manager["id"], role="Dev")

    employees = client.get("/employees").json()
    engineer = next(item for item in employees if item["id"] == ic["id"])
    assert engineer["employee_type"] == "IC"
    assert engineer["manager_name"] == "Manager"
    assert engineer["organization_name"] == "Engineering"

    bad_ic_response = client.post(
        "/employees",
        json={
            "name": "Unmanaged IC",
            "employee_type": "IC",
            "organization_id": org_a["id"],
            "capacity": 1.0,
        },
    )
    assert bad_ic_response.status_code == 400
    assert "must have a manager" in bad_ic_response.text

    valid_leader_response = client.post(
        "/employees",
        json={
            "name": "Top Leader",
            "employee_type": "L",
            "organization_id": org_a["id"],
            "capacity": 1.0,
        },
    )
    assert valid_leader_response.status_code == 201

    ic_as_manager = client.post(
        "/employees",
        json={
            "name": "Wrong Report",
            "employee_type": "IC",
            "organization_id": org_a["id"],
            "manager_id": ic["id"],
            "capacity": 1.0,
        },
    )
    assert ic_as_manager.status_code == 400
    assert "Only leaders can be assigned as managers" in ic_as_manager.text

    self_manage = client.put(f"/employees/{manager['id']}", json={"manager_id": manager["id"]})
    assert self_manage.status_code == 400

    cycle_response = client.put(f"/employees/{ceo['id']}", json={"manager_id": manager["id"]})
    assert cycle_response.status_code == 400
    assert "cycle" in cycle_response.text.lower()

    update_response = client.put(
        f"/employees/{ic['id']}",
        json={
            "employee_type": "L",
            "manager_id": None,
            "role": "Tech Lead",
            "location": "Remote",
            "capacity": 0.8,
            "organization_id": org_b["id"],
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["employee_type"] == "L"
    assert updated["manager_id"] is None
    assert updated["role"] == "Tech Lead"
    assert updated["location"] == "Remote"
    assert updated["capacity"] == 0.8
    assert updated["organization_id"] == org_b["id"]

    reassigned_ic = client.put(
        f"/employees/{updated['id']}",
        json={"employee_type": "IC", "manager_id": manager["id"]},
    )
    assert reassigned_ic.status_code == 200, reassigned_ic.text

    downgrade_manager = client.put(
        f"/employees/{manager['id']}",
        json={"employee_type": "IC", "manager_id": ceo["id"]},
    )
    assert downgrade_manager.status_code == 400
    assert "direct reports" in downgrade_manager.text

    filtered = [item for item in client.get("/employees").json() if item["organization_id"] == org_b["id"]]
    assert any(item["id"] == ic["id"] for item in filtered)


# TP-018, TP-019, TP-020, TP-021

def test_projects_crud_and_date_validation(client: TestClient):
    project = create_project(client, name="Apollo", description="Moonshot", start_date="2026-03-01", end_date="2026-03-31")

    update_response = client.put(
        f"/projects/{project['id']}",
        json={"name": "Apollo X", "description": "Updated", "start_date": "2026-03-02", "end_date": "2026-04-01"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Apollo X"

    invalid_project = client.post(
        "/projects",
        json={"name": "Broken", "start_date": "2026-04-10", "end_date": "2026-04-01"},
    )
    assert invalid_project.status_code == 400
    assert "End date must be after start date" in invalid_project.text

    org = create_organization(client, name="Engineering")
    leader = create_employee(client, org["id"], name="Lead", employee_type="L")
    engineer = create_employee(client, org["id"], name="Engineer", employee_type="IC", manager_id=leader["id"])
    create_assignment(client, engineer["id"], project["id"])

    delete_response = client.delete(f"/projects/{project['id']}")
    assert delete_response.status_code == 204
    assignments = client.get("/assignments").json()
    assert assignments == []


# TP-022, TP-023, TP-024, TP-025, TP-026, TP-027, TP-029, TP-030, TP-043

def test_assignments_and_schedule_endpoints(client: TestClient):
    org = create_organization(client, name="Engineering")
    leader = create_employee(client, org["id"], name="Lead", employee_type="L")
    engineer = create_employee(client, org["id"], name="Engineer", employee_type="IC", manager_id=leader["id"])
    project = create_project(client, name="Roadmap", start_date="2026-03-01", end_date="2026-03-31")

    assignment = create_assignment(
        client,
        engineer["id"],
        project["id"],
        start_date="2026-03-03",
        end_date="2026-03-10",
        allocation=0.5,
        notes="Initial staffing",
    )
    assert assignment["employee_name"] == "Engineer"
    assert assignment["project_name"] == "Roadmap"

    update_response = client.put(
        f"/assignments/{assignment['id']}",
        json={"allocation": 0.75, "notes": "Expanded scope", "end_date": "2026-03-14"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["allocation"] == 0.75
    assert updated["notes"] == "Expanded scope"

    invalid_date = client.post(
        "/assignments",
        json={
            "employee_id": engineer["id"],
            "project_id": project["id"],
            "start_date": "2026-03-20",
            "end_date": "2026-03-10",
            "allocation": 0.5,
        },
    )
    assert invalid_date.status_code == 400

    for bad_allocation in [0, -0.1, 1.1]:
        bad = client.post(
            "/assignments",
            json={
                "employee_id": engineer["id"],
                "project_id": project["id"],
                "start_date": "2026-03-05",
                "end_date": "2026-03-06",
                "allocation": bad_allocation,
            },
        )
        assert bad.status_code == 400

    employee_schedule = client.get(f"/schedule/employee/{engineer['id']}")
    assert employee_schedule.status_code == 200
    assert employee_schedule.json()[0]["project_name"] == "Roadmap"

    project_schedule = client.get(f"/schedule/project/{project['id']}")
    assert project_schedule.status_code == 200
    assert project_schedule.json()[0]["employee_name"] == "Engineer"

    delete_response = client.delete(f"/assignments/{assignment['id']}")
    assert delete_response.status_code == 204
    assert client.get("/assignments").json() == []


# TP-007, TP-020, TP-024, TP-043

def test_deletes_refresh_related_data(client: TestClient):
    org = create_organization(client, name="Engineering")
    leader = create_employee(client, org["id"], name="Lead", employee_type="L")
    engineer = create_employee(client, org["id"], name="Engineer", employee_type="IC", manager_id=leader["id"])
    project = create_project(client, name="Cleanup")
    assignment = create_assignment(client, engineer["id"], project["id"])

    assert len(client.get("/assignments").json()) == 1
    client.delete(f"/employees/{engineer['id']}")
    assert client.get("/assignments").json() == []

    engineer2 = create_employee(client, org["id"], name="Engineer 2", employee_type="IC", manager_id=leader["id"])
    assignment2 = create_assignment(client, engineer2["id"], project["id"])
    assert assignment2["id"]

    client.delete(f"/projects/{project['id']}")
    assert client.get("/assignments").json() == []
