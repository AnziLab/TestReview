from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    school: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    school: Optional[str] = None
    role: str
    status: str
    has_api_key: bool = False
    grading_extra_instructions: Optional[str] = None
    clustering_extra_instructions: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
