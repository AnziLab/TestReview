"""Generate a .env file with random secrets. Used by install/start scripts."""
import secrets
import sys
from pathlib import Path

from cryptography.fernet import Fernet

target = Path(sys.argv[1] if len(sys.argv) > 1 else ".env")
if target.exists():
    sys.exit(0)

content = (
    "DATABASE_URL=sqlite+aiosqlite:///./grading.db\n"
    f"SECRET_KEY={secrets.token_hex(32)}\n"
    f"ENCRYPTION_KEY={Fernet.generate_key().decode()}\n"
    "STORAGE_PATH=./storage\n"
    'ALLOWED_ORIGINS=["http://localhost:3000"]\n'
    "ACCESS_TOKEN_EXPIRE_MINUTES=120\n"
    "REFRESH_TOKEN_EXPIRE_DAYS=14\n"
)
target.write_text(content, encoding="utf-8")
print(f"created {target}")
