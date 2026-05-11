import asyncio
from app.core.database import AsyncSessionLocal
from app.services.sync_service import recalculate_all_teams_stats

async def main():
    print("Iniciando recálculo manual de estadísticas de equipos...")
    async with AsyncSessionLocal() as db:
        await recalculate_all_teams_stats(db)
    print("Recálculo completado.")

if __name__ == "__main__":
    asyncio.run(main())
