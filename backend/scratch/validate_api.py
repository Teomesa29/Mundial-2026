import asyncio
import os
import sys

# Add the backend directory to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from app.services.football_api import football_api

async def test_api():
    print("Testing Football API for Champions League matches...")
    
    # We use 'CL' for Champions League
    # We can use 'dateFrom' and 'dateTo' to filter by today's date
    # Search for all CL matches in May
    cl_matches = await football_api._request("/competitions/CL/matches", params={"dateFrom": "2026-05-01", "dateTo": "2026-05-31"})
    
    if cl_matches:
        print(f"\nFound {len(cl_matches.get('matches', []))} CL matches in May:")
        for match in cl_matches.get('matches', []):
            home_team = match.get('homeTeam', {}).get('name', 'N/A')
            away_team = match.get('awayTeam', {}).get('name', 'N/A')
            status = match['status']
            date = match['utcDate'][:10]
            score = match.get('score', {}).get('fullTime', {})
            print(f"- {date} | {home_team} vs {away_team} | Status: {status} | Score: {score.get('home')} - {score.get('away')}")
    else:
        print(f"No CL matches found in May")

    # Check La Liga (PD) to see if team names are visible
    pd_matches = await football_api._request("/competitions/PD/matches", params={"dateFrom": today, "dateTo": today})
    if pd_matches and pd_matches.get('matches'):
        print(f"\nFound {len(pd_matches.get('matches', []))} La Liga matches for {today}:")
        for match in pd_matches.get('matches', []):
            home_team = match.get('homeTeam', {}).get('name', 'N/A')
            away_team = match.get('awayTeam', {}).get('name', 'N/A')
            print(f"- {home_team} vs {away_team} | Status: {match['status']}")
    else:
        # Try a wider range for PD if nothing today
        pd_matches = await football_api._request("/competitions/PD/matches", params={"dateFrom": "2026-05-01", "dateTo": "2026-05-10"})
        if pd_matches and pd_matches.get('matches'):
            print(f"\nFound {len(pd_matches.get('matches', []))} La Liga matches recently:")
            for match in pd_matches.get('matches', [])[:5]:
                print(f"- {match['utcDate'][:10]} | {match.get('homeTeam', {}).get('name', 'N/A')} vs {match.get('awayTeam', {}).get('name', 'N/A')}")

    # Also check WC just in case
    wc_matches = await football_api._request("/competitions/WC/matches")
    if wc_matches and wc_matches.get('matches'):
        print(f"\nTotal WC matches found: {len(wc_matches.get('matches', []))}")
        # Print a few matches
        for match in wc_matches.get('matches', [])[:3]:
            print(f"- {match['homeTeam']['name']} vs {match['awayTeam']['name']} | Status: {match['status']}")

if __name__ == "__main__":
    asyncio.run(test_api())
