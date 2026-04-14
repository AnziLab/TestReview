"""CLI commands for backend management.

Usage:
    python -m app.cli create-admin --username admin --email admin@example.com --password secret
"""
import argparse
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import User
from app.security import hash_password


async def _create_admin(username: str, email: str, password: str, full_name: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where((User.username == username) | (User.email == email))
        )
        if result.scalar_one_or_none():
            print(f"User '{username}' or email '{email}' already exists.")
            return

        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role="admin",
            status="approved",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"Admin user '{username}' created with id={user.id}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Grading system CLI")
    subparsers = parser.add_subparsers(dest="command")

    create_parser = subparsers.add_parser("create-admin", help="Create an admin user")
    create_parser.add_argument("--username", required=True)
    create_parser.add_argument("--email", required=True)
    create_parser.add_argument("--password", required=True)
    create_parser.add_argument("--full-name", default="Administrator")

    args = parser.parse_args()

    if args.command == "create-admin":
        asyncio.run(_create_admin(args.username, args.email, args.password, args.full_name))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
