"""管理员控制台数据基础

Revision ID: a7c3e1f902b4
Revises: oauth_states
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e1f902b4"
down_revision: str | None = "oauth_states"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """增加账号状态、管理员标记与最近登录时间。"""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_admin", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch_op.add_column(
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            )
        )
        batch_op.add_column(
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index("ix_users_is_admin", ["is_admin"], unique=False)
        batch_op.create_index("ix_users_is_active", ["is_active"], unique=False)


def downgrade() -> None:
    """移除管理员控制台用户字段。"""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_is_active")
        batch_op.drop_index("ix_users_is_admin")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("is_active")
        batch_op.drop_column("is_admin")
