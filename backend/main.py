import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, SessionLocal, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


tags_metadata = [
    {
        "name": "Health",
        "description": "Проверка, что backend работает.",
    },
    {
        "name": "Events",
        "description": "Создание мероприятия, получение ссылки/QR и статистики.",
    },
    {
        "name": "Participants",
        "description": "Регистрация участников, список людей и рекомендации.",
    },
    {
        "name": "Requests",
        "description": "Запросы на знакомство: отправить, принять или пропустить.",
    },
    {
        "name": "Contacts",
        "description": "Контакты, которые открываются только после принятого запроса.",
    },
    {
        "name": "Feedback",
        "description": "Отзывы участников после мероприятия.",
    },
]


app = FastAPI(
    title="Meetings API",
    description="""
Meetings — MVP-сервис для нетворкинга на мероприятиях.

Основной сценарий:
1. Организатор создаёт мероприятие.
2. Получает ссылку/QR для участников.
3. Участники регистрируются.
4. Видят других людей и рекомендации по тегам.
5. Отправляют запросы на знакомство.
6. После принятия запроса контакты становятся доступны.

Контакты скрыты до взаимного интереса.
""",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=tags_metadata,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


@app.get(
    "/",
    tags=["Health"],
    summary="Главная страница API",
)
def root():
    return {
        "message": "Meetings API is running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get(
    "/health",
    tags=["Health"],
    summary="Проверить состояние backend",
)
def health():
    return {
        "status": "ok",
    }


@app.post(
    "/events",
    response_model=schemas.EventAdminRead,
    status_code=201,
    tags=["Events"],
    summary="Создать мероприятие",
    description="Создаёт мероприятие для нетворкинга. Только этот ответ возвращает admin_token организатора.",
)
def create_event(
    event_data: schemas.EventCreate,
    db: Session = Depends(get_db),
):
    return crud.create_event(db, event_data)


@app.get(
    "/events/{event_id}",
    response_model=schemas.EventRead,
    tags=["Events"],
    summary="Получить мероприятие по ID",
)
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
):
    event = crud.get_event_or_404(db, event_id)
    return crud.event_to_read(event)


@app.patch(
    "/events/{event_id}/close",
    response_model=schemas.EventRead,
    tags=["Events"],
    summary="Закрыть регистрацию на мероприятие",
    description="Закрыть регистрацию может только организатор с X-Admin-Token.",
)
def close_event_registration(
    event_id: int,
    x_admin_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not x_admin_token:
        raise HTTPException(
            status_code=403,
            detail="Admin token is required",
        )

    try:
        event = crud.close_event_registration(db, event_id, x_admin_token)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error))

    return crud.event_to_read(event)


@app.get(
    "/events/{event_id}/share",
    response_model=schemas.EventShare,
    tags=["Events"],
    summary="Получить ссылку и QR-payload для участников",
    description="Возвращает ссылку, которую можно использовать для QR-кода.",
)
def get_event_share_link(
    event_id: int,
    db: Session = Depends(get_db),
):
    crud.get_event_or_404(db, event_id)

    frontend_base_url = os.getenv(
        "FRONTEND_BASE_URL",
        "http://localhost:5173",
    ).rstrip("/")

    join_url = f"{frontend_base_url}/events/{event_id}/join"

    return schemas.EventShare(
        event_id=event_id,
        join_url=join_url,
        qr_payload=join_url,
    )


@app.get(
    "/events/{event_id}/stats",
    response_model=schemas.EventStats,
    tags=["Events"],
    summary="Получить статистику мероприятия",
    description="Показывает количество участников, запросов и состоявшихся знакомств.",
)
def get_event_stats(
    event_id: int,
    db: Session = Depends(get_db),
):
    return crud.get_event_stats(db, event_id)


@app.post(
    "/events/{event_id}/participants",
    response_model=schemas.ParticipantRead,
    status_code=201,
    tags=["Participants"],
    summary="Зарегистрировать участника на мероприятие",
    description="Участник заполняет мини-профиль. Контакты сохраняются, но не показываются другим участникам до принятого запроса.",
)
def join_event(
    event_id: int,
    participant_data: schemas.ParticipantCreate,
    db: Session = Depends(get_db),
):
    return crud.create_participant(db, event_id, participant_data)


