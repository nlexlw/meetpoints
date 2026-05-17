from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = None
    location: str | None = None
    organizer_name: str | None = None
    tags: list[str] = Field(default_factory=list)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Hackathon Minsk 2026",
                "description": "Networking for hackathon participants",
                "location": "Minsk",
                "organizer_name": "MeetPoint Team",
                "tags": ["startup", "ai", "design", "backend"],
            }
        }
    )

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = []
        seen = set()

        for tag in tags:
            value = tag.strip().lower()
            if value and value not in seen:
                cleaned.append(value)
                seen.add(value)

        return cleaned


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None = None
    location: str | None = None
    organizer_name: str | None = None
    tags: list[str]
    is_registration_open: bool
    created_at: datetime

class EventAdminRead(EventRead):
    admin_token: str | None = None
class EventShare(BaseModel):
    event_id: int
    join_url: str
    qr_payload: str


class EventStats(BaseModel):
    event_id: int
    participants_count: int
    requests_count: int
    pending_requests_count: int
    accepted_requests_count: int
    skipped_requests_count: int
    matches_count: int
    is_registration_open: bool


class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    bio: str | None = None
    role: str | None = None
    company: str | None = None
    tags: list[str] = Field(default_factory=list)

    telegram: str | None = None
    email: str | None = None
    linkedin: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Alex",
                "bio": "Frontend designer looking for backend teammates",
                "role": "Designer",
                "company": "Student",
                "tags": ["design", "startup", "frontend"],
                "telegram": "@alex",
                "email": "alex@example.com",
                "linkedin": "https://linkedin.com/in/alex",
            }
        }
    )

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = []
        seen = set()

        for tag in tags:
            value = tag.strip().lower()
            if value and value not in seen:
                cleaned.append(value)
                seen.add(value)

        return cleaned


class ParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int

    name: str
    bio: str | None = None
    role: str | None = None
    company: str | None = None

    tags: list[str]
    created_at: datetime


class ParticipantContact(ParticipantRead):
    telegram: str | None = None
    email: str | None = None
    linkedin: str | None = None


class Recommendation(BaseModel):
    id: int
    name: str
    bio: str | None = None
    role: str | None = None
    company: str | None = None

    tags: list[str]
    shared_tags: list[str]
    match_score: int


class MeetRequestCreate(BaseModel):
    event_id: int
    from_participant_id: int
    to_participant_id: int

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "event_id": 1,
                "from_participant_id": 1,
                "to_participant_id": 2,
            }
        }
    )


class MeetRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    from_participant_id: int
    to_participant_id: int
    status: Literal["pending", "accepted", "skipped"]
    created_at: datetime


class IncomingRequestRead(BaseModel):
    id: int
    event_id: int
    from_participant: ParticipantRead
    status: Literal["pending", "accepted", "skipped"]
    created_at: datetime
class EventFeedbackCreate(BaseModel):
    participant_id: int
    rating: int
    text: str


class EventFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    participant_id: int
    participant_name: str
    rating: int
    text: str
    created_at: datetime