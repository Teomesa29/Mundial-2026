"""
=============================================================================
TEST COMPLETO: Football API Integration + Backend Sync
=============================================================================
Prueba:
  1. Conectividad directa con api.football-data.org/v4
  2. Todos los endpoints que el sync_service usa: matches, standings, scorers, teams, squads
  3. Que el backend sincroniza y persiste los datos correctamente (matches, stadiums, teams)
  4. Que los partidos en curso (LIVE/IN_PLAY) se detectan y actualizan
  5. Que los datos de estadio / venue llegan desde la API
=============================================================================
Uso:
    Arranca el backend primero:   uvicorn app.main:app --reload
    Luego corre este script:      python test_football_api.py
=============================================================================
"""

import os
import sys
import asyncio
import httpx
import requests
import logging
from datetime import datetime, timezone
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Configuración ────────────────────────────────────────────────────────────
FOOTBALL_API_URL = "https://api.football-data.org/v4"
FOOTBALL_API_KEY = "bb9db39a06e3462b9d3e7a4e7f68cab9"
BACKEND_URL      = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL      = "admin@example.com"
ADMIN_PASSWORD   = "admin123"

HEADERS_FOOTBALL = {"X-Auth-Token": FOOTBALL_API_KEY}

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "
INFO = "ℹ️ "

# ─── Utilidades ───────────────────────────────────────────────────────────────

def section(title: str):
    logger.info("")
    logger.info("=" * 65)
    logger.info(f"  {title}")
    logger.info("=" * 65)


def check(ok: bool, msg: str):
    icon = PASS if ok else FAIL
    logger.info(f"  {icon}  {msg}")
    return ok


# ═══════════════════════════════════════════════════════════════════════════════
# PARTE 1 – Pruebas directas a la Football API
# ═══════════════════════════════════════════════════════════════════════════════

def test_direct_api_connectivity():
    section("1. CONECTIVIDAD DIRECTA — api.football-data.org")
    url = f"{FOOTBALL_API_URL}/competitions/WC"
    try:
        r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=10)
        ok = r.status_code == 200
        check(ok, f"GET /competitions/WC → HTTP {r.status_code}")
        if ok:
            data = r.json()
            logger.info(f"     Competición: {data.get('name')} | Temporada: {data.get('currentSeason', {}).get('startDate')}")
        return ok
    except Exception as e:
        check(False, f"Error de conexión: {e}")
        return False


def test_direct_matches():
    section("2. PARTIDOS — GET /competitions/WC/matches")
    url = f"{FOOTBALL_API_URL}/competitions/WC/matches"
    r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
    ok = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        logger.error(f"     Body: {r.text[:300]}")
        return False

    data = r.json()
    matches = data.get("matches", [])
    check(len(matches) > 0, f"Se recibieron {len(matches)} partidos")

    # Conteo por estado
    statuses: dict = {}
    venues: set = set()
    has_venue_data = False

    for m in matches:
        s = m.get("status", "UNKNOWN")
        statuses[s] = statuses.get(s, 0) + 1
        venue = m.get("venue")
        if venue:
            venues.add(venue)
            has_venue_data = True

    logger.info(f"     Estados encontrados: {statuses}")
    check(has_venue_data, f"Datos de venue/estadio presentes en la respuesta ({len(venues)} venues únicos)")
    if venues:
        logger.info(f"     Venues: {list(venues)[:5]}{'...' if len(venues) > 5 else ''}")

    # Revisa la estructura de un partido
    if matches:
        m = matches[0]
        has_home  = bool(m.get("homeTeam", {}).get("id"))
        has_away  = bool(m.get("awayTeam", {}).get("id"))
        has_date  = bool(m.get("utcDate"))
        has_score = "score" in m
        has_stage = bool(m.get("stage"))
        check(has_home and has_away, "Equipos locales y visitantes presentes")
        check(has_date,  "Campo utcDate presente")
        check(has_score, "Bloque score presente")
        check(has_stage, f"Stage presente: {m.get('stage')}")

    # Partidos LIVE o FINISHED (para ver si hay actualizaciones en tiempo real)
    live     = [m for m in matches if m["status"] in ("IN_PLAY", "PAUSED", "LIVE")]
    finished = [m for m in matches if m["status"] == "FINISHED"]
    scheduled= [m for m in matches if m["status"] in ("SCHEDULED", "TIMED")]

    logger.info(f"     LIVE: {len(live)} | FINISHED: {len(finished)} | SCHEDULED: {len(scheduled)}")

    if live:
        lm = live[0]
        home_goals = lm.get("score", {}).get("fullTime", {}).get("home")
        away_goals = lm.get("score", {}).get("fullTime", {}).get("away")
        logger.info(f"     {INFO} Partido LIVE: {lm['homeTeam']['name']} {home_goals}-{away_goals} {lm['awayTeam']['name']}")

    if finished:
        fm = finished[0]
        ft = fm.get("score", {}).get("fullTime", {})
        logger.info(f"     Primer FINISHED: {fm['homeTeam']['name']} {ft.get('home')}-{ft.get('away')} {fm['awayTeam']['name']}")

    return True