@app.get(
    "/events/{event_id}/participants",
    response_model=list[schemas.ParticipantRead],
    tags=["Participants"],
    summary="Получить список участников мероприятия",
    description="Возвращает участников без приватных контактов: telegram, email и linkedin не показываются.",
)
def get_event_participants(
    event_id: int,
    tag: Annotated[str | None, Query(description="Фильтр участников по тегу")] = None,
    db: Session = Depends(get_db),
):
    return crud.get_event_participants(db, event_id, tag)


@app.get(
    "/events/{event_id}/participants/{participant_id}/recommendations",
    response_model=list[schemas.Recommendation],
    tags=["Participants"],
    summary="Получить рекомендации по общим тегам",
    description="Показывает участников с общими интересами. Чем больше общих тегов, тем выше человек в списке.",
)
def get_recommendations(
    event_id: int,
    participant_id: int,
    db: Session = Depends(get_db),
):
    return crud.get_recommendations(db, event_id, participant_id)


@app.post(
    "/requests",
    response_model=schemas.MeetRequestRead,
    status_code=201,
    tags=["Requests"],
    summary="Отправить запрос на знакомство",
    description="Нельзя отправить запрос самому себе. Нельзя отправить одинаковый запрос дважды.",
)
def send_meet_request(
    request_data: schemas.MeetRequestCreate,
    db: Session = Depends(get_db),
):
    return crud.send_request(db, request_data)


@app.patch(
    "/requests/{request_id}/accept",
    response_model=schemas.MeetRequestRead,
    tags=["Requests"],
    summary="Принять запрос на знакомство",
    description="После принятия запроса контакты становятся доступны обоим участникам.",
)
def accept_meet_request(
    request_id: int,
    db: Session = Depends(get_db),
):
    return crud.accept_request(db, request_id)


@app.patch(
    "/requests/{request_id}/skip",
    response_model=schemas.MeetRequestRead,
    tags=["Requests"],
    summary="Пропустить запрос на знакомство",
    description="Если запрос пропущен, контакты участников не раскрываются.",
)
def skip_meet_request(
    request_id: int,
    db: Session = Depends(get_db),
):
    return crud.skip_request(db, request_id)


@app.get(
    "/participants/{participant_id}/incoming-requests",
    response_model=list[schemas.IncomingRequestRead],
    tags=["Requests"],
    summary="Получить входящие запросы участника",
    description="Показывает pending-запросы, которые другие участники отправили этому участнику.",
)
def get_incoming_requests(
    participant_id: int,
    db: Session = Depends(get_db),
):
    return crud.get_incoming_requests(db, participant_id)


@app.get(
    "/participants/{participant_id}/contacts",
    response_model=list[schemas.ParticipantContact],
    tags=["Contacts"],
    summary="Получить открытые контакты участника",
    description="Возвращает контакты только тех участников, с которыми есть accepted-запрос.",
)
def get_contacts(
    participant_id: int,
    db: Session = Depends(get_db),
):
    return crud.get_contacts(db, participant_id)


@app.post(
    "/events/{event_id}/feedback",
    response_model=schemas.EventFeedbackOut,
    tags=["Feedback"],
    summary="Оставить отзыв о мероприятии",
)
def create_feedback(
    event_id: int,
    feedback: schemas.EventFeedbackCreate,
    db: Session = Depends(get_db),
):
    try:
        db_feedback = crud.create_event_feedback(db, event_id, feedback)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))

    participant = (
        db.query(models.Participant)
        .filter(models.Participant.id == db_feedback.participant_id)
        .first()
    )

    return {
        "id": db_feedback.id,
        "event_id": db_feedback.event_id,
        "participant_id": db_feedback.participant_id,
        "participant_name": participant.name if participant else "Участник",
        "rating": db_feedback.rating,
        "text": db_feedback.text,
        "created_at": db_feedback.created_at,
    }


@app.get(
    "/events/{event_id}/feedback",
    response_model=list[schemas.EventFeedbackOut],
    tags=["Feedback"],
    summary="Получить отзывы мероприятия",
)
def get_feedback(event_id: int, db: Session = Depends(get_db)):
    feedbacks = crud.get_event_feedback(db, event_id)

    result = []

    for feedback in feedbacks:
        participant = (
            db.query(models.Participant)
            .filter(models.Participant.id == feedback.participant_id)
            .first()
        )

        result.append(
            {
                "id": feedback.id,
                "event_id": feedback.event_id,
                "participant_id": feedback.participant_id,
                "participant_name": participant.name if participant else "Участник",
                "rating": feedback.rating,
                "text": feedback.text,
                "created_at": feedback.created_at,
            }
        )

    return result
