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

    with op.batch_alter_table("render_tasks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("retry_of_task_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_render_tasks_retry_of_task_id",
            "render_tasks",
            ["retry_of_task_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_render_tasks_retry_of_task_id", ["retry_of_task_id"], unique=False
        )

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("subject_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=128), nullable=True),
        sa.Column("success", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["subject_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_action", "audit_events", ["action"])
    op.create_index(
        "ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"]
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index(
        "ix_audit_events_subject_user_id", "audit_events", ["subject_user_id"]
    )


def downgrade() -> None:
    """移除管理员控制台用户字段。"""
    op.drop_index("ix_audit_events_subject_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_action", table_name="audit_events")
    op.drop_table("audit_events")

    with op.batch_alter_table("render_tasks", schema=None) as batch_op:
        batch_op.drop_index("ix_render_tasks_retry_of_task_id")
        batch_op.drop_constraint(
            "fk_render_tasks_retry_of_task_id", type_="foreignkey"
        )
        batch_op.drop_column("retry_of_task_id")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_is_active")
        batch_op.drop_index("ix_users_is_admin")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("is_active")
        batch_op.drop_column("is_admin")
