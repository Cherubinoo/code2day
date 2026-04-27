"""
db_manager.py — DDL utilities for multi-tenant institution databases.

PostgreSQL forbids CREATE DATABASE / DROP DATABASE inside a transaction block.
Django views run inside an implicit transaction (Django's ORM opens one on the
first query).  Setting cursor.connection.autocommit = True *after* a query has
already started a transaction raises:

    ProgrammingError: set_session cannot be used inside a transaction

The cleanest fix is to open a *fresh, independent* psycopg2 connection with
autocommit=True.  That connection never enters a transaction and can execute
any DDL statement freely, without interfering with Django's own connection.
"""

import psycopg2
from django.conf import settings


def _get_raw_connection(autocommit: bool = True):
    """
    Open a brand-new psycopg2 connection using the same credentials as
    Django's default database, but completely outside Django's ORM.
    """
    db = settings.DATABASES['default']
    conn = psycopg2.connect(
        dbname=db.get('NAME', 'postgres'),
        user=db.get('USER', 'postgres'),
        password=db.get('PASSWORD', ''),
        host=db.get('HOST', 'localhost'),
        port=db.get('PORT', '5432'),
    )
    conn.autocommit = autocommit
    return conn


def create_institution_db(db_name: str):
    """
    Create a new PostgreSQL database for an institution, then migrate it.

    Uses a standalone connection so the DDL is not blocked by Django's
    implicit transaction on the request's connection.
    """
    conn = _get_raw_connection(autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (db_name,)
            )
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{db_name}"')
    finally:
        conn.close()

    # Register the new DB in Django's DATABASES so we can migrate it
    new_db_settings = settings.DATABASES['default'].copy()
    new_db_settings['NAME'] = db_name
    settings.DATABASES[db_name] = new_db_settings

    from django.core.management import call_command
    call_command('migrate', database=db_name, interactive=False)


def delete_institution_db(db_name: str):
    """
    Drop the PostgreSQL database for an institution.

    Terminates any active connections to the target DB first (required by
    PostgreSQL before DROP DATABASE can succeed).

    Uses a standalone connection so the DDL is not blocked by Django's
    implicit transaction on the request's connection.
    """
    if not db_name:
        return

    conn = _get_raw_connection(autocommit=True)
    try:
        with conn.cursor() as cur:
            # Kick out any other sessions connected to the target DB
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                """,
                (db_name,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
    finally:
        conn.close()
