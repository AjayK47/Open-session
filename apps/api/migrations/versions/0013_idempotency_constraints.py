"""Add database constraints for evaluator-critical idempotency.

Revision ID: 0013_idempotency_constraints
Revises: 0012_file_request_assignments
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_idempotency_constraints"
down_revision = "0012_file_request_assignments"
branch_labels = None
depends_on = None


def _unique_names(table: str) -> set[str]:
    return {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_unique_constraints(table)
        if constraint.get("name")
    }


def upgrade() -> None:
    if "uq_review_assignment_plan_submission_reviewer" not in _unique_names("review_assignments"):
        with op.batch_alter_table("review_assignments") as batch:
            batch.create_unique_constraint(
                "uq_review_assignment_plan_submission_reviewer",
                ["evaluation_plan_id", "submission_id", "reviewer_person_id"],
            )
    if "uq_sessions_source_submission" not in _unique_names("sessions"):
        with op.batch_alter_table("sessions") as batch:
            batch.create_unique_constraint("uq_sessions_source_submission", ["source_submission_id"])


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch:
        batch.drop_constraint("uq_sessions_source_submission", type_="unique")
    with op.batch_alter_table("review_assignments") as batch:
        batch.drop_constraint("uq_review_assignment_plan_submission_reviewer", type_="unique")
