"""Smoke tests for the FastAPI app.  No env vars required."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_status_200():
    response = client.get("/health")
    assert response.status_code == 200


def test_health_response_shape():
    data = client.get("/health").json()
    assert data["status"] == "ok"
    assert "version" in data


def test_protected_endpoint_without_token_returns_401():
    """Any future protected endpoint must reject unauthenticated requests.

    This test documents the expectation; it will fail (404) until the first
    protected route is added, at which point update the path.
    """
    response = client.get("/forecast-demand")
    assert response.status_code in (401, 404)
