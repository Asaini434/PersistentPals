import os
from collections.abc import Generator

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row


def get_connection() -> Generator[psycopg.Connection, None, None]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="Database is not configured.")

    try:
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            yield connection
    except psycopg.Error as error:
        raise HTTPException(status_code=503, detail="Unable to reach the database.") from error