import asyncio
from app.core.database import AsyncSessionLocal
from app.models.models import Match, PollaConfig
from app.models.enums import MatchStage, MatchStatus
from sqlalchemy import select, func

async def run_verification():
    print("====================================================================")
    print(" VERIFICACIÓN DE TRANSICIÓN FASE DE GRUPOS -> ELIMINATORIAS (BRACKET)")
    print("====================================================================")
    
    async with AsyncSessionLocal() as db:
        # 1. Verificar número total de partidos de fase de grupos
        total_group_q = select(func.count(Match.id)).where(Match.stage == MatchStage.group)
        total_group = (await db.execute(total_group_q)).scalar() or 0
        
        # 2. Verificar partidos de fase de grupos finalizados
        finished_group_q = select(func.count(Match.id)).where(
            Match.stage == MatchStage.group,
            Match.status == MatchStatus.finished
        )
        finished_group = (await db.execute(finished_group_q)).scalar() or 0
        
        # 3. Verificar partidos de dieciseisavos (Round of 32)
        r32_q = select(func.count(Match.id)).where(Match.stage == MatchStage.round_of_32)
        r32_count = (await db.execute(r32_q)).scalar() or 0
        
        # 4. Obtener la configuración actual de la polla
        config_q = select(PollaConfig).limit(1)
        config = (await db.execute(config_q)).scalar_one_or_none()
        
        print(f"\n--- Estado Actual en Base de Datos ---")
        print(f"Total Partidos Fase de Grupos: {total_group}")
        print(f"Partidos Fase de Grupos Finalizados: {finished_group}")
        print(f"Partidos de Dieciseisavos (Round of 32) Creados: {r32_count}")
        
        if config:
            print(f"Configuración 'is_bracket_open' (Llaves abiertas): {config.is_bracket_open}")
            print(f"Configuración 'is_registration_open' (Registro abierto): {config.is_registration_open}")
        else:
            print("Configuración global no encontrada en la base de datos (se usarán valores por defecto).")

        # 5. Evaluar lógica del backend para la activación del bracket
        # is_ready es True si (finished_group >= total_group y total_group > 0) o si r32_count >= 16
        group_completed = (finished_group >= total_group and total_group > 0)
        r32_ready = (r32_count >= 16)
        is_ready = group_completed or r32_ready
        
        print(f"\n--- Evaluación de Lógica de Transición ---")
        print(f"¿Fase de grupos finalizada al 100%? {'SÍ' if group_completed else 'NO'}")
        print(f"¿Hay al menos 16 partidos de Round of 32 creados con equipos clasificados? {'SÍ' if r32_ready else 'NO'}")
        print(f"¿Se habilitaría la vista del Bracket Predictor según el estado actual de los partidos? {'SÍ' if is_ready else 'NO'}")
        
        # 6. Explicar cómo ocurre la habilitación real
        print("\n--- ¿Cómo funciona técnicamente cuando se acabe la fase de grupos? ---")
        print("1. Durante el Mundial, el servicio Football API sincroniza los partidos regularmente (sync_matches).")
        print("2. Cuando finalicen los partidos de grupos reales, la API externa poblará las llaves del Round of 32 con los IDs de los equipos clasificados.")
        print("3. La sincronización local detectará los equipos reales en lugar de los marcadores TBD y creará/actualizará los 16 partidos de dieciseisavos (Round of 32) en la BD.")
        print("4. Una vez creados los 16 partidos, el endpoint `/api/v1/matches/bracket-status` retornará `is_ready: True` automáticamente.")
        print("5. El administrador podrá activar `is_bracket_open: True` en la configuración.")
        print("6. El frontend de React, al detectar `is_ready: true` y `is_bracket_open: true`, renderizará inmediatamente el interactivo del Bracket en la sección 'Mis Predicciones / Fase Final', permitiendo a los usuarios jugar y guardar sus llaves hasta la fecha límite.")

if __name__ == "__main__":
    asyncio.run(run_verification())
