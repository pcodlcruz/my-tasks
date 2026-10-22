from pydantic import BaseModel

from mytasks_api.domain.account import Role


class MeOut(BaseModel):
    uid: str
    email: str
    role: Role