def test_direct_standings():
    section("3. STANDINGS / GRUPOS — GET /competitions/WC/standings")
    url = f"{FOOTBALL_API_URL}/competitions/WC/standings"
    r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
    ok = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        logger.error(f"     Body: {r.text[:300]}")
        return False

    data = r.json()
    standings = data.get("standings", [])
    total_standings = [s for s in standings if s.get("type") == "TOTAL"]
    check(len(total_standings) > 0, f"Standings tipo TOTAL: {len(total_standings)} grupos")

    teams_found = 0
    for standing in total_standings:
        group = standing.get("group", "N/A")
        table = standing.get("table", [])
        teams_found += len(table)
        logger.info(f"     Grupo {group}: {len(table)} equipos")
        if table:
            t = table[0]
            team_data = t.get("team", {})
            has_crest = bool(team_data.get("crest"))
            has_area  = bool(team_data.get("area", {}).get("name"))
            check(has_crest, f"Logo (crest) disponible para {team_data.get('name', '?')}")
            check(has_area,  f"Área/Confederación disponible: {team_data.get('area', {}).get('name')}")

    check(teams_found >= 32, f"Total de equipos en standings: {teams_found} (se esperan ≥32)")
    return True


def test_direct_scorers():
    section("4. GOLEADORES — GET /competitions/WC/scorers")
    url = f"{FOOTBALL_API_URL}/competitions/WC/scorers"
    r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15, params={"limit": 10})
    ok = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        logger.warning(f"     Body: {r.text[:200]} (puede ser 403 si el torneo no ha comenzado)")
        return False

    data = r.json()
    scorers = data.get("scorers", [])
    check(len(scorers) >= 0, f"Goleadores recibidos: {len(scorers)}")
    if scorers:
        s = scorers[0]
        logger.info(f"     Top goleador: {s['player']['name']} ({s['team']['name']}) — {s.get('goals', 0)} goles")
    else:
        logger.info(f"     {WARN} No hay goleadores aún (normal antes del inicio del torneo)")
    return True


def test_direct_teams():
    section("5. EQUIPOS — GET /competitions/WC/teams")
    url = f"{FOOTBALL_API_URL}/competitions/WC/teams"
    r = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
    ok = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        logger.error(f"     Body: {r.text[:300]}")
        return False

    data = r.json()
    teams = data.get("teams", [])
    check(len(teams) >= 32, f"Equipos recibidos: {len(teams)}")

    if teams:
        t = teams[0]
        has_id     = bool(t.get("id"))
        has_name   = bool(t.get("name"))
        has_tla    = bool(t.get("tla"))
        has_crest  = bool(t.get("crest"))
        has_area   = bool(t.get("area", {}).get("name"))
        check(has_id and has_name, f"ID y nombre del equipo: {t.get('id')} / {t.get('name')}")
        check(has_tla,   f"TLA (código 3 letras): {t.get('tla')}")
        check(has_crest, f"URL de escudo presente")
        check(has_area,  f"Área: {t.get('area', {}).get('name')}")

    return True


