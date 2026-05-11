
import requests
import json

FOOTBALL_API_URL = "https://api.football-data.org/v4"
FOOTBALL_API_KEY = "bb9db39a06e3462b9d3e7a4e7f68cab9"
HEADERS_FOOTBALL = {"X-Auth-Token": FOOTBALL_API_KEY}

def get_match_detail():
    url = f"{FOOTBALL_API_URL}/competitions/WC/matches"
    r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
    if r.status_code == 200:
        data = r.json()
        matches = data.get("matches", [])
        if matches:
            match_id = matches[0]['id']
            detail_url = f"{FOOTBALL_API_URL}/matches/{match_id}"
            rd = requests.get(detail_url, headers=HEADERS_FOOTBALL, timeout=15)
            if rd.status_code == 200:
                print(json.dumps(rd.json(), indent=2))
            else:
                print(f"Error detail: {rd.status_code}")
    else:
        print(f"Error list: {r.status_code}")

if __name__ == "__main__":
    get_match_detail()
