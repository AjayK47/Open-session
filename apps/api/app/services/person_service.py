"""The choke point for linking a User to their Person identity within an org.

Person is now organization-scoped (CRM-01 isolation): the same human can have
a distinct Person row in each organization they touch. resolve_for_user is
the one place that gets-or-creates that row and keeps User.person_id pointed
at it, so every direct repos.people.upsert_by_email(...) call that used to
double as "link my own identity" goes through here instead.
"""

from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.program import Person
from app.repositories import Repositories


def resolve_for_user(db: Session, repos: Repositories, user: User, organization_id: str) -> Person:
    person = repos.people.upsert_by_email(organization_id, user.email, {})
    user.person_id = person.id
    return person
