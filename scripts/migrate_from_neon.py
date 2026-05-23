"""
One-shot migration: copy users + songs from the v1 Neon Postgres database
into the Fly Postgres database the Django app now uses.

Run via:
    SOURCE_DATABASE_URL=<neon-connection-string> \
    DATABASE_URL=postgres://argyletheory:<pw>@localhost:5433/argyletheory?sslmode=disable \
    python scripts/migrate_from_neon.py

Assumes a running `fly proxy 5433:5432 -a argyletheory-db` so DATABASE_URL
points at the Fly Postgres cluster.

Behavior:
* Truncates `users` and `songs` (this is a one-shot full reset of the prod DB).
* Inserts users with their original ids, prepending `bcrypt$` to the password
  hash so Django's BCryptPasswordHasher recognizes it.
* Promotes `nolanlove@yahoo.com` to is_staff/is_superuser so the admin works.
* Inserts songs with their original ids and FK user_ids preserved.
* Resets the SERIAL sequences so future inserts don't collide.
"""

from __future__ import annotations

import os
import sys

import psycopg2
import psycopg2.extras


SUPERUSER_EMAIL = "nolanlove@yahoo.com"


def env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        sys.exit(f"Missing required env var: {name}")
    return val


def main() -> None:
    src_url = env("SOURCE_DATABASE_URL")
    dst_url = env("DATABASE_URL")

    src = psycopg2.connect(src_url)
    src.set_session(readonly=True)
    dst = psycopg2.connect(dst_url)

    try:
        with src.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as scur:
            scur.execute(
                "SELECT id, email, password, name, created_at, updated_at "
                "FROM users ORDER BY id"
            )
            users = scur.fetchall()
            scur.execute(
                "SELECT id, user_id, title, sequence, key_info, bpm, notes, "
                "is_public, created_at, updated_at FROM songs ORDER BY id"
            )
            songs = scur.fetchall()

        print(f"Source: {len(users)} users, {len(songs)} songs")

        with dst, dst.cursor() as dcur:
            dcur.execute("TRUNCATE songs RESTART IDENTITY CASCADE")
            dcur.execute("TRUNCATE users RESTART IDENTITY CASCADE")

            for u in users:
                is_super = u["email"].lower() == SUPERUSER_EMAIL
                hashed = u["password"]
                # v1 stores raw bcrypt ($2a$12$...). Django needs the algorithm
                # prefix so the BCryptPasswordHasher gets dispatched.
                if hashed.startswith("$2"):
                    hashed = f"bcrypt${hashed}"

                dcur.execute(
                    """
                    INSERT INTO users (
                        id, password, last_login, is_superuser,
                        first_name, last_name, is_staff, is_active, date_joined,
                        email, name, created_at, updated_at
                    ) VALUES (%s, %s, NULL, %s, '', '', %s, TRUE, %s, %s, %s, %s, %s)
                    """,
                    (
                        u["id"],
                        hashed,
                        is_super,
                        is_super,
                        u["created_at"],
                        u["email"],
                        u["name"],
                        u["created_at"],
                        u["updated_at"],
                    ),
                )

            for s in songs:
                dcur.execute(
                    """
                    INSERT INTO songs (
                        id, user_id, title, sequence, key_info, bpm, notes,
                        is_public, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        s["id"],
                        s["user_id"],
                        s["title"],
                        s["sequence"],
                        s["key_info"],
                        s["bpm"],
                        s["notes"],
                        s["is_public"],
                        s["created_at"],
                        s["updated_at"],
                    ),
                )

            # Realign sequences with the max imported id.
            dcur.execute(
                "SELECT setval(pg_get_serial_sequence('users','id'), "
                "COALESCE((SELECT MAX(id) FROM users), 1), TRUE)"
            )
            dcur.execute(
                "SELECT setval(pg_get_serial_sequence('songs','id'), "
                "COALESCE((SELECT MAX(id) FROM songs), 1), TRUE)"
            )

            dcur.execute("SELECT COUNT(*) FROM users")
            (user_count,) = dcur.fetchone()
            dcur.execute("SELECT COUNT(*) FROM songs")
            (song_count,) = dcur.fetchone()

        print(f"Destination: {user_count} users, {song_count} songs")
        print(f"Promoted superuser: {SUPERUSER_EMAIL}")
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    main()
