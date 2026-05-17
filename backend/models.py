from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    location = Column(String(160), nullable=True)
    organizer_name = Column(String(120), nullable=True)
    admin_token = Column(String(120), nullable=True, index=True)

    # SQLite не хранит list[str] напрямую, поэтому теги храним JSON-строкой.
    tags = Column(Text, nullable=False, default="[]")

    is_registration_open = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    participants = relationship(
        "Participant",
        back_populates="event",
        cascade="all, delete-orphan",
    )

    requests = relationship(
        "MeetRequest",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class Participant(Base):
    __tablename__ = "participants"

    id = Column(Integer, primary_key=True, index=True)

    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)

    name = Column(String(120), nullable=False)
    bio = Column(Text, nullable=True)
    role = Column(String(120), nullable=True)
    company = Column(String(120), nullable=True)

    tags = Column(Text, nullable=False, default="[]")

    # Контакты нельзя показывать в общем списке участников.
    telegram = Column(String(120), nullable=True)
    email = Column(String(160), nullable=True)
    linkedin = Column(String(220), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    event = relationship(
        "Event",
        back_populates="participants",
    )

    sent_requests = relationship(
        "MeetRequest",
        foreign_keys="MeetRequest.from_participant_id",
        back_populates="from_participant",
        cascade="all, delete-orphan",
    )

    received_requests = relationship(
        "MeetRequest",
        foreign_keys="MeetRequest.to_participant_id",
        back_populates="to_participant",
        cascade="all, delete-orphan",
    )


class MeetRequest(Base):
    __tablename__ = "meet_requests"

    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "from_participant_id",
            "to_participant_id",
            name="uq_meet_request_pair",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)

    from_participant_id = Column(Integer, ForeignKey("participants.id"), nullable=False)
    to_participant_id = Column(Integer, ForeignKey("participants.id"), nullable=False)

    # pending / accepted / skipped
    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    event = relationship(
        "Event",
        back_populates="requests",
    )

    from_participant = relationship(
        "Participant",
        foreign_keys=[from_participant_id],
        back_populates="sent_requests",
    )

    to_participant = relationship(
        "Participant",
        foreign_keys=[to_participant_id],
        back_populates="received_requests",
    )
    
    
class EventFeedback(Base):
    __tablename__ = "event_feedback"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    participant_id = Column(Integer, ForeignKey("participants.id"), nullable=False)

    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    event = relationship("Event")
    participant = relationship("Participant")