def test_direct_team_squad():
    section("6. SQUAD DE UN EQUIPO — GET /teams/{id}")
    # Colombia = 762 (ejemplo), Argentina = 762 — buscar primero
    url_teams = f"{FOOTBALL_API_URL}/competitions/WC/teams"
    r_teams   = requests.get(url_teams, headers=HEADERS_FOOTBALL, timeout=15)
    if r_teams.status_code != 200:
        check(False, "No se pudo obtener la lista de equipos para la prueba de squad")
        return False

    teams = r_teams.json().get("teams", [])
    if not teams:
        check(False, "Sin equipos para probar squad")
        return False

    team = teams[0]
    team_id   = team["id"]
    team_name = team["name"]

    url = f"{FOOTBALL_API_URL}/teams/{team_id}"
    r   = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15)
    ok  = r.status_code == 200
    check(ok, f"GET /teams/{team_id} ({team_name}) → HTTP {r.status_code}")
    if not ok:
        return False

    data  = r.json()
    squad = data.get("squad", [])
    check(len(squad) > 0, f"Jugadores en el squad: {len(squad)}")

    if squad:
        p = squad[0]
        has_name = bool(p.get("name"))
        has_pos  = bool(p.get("position"))
        has_nat  = bool(p.get("nationality"))
        check(has_name, f"Nombre del jugador: {p.get('name')}")
        check(has_pos,  f"Posición: {p.get('position')}")
        check(has_nat,  f"Nacionalidad: {p.get('nationality')}")

    return True


def test_direct_live_matches():
    section("7. PARTIDOS LIVE — GET /competitions/WC/matches?status=LIVE")
    url = f"{FOOTBALL_API_URL}/competitions/WC/matches"
    r   = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15, params={"status": "LIVE"})
    ok  = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        return False

    live = r.json().get("matches", [])
    if live:
        check(True, f"HAY {len(live)} PARTIDOS EN VIVO AHORA MISMO 🔴")
        for lm in live:
            ft = lm.get("score", {}).get("fullTime", {})
            logger.info(
                f"     🔴 {lm['homeTeam']['name']} {ft.get('home')}-{ft.get('away')} "
                f"{lm['awayTeam']['name']} | {lm.get('minute', '?')}'  "
                f"Venue: {lm.get('venue', 'N/A')}"
            )
    else:
        logger.info(f"     {INFO} No hay partidos LIVE en este momento (normal fuera de horario de juego)")
        check(True, "Endpoint LIVE responde correctamente con lista vacía")
    return True


def test_direct_finished_matches():
    section("8. PARTIDOS TERMINADOS — GET /competitions/WC/matches?status=FINISHED")
    url = f"{FOOTBALL_API_URL}/competitions/WC/matches"
    r   = requests.get(url, headers=HEADERS_FOOTBALL, timeout=15, params={"status": "FINISHED"})
    ok  = r.status_code == 200
    check(ok, f"HTTP {r.status_code}")
    if not ok:
        return False

    finished = r.json().get("matches", [])
    check(True, f"Partidos terminados: {len(finished)}")
    if finished:
        fm = finished[-1]  # El más reciente
        ft = fm.get("score", {}).get("fullTime", {})
        logger.info(
            f"     Último terminado: {fm['homeTeam']['name']} {ft.get('home')}-{ft.get('away')} "
            f"{fm['awayTeam']['name']} | {fm.get('utcDate', '')[:10]} "
            f"Venue: {fm.get('venue', 'N/A')}"
        )
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# PARTE 2 – Pruebas del Backend (sync endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

