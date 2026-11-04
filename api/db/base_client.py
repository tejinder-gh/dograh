from typing import Any, Callable, Coroutine, Dict, List, TypeVar

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.constants import DATABASE_URL
from api.db.database_guard import assert_safe_database_target

T = TypeVar("T")


class BaseDBClient:
    def __init__(self):
        assert_safe_database_target(DATABASE_URL)
        self.engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
        self.async_session = async_sessionmaker(bind=self.engine)

    async def run_in_transaction(
        self, callback: Callable[[AsyncSession], Coroutine[Any, Any, T]]
    ) -> T:
        """Execute a callback inside an ACID transaction on the database."""
        async with self.async_session() as session:
            async with session.begin():
                return await callback(session)

    async def execute_raw_query(
        self, query: str, params: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a raw SQL query and return results as a list of dictionaries.

        Args:
            query: The SQL query to execute
            params: Optional dictionary of query parameters

        Returns:
            List of dictionaries containing the query results
        """
        async with self.async_session() as session:
            result = await session.execute(text(query), params or {})
            await session.commit()
            if result.returns_rows:
                rows = result.fetchall()
                if rows:
                    # Convert rows to dictionaries
                    columns = result.keys()
                    return [dict(zip(columns, row)) for row in rows]
            return []
