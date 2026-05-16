import json
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas


def serialize_tags(tags: list[str] | None) -> str:
    if not tags:
        return "[]"

    cleaned = []
    seen = set()

    for tag in tags:
        value = tag.strip().lower()
        if value and value not in seen:
            cleaned.append(value)
            seen.add(value)

    return json.dumps(cleaned, ensure_ascii=False)


def deserialize_tags(raw_tags: str | None) -> list[str]:
    if not raw_tags:
        return []

    try:
        data = json.loads(raw_tags)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    return [str(tag) for tag in data]


def get_event(db: Session, event_id: int) -> models.Event | None:
    return db.query(models.Event).filter(models.Event.id == event_id).first()


def get_event_or_404(db: Session, event_id: int) -> models.Event:
    event = get_event(db, event_id)

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    return event


def get_participant(db: Session, participant_id: int) -> models.Participant | None:
    return (
        db.query(models.Participant)
        .filter(models.Participant.id == participant_id)
        .first()
    )


def get_participant_or_404(db: Session, participant_id: int) -> models.Participant:
    participant = get_participant(db, participant_id)

    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found",
        )

    return participant


def event_to_read(event: models.Event) -> schemas.EventRead:
    return schemas.EventRead(
        id=event.id,
        title=event.title,
        description=event.description,
        location=event.location,
        organizer_name=event.organizer_name,
        tags=deserialize_tags(event.tags),
        is_registration_open=event.is_registration_open,
        created_at=event.created_at,
    )


def participant_to_public(participant: models.Participant) -> schemas.ParticipantRead:
    return schemas.ParticipantRead(
        id=participant.id,
        event_id=participant.event_id,
        name=participant.name,
        bio=participant.bio,
        role=participant.role,
        company=participant.company,
        tags=deserialize_tags(participant.tags),
        created_at=participant.created_at,
    )


def participant_to_contact(participant: models.Participant) -> schemas.ParticipantContact:
    return schemas.ParticipantContact(
        id=participant.id,
        event_id=participant.event_id,
        name=participant.name,
        bio=participant.bio,
        role=participant.role,
        company=participant.company,
        tags=deserialize_tags(participant.tags),
        created_at=participant.created_at,
        telegram=participant.telegram,
        email=participant.email,
        linkedin=participant.linkedin,
    )


def request_to_read(request: models.MeetRequest) -> schemas.MeetRequestRead:
    return schemas.MeetRequestRead(
        id=request.id,
        event_id=request.event_id,
        from_participant_id=request.from_participant_id,
        to_participant_id=request.to_participant_id,
        status=request.status,
        created_at=request.created_at,
    )


def create_event(db: Session, event_data: schemas.EventCreate) -> schemas.EventRead:
    event = models.Event(
        title=event_data.title,
        description=event_data.description,
        location=event_data.location,
        organizer_name=event_data.organizer_name,
        tags=serialize_tags(event_data.tags),
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return event_to_read(event)


def close_event_registration(db: Session, event_id: int) -> schemas.EventRead:
    event = get_event_or_404(db, event_id)

    event.is_registration_open = False

    db.commit()
    db.refresh(event)

    return event_to_read(event)


def create_participant(
    db: Session,
    event_id: int,
    participant_data: schemas.ParticipantCreate,
) -> schemas.ParticipantRead:
    event = get_event_or_404(db, event_id)

    if not event.is_registration_open:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is closed",
        )

    participant = models.Participant(
        event_id=event.id,
        name=participant_data.name,
        bio=participant_data.bio,
        role=participant_data.role,
        company=participant_data.company,
        tags=serialize_tags(participant_data.tags),
        telegram=participant_data.telegram,
        email=participant_data.email,
        linkedin=participant_data.linkedin,
    )

    db.add(participant)
    db.commit()
    db.refresh(participant)

    return participant_to_public(participant)


def get_event_participants(
    db: Session,
    event_id: int,
    tag: str | None = None,
) -> list[schemas.ParticipantRead]:
    get_event_or_404(db, event_id)

    participants = (
        db.query(models.Participant)
        .filter(models.Participant.event_id == event_id)
        .order_by(models.Participant.created_at.asc())
        .all()
    )

    if tag:
        normalized_tag = tag.strip().lower()
        participants = [
            participant
            for participant in participants
            if normalized_tag in deserialize_tags(participant.tags)
        ]

    return [participant_to_public(participant) for participant in participants]


def get_recommendations(
    db: Session,
    event_id: int,
    participant_id: int,
) -> list[schemas.Recommendation]:
    get_event_or_404(db, event_id)
    current_participant = get_participant_or_404(db, participant_id)

    if current_participant.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant does not belong to this event",
        )

    current_tags = set(deserialize_tags(current_participant.tags))

    participants = (
        db.query(models.Participant)
        .filter(
            models.Participant.event_id == event_id,
            models.Participant.id != participant_id,
        )
        .all()
    )

    recommendations: list[schemas.Recommendation] = []

    for participant in participants:
        participant_tags = set(deserialize_tags(participant.tags))
        shared_tags = sorted(current_tags.intersection(participant_tags))

        recommendations.append(
            schemas.Recommendation(
                id=participant.id,
                name=participant.name,
                bio=participant.bio,
                role=participant.role,
                company=participant.company,
                tags=sorted(participant_tags),
                shared_tags=shared_tags,
                match_score=len(shared_tags),
            )
        )

    recommendations.sort(
        key=lambda item: (-item.match_score, item.name.lower())
    )

    return recommendations


