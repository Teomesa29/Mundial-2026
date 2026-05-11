import os
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_URL = "http://127.0.0.1:8000/api/v1"

def login_admin():
    data = {"username": "admin@example.com", "password": "admin123"}
    response = requests.post(f"{API_URL}/auth/login", data=data)
    response.raise_for_status()
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def trigger_sync(endpoint):
    headers = login_admin()
    logger.info(f"Triggering {endpoint}...")
    resp = requests.post(f"{API_URL}{endpoint}", headers=headers)
    if resp.status_code == 200:
        logger.info(f"Success {endpoint}: {resp.json()}")
    else:
        logger.error(f"Failed {endpoint}: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    endpoints = [
        "/sync/players",
        "/sync/scorers"
    ]
    for ep in endpoints:
        trigger_sync(ep)
