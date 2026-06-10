"""
Simulación del planificador de sincronización con rate limit de 10 req/min.
Verifica que la tasa de peticiones a la API externa nunca supere 10 req/min,
incluso en el peor escenario: la fase de grupos del Mundial 2026 con hasta 6 partidos activos en el mismo día.

Límite real de football-data.org (plan gratuito con API key): 10 requests por minuto.
"""

# ── Constantes del simulador ─────────────────────────────────────────────────
ACTIVE_INTERVAL_MIN = 2         # Cada 2 min durante partido activo (1 req por sync)
PRE_MATCH_WAKE_MIN  = 15        # Despertarse 15 min antes del partido
IDLE_MAX_SLEEP_MIN  = 180       # Máximo de 3 horas en modo inactivo
MATCH_DURATION_MIN  = 120       # Duración típica de un partido (90 min + extras)
DAILY_SYNC_REQUESTS = 3         # matches (1) + standings (1) + scorers (1) en daily sync
MAX_REQ_PER_MIN     = 10        # Límite de la API

# ── Escenarios de Simulación ──────────────────────────────────────────────────

def simulate_day(matches_today: list[tuple[int, int]], label: str):
    """
    Simula un día completo (24h = 1440 min).
    matches_today: lista de (hora_inicio_min_desde_medianoche, duracion_min)
    Retorna: total de requests a la API externa y el máximo de req/min observado.
    """
    total_requests = 0
    max_req_per_min = 0
    clock = 0  # minutos desde medianoche
    daily_done = False
    
    # Tracking per-minute bursts
    requests_this_minute = 0
    last_minute = -1

    print(f"\n{'='*65}")
    print(f"  ESCENARIO: {label}")
    print(f"  Partidos hoy: {len(matches_today)}")
    for i, (start, dur) in enumerate(matches_today):
        h, m = divmod(start, 60)
        print(f"    Partido {i+1}: {h:02d}:{m:02d} UTC — duración {dur} min")
    print(f"{'='*65}")

    while clock < 1440:
        current_minute = clock
        if current_minute != last_minute:
            max_req_per_min = max(max_req_per_min, requests_this_minute)
            requests_this_minute = 0
            last_minute = current_minute

        # ¿Hay algún partido activo o por empezar en 15 min?
        is_active = False
        for start, dur in matches_today:
            window_start = start - PRE_MATCH_WAKE_MIN
            window_end   = start + dur
            if window_start <= clock <= window_end:
                is_active = True
                break

        if is_active:
            # Modo Activo: 1 request por sync_matches cada 2 minutos
            total_requests += 1
            requests_this_minute += 1
            sleep = ACTIVE_INTERVAL_MIN
        else:
            # Modo Inactivo: calcular próximo partido
            future_starts = [s for s, _ in matches_today if s > clock + PRE_MATCH_WAKE_MIN]
            if future_starts:
                next_start = min(future_starts)
                gap = next_start - clock - PRE_MATCH_WAKE_MIN
                sleep = max(5, min(gap, IDLE_MAX_SLEEP_MIN))
            else:
                sleep = IDLE_MAX_SLEEP_MIN

        # Sync diario obligatorio (1 vez al día)
        if not daily_done:
            total_requests += DAILY_SYNC_REQUESTS
            requests_this_minute += DAILY_SYNC_REQUESTS
            daily_done = True

        clock += sleep

    max_req_per_min = max(max_req_per_min, requests_this_minute)

    print(f"\n  [RESULTADO] {total_requests} requests totales en 24 horas")
    print(f"  [RESULTADO] Pico máximo: {max_req_per_min} req/min (límite: {MAX_REQ_PER_MIN})")
    
    rate_ok = max_req_per_min <= MAX_REQ_PER_MIN
    status = "OK" if rate_ok else "FALLO - EXCEDE EL LIMITE POR MINUTO"
    print(f"  {status}")
    return total_requests, max_req_per_min


# ── Ejecutar escenarios ──────────────────────────────────────────────────────

results = {}

# Escenario 1: Día sin partidos
results["Sin partidos"] = simulate_day([], "Día sin partidos")

# Escenario 2: 1 partido al mediodía
results["1 partido"] = simulate_day([(720, 120)], "1 partido (12:00 UTC)")

# Escenario 3: 2 partidos (mañana y tarde)
results["2 partidos"] = simulate_day(
    [(600, 120), (900, 120)],
    "2 partidos (10:00 y 15:00 UTC)"
)

# Escenario 4: 4 partidos (escenario peor caso común del Mundial)
results["4 partidos"] = simulate_day(
    [(540, 120), (720, 120), (900, 120), (1080, 120)],
    "4 partidos (09:00, 12:00, 15:00, 18:00 UTC)"
)

# Escenario 5: 4 partidos muy largos con extras (penales, 140 min c/u)
results["4 partidos largos"] = simulate_day(
    [(540, 140), (720, 140), (900, 140), (1080, 140)],
    "4 partidos largos con extras (140 min c/u)"
)

# Escenario 6: PEOR ESCENARIO MUNDIAL 2026 - Fase de grupos con 6 partidos diarios
results["6 partidos (Mundial 2026)"] = simulate_day(
    [(600, 120), (750, 120), (900, 120), (1050, 120), (1200, 120), (1350, 120)],
    "6 partidos fase de grupos Mundial 2026 (cada 2.5h)"
)

# ── Resumen ──────────────────────────────────────────────────────────────────
print(f"\n{'='*65}")
print("  RESUMEN FINAL")
print(f"{'='*65}")
print(f"  {'Escenario':<32s} {'Total/día':>10s} {'Pico/min':>10s} {'Estado':>8s}")
print(f"  {'-'*32} {'-'*10} {'-'*10} {'-'*8}")
for name, (total, peak) in results.items():
    status = "[OK]" if peak <= MAX_REQ_PER_MIN else "[FALLO]"
    print(f"  {name:<32s} {total:>10d} {peak:>10d} {status:>8s}")

print(f"\n  Límite de la API: {MAX_REQ_PER_MIN} requests por minuto")
print(f"  Intervalo de sync activo: {ACTIVE_INTERVAL_MIN} minutos (1 request por ciclo)")

all_ok = all(peak <= MAX_REQ_PER_MIN for _, peak in results.values())
if all_ok:
    print("  [OK] TODOS LOS ESCENARIOS RESPETAN EL LIMITE DE 10 REQ/MIN\n")
else:
    print("  [FALLO] ALGUN ESCENARIO EXCEDE EL LIMITE\n")
