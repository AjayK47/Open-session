"""Initialize or upgrade the D1 schema used by the Cloudflare deployment."""

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import app.models  # noqa: F401
from app.core.config import settings
from app.core.db import Base


def migrate(database_url: str, alembic_ini: str = "alembic.ini") -> str:
    """Create a fresh current schema, or migrate an already stamped database.

    The historical migration chain predates D1 and contains SQLite batch-table
    operations. A brand-new Cloudflare deployment does not need to replay that
    history: create the current metadata and stamp it at the current head. Once
    stamped, subsequent releases follow the normal Alembic upgrade path.
    """
    engine = create_engine(database_url)
    config = Config(alembic_ini)
    head = ScriptDirectory.from_config(config).get_current_head()
    if head is None:
        raise RuntimeError("Alembic has no current head revision")

    if inspect(engine).has_table("alembic_version"):
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
        command.upgrade(config, "head")
        return "upgraded"

    Base.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.execute(
            text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)")
        )
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
            {"revision": head},
        )
        connection.commit()
    return "initialized"


def main() -> None:
    if not settings.database_url.startswith("cloudflare_d1://"):
        raise RuntimeError("cloudflare_migrate requires a cloudflare_d1:// database URL")
    result = migrate(settings.database_url)
    print(f"D1 schema {result} successfully")


if __name__ == "__main__":
    main()