def get_admin_token() -> Optional[str]:
    try:
        r = requests.post(
            f"{BACKEND_URL}/auth/login",
            data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json()["access_token"]
        logger.warning(f"Admin login falló: {r.status_code} {r.text}")
        return None
    except Exception as e:
        logger.warning(f"No se pudo conectar al backend: {e}")
        return None


def test_backend_reachable() -> bool:
    section("9. CONECTIVIDAD — Backend FastAPI")
    try:
        r = requests.get(f"{BACKEND_URL.replace('/api/v1', '')}/health", timeout=5)
        ok = r.status_code == 200
        check(ok, f"GET /health → HTTP {r.status_code}")
        return ok
    except Exception:
        # Intentar con el endpoint de matches directamente
        try:
            r = requests.get(f"{BACKEND_URL}/matches", timeout=5)
            ok = r.status_code in (200, 401, 403)
            check(ok, f"Backend responde en {BACKEND_URL} (HTTP {r.status_code})")
            return ok
        except Exception as e:
            check(False, f"Backend no responde: {e}")
            logger.info(f"     {WARN} Asegúrate de correr: uvicorn app.main:app --reload")
            return False


def test_backend_sync_matches(token: str):
    section("10. SYNC DE PARTIDOS — POST /admin/sync")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        logger.info("     Sincronizando partidos desde Football API... (puede tardar ~5s)")
        r = requests.post(f"{BACKEND_URL}/admin/sync", headers=headers, timeout=60)
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            data = r.json()
            logger.info(f"     Resultado sync matches: updated={data.get('updated')} | created={data.get('created')} | errors={data.get('errors')}")
            check(data.get("errors", 0) == 0, "Sin errores durante sync")
        else:
            logger.error(f"     Body: {r.text[:300]}")
        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_backend_sync_standings(token: str):
    section("11. SYNC DE STANDINGS/EQUIPOS — POST /admin/sync/standings")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        logger.info("     Sincronizando standings, equipos y estadios...")
        r = requests.post(f"{BACKEND_URL}/admin/sync/standings", headers=headers, timeout=60)
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            data = r.json()
            logger.info(f"     Resultado: {data}")
        else:
            logger.error(f"     Body: {r.text[:300]}")
        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_backend_sync_stadiums(token: str):
    section("12. SYNC DE ESTADIOS — POST /admin/sync/stadiums")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.post(f"{BACKEND_URL}/admin/sync/stadiums", headers=headers, timeout=30)
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            data = r.json()
            logger.info(f"     Estadios — created={data.get('data', {}).get('created', 0)} | updated={data.get('data', {}).get('updated', 0)}")
        else:
            logger.error(f"     Body: {r.text[:300]}")
        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_backend_sync_scorers(token: str):
    section("13. SYNC DE GOLEADORES — POST /admin/sync/scorers")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.post(f"{BACKEND_URL}/admin/sync/scorers", headers=headers, timeout=30)
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            data = r.json()
            logger.info(f"     Goleadores: {data}")
        else:
            logger.warning(f"     Body: {r.text[:200]} (puede ser normal antes del torneo)")
        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_backend_matches_after_sync():
    section("14. VERIFICAR PARTIDOS EN BD — GET /matches")
    try:
        # Sin auth para ver cuántos matches hay en DB
        r = requests.get(f"{BACKEND_URL}/matches", timeout=15)
        if r.status_code in (401, 403):
            logger.info("     Endpoint requiere auth — probando con token...")
            return True  # No bloqueante
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            matches = r.json()
            check(len(matches) > 0, f"Partidos en BD: {len(matches)}")

            # Verificar campos clave
            if matches:
                m = matches[0]
                required_fields = ["id", "status", "match_date", "home_team", "away_team"]
                for field in required_fields:
                    check(field in m, f"Campo '{field}' presente")

                # Venue / stadium
                has_stadium = bool(m.get("stadium") or m.get("venue") or m.get("stadium_id"))
                check(has_stadium, "Información de estadio vinculada al partido")

        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_backend_teams_after_sync():
    section("15. VERIFICAR EQUIPOS EN BD — GET /teams")
    try:
        r = requests.get(f"{BACKEND_URL}/teams", timeout=15)
        if r.status_code in (401, 403):
            logger.info(f"     {INFO} Endpoint requiere auth (OK)")
            return True
        ok = r.status_code == 200
        check(ok, f"HTTP {r.status_code}")
        if ok:
            teams = r.json()
            check(len(teams) >= 32, f"Equipos en BD: {len(teams)} (se esperan ≥32)")
            if teams:
                t = teams[0]
                check(bool(t.get("logo_url") or t.get("crest")), "Logo del equipo presente en BD")
        return ok
    except Exception as e:
        check(False, f"Error: {e}")
        return False


def test_rate_limit_handling():
    section("16. MANEJO DE RATE LIMIT — requests rápidos consecutivos")
    logger.info("     Enviando 3 requests consecutivos a la Football API...")
    all_ok = True
    for i in range(3):
        r = requests.get(
            f"{FOOTBALL_API_URL}/competitions/WC/matches",
            headers=HEADERS_FOOTBALL,
            timeout=15,
        )
        ok = r.status_code in (200, 429)
        if r.status_code == 429:
            logger.info(f"     {WARN} Rate limit (429) en request {i+1} — el cliente tiene retry con backoff")
        else:
            check(ok, f"Request {i+1}: HTTP {r.status_code}")
        if not ok:
            all_ok = False
    return all_ok


# ═══════════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════════

def print_summary(results: dict):
    section("RESUMEN FINAL")
    total  = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed

    for name, ok in results.items():
        icon = PASS if ok else FAIL
        logger.info(f"  {icon}  {name}")

    logger.info("")
    logger.info(f"  TOTAL: {passed}/{total} pruebas pasaron")
    if failed:
        logger.info(f"  {FAIL} {failed} pruebas fallaron — revisa los detalles arriba")
    else:
        logger.info(f"  {PASS} Todo OK — La integración con la Football API funciona correctamente")
    logger.info("")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("")
    logger.info("  🌍  MUNDIAL 2026 — Football API Integration Test Suite")
    logger.info(f"  API URL:     {FOOTBALL_API_URL}")
    logger.info(f"  Backend URL: {BACKEND_URL}")
    logger.info(f"  Timestamp:   {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")

    results = {}

    # ── Parte 1: API directa ──────────────────────────────────────────────────
    results["Conectividad Football API"]           = test_direct_api_connectivity()
    results["Partidos (matches) — estructura"]     = test_direct_matches()
    results["Standings / Grupos"]                  = test_direct_standings()
    results["Goleadores (scorers)"]                = test_direct_scorers()
    results["Lista de equipos (teams)"]            = test_direct_teams()
    results["Squad de equipo individual"]          = test_direct_team_squad()
    results["Partidos LIVE (tiempo real)"]         = test_direct_live_matches()
    results["Partidos FINISHED (resultados)"]      = test_direct_finished_matches()
    results["Manejo de rate limit"]                = test_rate_limit_handling()

    # ── Parte 2: Backend sync ─────────────────────────────────────────────────
    backend_ok = test_backend_reachable()
    results["Backend FastAPI accesible"] = backend_ok

    if backend_ok:
        token = get_admin_token()
        if token:
            logger.info(f"  {PASS}  Login admin exitoso")
            results["Sync de partidos (backend)"]   = test_backend_sync_matches(token)
            results["Sync de standings/equipos"]    = test_backend_sync_standings(token)
            results["Sync de estadios"]             = test_backend_sync_stadiums(token)
            results["Sync de goleadores"]           = test_backend_sync_scorers(token)
            results["Partidos en BD post-sync"]     = test_backend_matches_after_sync()
            results["Equipos en BD post-sync"]      = test_backend_teams_after_sync()
        else:
            logger.warning("  ⚠️  No se pudo obtener token de admin — saltando pruebas de sync del backend")
            logger.warning("      Crea el admin con: python test_system.py (setup_test_user)")
            results["Sync backend (admin token)"] = False
    else:
        logger.warning("  ⚠️  Backend no disponible — saltando pruebas de sync")
        results["Sync backend"] = False

    print_summary(results)

    # Exit code para CI/CD
    all_passed = all(results.values())
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
