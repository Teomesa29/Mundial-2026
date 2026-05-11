from datetime import datetime, timedelta, timezone
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import ActivityLog
from typing import Any, Optional

async def log_activity(
    db: AsyncSession,
    user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: int,
    old_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """
    Registra una actividad en la base de datos.
    """
    log_entry = ActivityLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(log_entry)
    # No hacemos commit aquí para permitir que sea parte de una transacción externa

async def prune_old_logs(db: AsyncSession, days: int = 7):
    """
    Elimina logs más antiguos que el número de días especificado.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = delete(ActivityLog).where(ActivityLog.created_at < cutoff)
    await db.execute(stmt)
    await db.commit()