def send_request(
    db: Session,
    request_data: schemas.MeetRequestCreate,
) -> schemas.MeetRequestRead:
    event = get_event_or_404(db, request_data.event_id)

    if request_data.from_participant_id == request_data.to_participant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant cannot send request to themselves",
        )

    from_participant = get_participant_or_404(db, request_data.from_participant_id)
    to_participant = get_participant_or_404(db, request_data.to_participant_id)

    if from_participant.event_id != event.id or to_participant.event_id != event.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both participants must belong to this event",
        )

    duplicate = (
        db.query(models.MeetRequest)
        .filter(
            models.MeetRequest.event_id == request_data.event_id,
            models.MeetRequest.from_participant_id == request_data.from_participant_id,
            models.MeetRequest.to_participant_id == request_data.to_participant_id,
        )
        .first()
    )

    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate request",
        )

    meet_request = models.MeetRequest(
        event_id=request_data.event_id,
        from_participant_id=request_data.from_participant_id,
        to_participant_id=request_data.to_participant_id,
        status="pending",
    )

    db.add(meet_request)
    db.commit()
    db.refresh(meet_request)

    return request_to_read(meet_request)


def get_request_or_404(db: Session, request_id: int) -> models.MeetRequest:
    meet_request = (
        db.query(models.MeetRequest)
        .filter(models.MeetRequest.id == request_id)
        .first()
    )

    if meet_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    return meet_request


def accept_request(db: Session, request_id: int) -> schemas.MeetRequestRead:
    meet_request = get_request_or_404(db, request_id)

    meet_request.status = "accepted"

    db.commit()
    db.refresh(meet_request)

    return request_to_read(meet_request)


def skip_request(db: Session, request_id: int) -> schemas.MeetRequestRead:
    meet_request = get_request_or_404(db, request_id)

    meet_request.status = "skipped"

    db.commit()
    db.refresh(meet_request)

    return request_to_read(meet_request)


def get_incoming_requests(
    db: Session,
    participant_id: int,
) -> list[schemas.IncomingRequestRead]:
    get_participant_or_404(db, participant_id)

    requests = (
        db.query(models.MeetRequest)
        .filter(
            models.MeetRequest.to_participant_id == participant_id,
            models.MeetRequest.status == "pending",
        )
        .order_by(models.MeetRequest.created_at.asc())
        .all()
    )

    result: list[schemas.IncomingRequestRead] = []

    for request in requests:
        result.append(
            schemas.IncomingRequestRead(
                id=request.id,
                event_id=request.event_id,
                from_participant=participant_to_public(request.from_participant),
                status=request.status,
                created_at=request.created_at,
            )
        )

    return result


def get_contacts(
    db: Session,
    participant_id: int,
) -> list[schemas.ParticipantContact]:
    get_participant_or_404(db, participant_id)

    accepted_requests = (
        db.query(models.MeetRequest)
        .filter(
            models.MeetRequest.status == "accepted",
            (
                (models.MeetRequest.from_participant_id == participant_id)
                | (models.MeetRequest.to_participant_id == participant_id)
            ),
        )
        .all()
    )

    contact_ids = set()

    for request in accepted_requests:
        if request.from_participant_id == participant_id:
            contact_ids.add(request.to_participant_id)
        else:
            contact_ids.add(request.from_participant_id)

    contacts = (
        db.query(models.Participant)
        .filter(models.Participant.id.in_(contact_ids))
        .order_by(models.Participant.name.asc())
        .all()
        if contact_ids
        else []
    )

    return [participant_to_contact(participant) for participant in contacts]


def get_event_stats(db: Session, event_id: int) -> schemas.EventStats:
    event = get_event_or_404(db, event_id)

    participants_count = (
        db.query(func.count(models.Participant.id))
        .filter(models.Participant.event_id == event_id)
        .scalar()
        or 0
    )

    requests_count = (
        db.query(func.count(models.MeetRequest.id))
        .filter(models.MeetRequest.event_id == event_id)
        .scalar()
        or 0
    )

    pending_requests_count = (
        db.query(func.count(models.MeetRequest.id))
        .filter(
            models.MeetRequest.event_id == event_id,
            models.MeetRequest.status == "pending",
        )
        .scalar()
        or 0
    )

    accepted_requests_count = (
        db.query(func.count(models.MeetRequest.id))
        .filter(
            models.MeetRequest.event_id == event_id,
            models.MeetRequest.status == "accepted",
        )
        .scalar()
        or 0
    )

    skipped_requests_count = (
        db.query(func.count(models.MeetRequest.id))
        .filter(
            models.MeetRequest.event_id == event_id,
            models.MeetRequest.status == "skipped",
        )
        .scalar()
        or 0
    )

    return schemas.EventStats(
        event_id=event.id,
        participants_count=participants_count,
        requests_count=requests_count,
        pending_requests_count=pending_requests_count,
        accepted_requests_count=accepted_requests_count,
        skipped_requests_count=skipped_requests_count,
        matches_count=accepted_requests_count,
        is_registration_open=event.is_registration_open,
    )