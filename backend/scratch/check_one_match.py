
import requests
import json
import time

FOOTBALL_API_URL = "https://api.football-data.org/v4"
FOOTBALL_API_KEY = "bb9db39a06e3462b9d3e7a4e7f68cab9"
HEADERS_FOOTBALL = {"X-Auth-Token": FOOTBALL_API_KEY}

def check_one_match():
    url = f"{FOOTBALL_API_URL}/competitions/WC/matches"
    for i in range(3):
        r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
        if r.status_code == 200:
            data = r.json()
            matches = data.get("matches", [])
            if matches:
                m = matches[0]
                print(f"Match Keys: {list(m.keys())}")
                print(f"Venue: {m.get('venue')}")
                # Print the whole first match to see if there is any other field
                print(json.dumps(m, indent=2))
                return
        elif r.status_code == 429:
            print("Rate limited, sleeping...")
            time.sleep(5)
        else:
            print(f"Error: {r.status_code}")
            return

if __name__ == "__main__":
    check_one_match()
