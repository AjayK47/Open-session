from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RequestCodeRequest(BaseModel):
    email: EmailStr


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str
    # Optional, and only used the first time: a speaker signing up has a name to
    # give, but a returning one should never have their profile overwritten by
    # whatever is typed at a login box.
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)


class AuthUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    person_id: str | None


class RequestCodeResponse(BaseModel):
    message: str
    dev_code: str | None = None


EvaluationPersona = Literal["organizer", "speaker", "reviewer"]


class EvaluationPersonaRead(BaseModel):
    persona: EvaluationPersona
    label: str
    email: EmailStr
    start_path: str


class EvaluationLoginRequest(BaseModel):
    persona: EvaluationPersona
