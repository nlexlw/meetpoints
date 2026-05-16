from database import Base, SessionLocal, engine
import crud
import schemas


def seed():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        event = crud.create_event(
            db,
            schemas.EventCreate(
                title="Hackathon Minsk 2026",
                description="Networking for hackathon participants",
                location="Minsk",
                organizer_name="MeetPoint Team",
                tags=["startup", "ai", "design", "backend"],
            ),
        )

        alex = crud.create_participant(
            db,
            event.id,
            schemas.ParticipantCreate(
                name="Alex",
                bio="Frontend designer looking for backend teammates",
                role="Designer",
                company="Student",
                tags=["design", "startup", "frontend"],
                telegram="@alex",
                email="alex@example.com",
                linkedin="https://linkedin.com/in/alex",
            ),
        )

        maria = crud.create_participant(
            db,
            event.id,
            schemas.ParticipantCreate(
                name="Maria",
                bio="Backend developer interested in AI",
                role="Backend Developer",
                company="Student",
                tags=["backend", "ai", "startup"],
                telegram="@maria",
                email="maria@example.com",
                linkedin="https://linkedin.com/in/maria",
            ),
        )

        dima = crud.create_participant(
            db,
            event.id,
            schemas.ParticipantCreate(
                name="Dima",
                bio="Product manager interested in fintech and startups",
                role="Product Manager",
                company="Student",
                tags=["product", "fintech", "startup"],
                telegram="@dima",
                email="dima@example.com",
                linkedin="https://linkedin.com/in/dima",
            ),
        )

        meet_request = crud.send_request(
            db,
            schemas.MeetRequestCreate(
                event_id=event.id,
                from_participant_id=alex.id,
                to_participant_id=maria.id,
            ),
        )

        crud.accept_request(db, meet_request.id)

        print("Demo data created successfully!")
        print(f"Event ID: {event.id}")
        print(f"Alex ID: {alex.id}")
        print(f"Maria ID: {maria.id}")
        print(f"Dima ID: {dima.id}")

    finally:
        db.close()


if __name__ == "__main__":
    seed()