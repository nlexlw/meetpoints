import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";

const emptyEventForm = {
  title: "Hackathon Minsk 2026",
  description: "Networking for hackathon participants",
  location: "Minsk",
  organizer_name: "MeetPoint Team",
  tags: "startup, ai, design, backend",
};

const emptyParticipantForm = {
  name: "Alex",
  bio: "Frontend designer looking for backend teammates",
  role: "Designer",
  company: "Student",
  tags: "design, startup, frontend",
  telegram: "@alex",
  email: "alex@example.com",
  linkedin: "https://linkedin.com/in/alex",
};

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function App() {
  const [backendStatus, setBackendStatus] = useState("checking");

  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [participantForm, setParticipantForm] = useState(emptyParticipantForm);

  const [eventId, setEventId] = useState("");
  const [currentParticipantId, setCurrentParticipantId] = useState("");

  const [event, setEvent] = useState(null);
  const [share, setShare] = useState(null);
  const [stats, setStats] = useState(null);

  const [participants, setParticipants] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [tagFilter, setTagFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentParticipant = useMemo(() => {
    return participants.find(
      (participant) => String(participant.id) === String(currentParticipantId)
    );
  }, [participants, currentParticipantId]);

  useEffect(() => {
    checkBackend();
  }, []);

  async function runAction(action, successMessage = "") {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const result = await action();

      if (successMessage) {
        setMessage(successMessage);
      }

      return result;
    } catch (err) {
      setError(err.message || "Something went wrong");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function checkBackend() {
    await runAction(async () => {
      const result = await api.health();
      setBackendStatus(result.status === "ok" ? "ok" : "error");
    });
  }

  async function createEvent(event) {
    event.preventDefault();

    const created = await runAction(async () => {
      return api.createEvent({
        title: eventForm.title,
        description: eventForm.description,
        location: eventForm.location,
        organizer_name: eventForm.organizer_name,
        tags: parseTags(eventForm.tags),
      });
    }, "Мероприятие создано");

    if (created) {
      setEvent(created);
      setEventId(String(created.id));
      await loadEventData(created.id);
    }
  }

  async function loadEventData(id = eventId) {
    if (!id) {
      setError("Сначала укажи event_id");
      return;
    }

    await runAction(async () => {
      const [eventData, shareData, statsData, participantsData] =
        await Promise.all([
          api.getEvent(id),
          api.getEventShare(id),
          api.getEventStats(id),
          api.getParticipants(id, tagFilter),
        ]);

      setEvent(eventData);
      setShare(shareData);
      setStats(statsData);
      setParticipants(participantsData);
    }, "Данные мероприятия загружены");
  }

  async function closeRegistration() {
    if (!eventId) {
      setError("Сначала укажи event_id");
      return;
    }

    const updated = await runAction(
      () => api.closeEvent(eventId),
      "Регистрация закрыта"
    );

    if (updated) {
      setEvent(updated);
      await loadEventData(eventId);
    }
  }

  async function createParticipant(event) {
    event.preventDefault();

    if (!eventId) {
      setError("Сначала создай или загрузи мероприятие");
      return;
    }

    const created = await runAction(async () => {
      return api.createParticipant(eventId, {
        name: participantForm.name,
        bio: participantForm.bio,
        role: participantForm.role,
        company: participantForm.company,
        tags: parseTags(participantForm.tags),
        telegram: participantForm.telegram,
        email: participantForm.email,
        linkedin: participantForm.linkedin,
      });
    }, "Участник зарегистрирован");

    if (created) {
      setCurrentParticipantId(String(created.id));
      await loadEventData(eventId);
    }
  }

  async function loadRecommendations() {
    if (!eventId || !currentParticipantId) {
      setError("Выбери мероприятие и текущего участника");
      return;
    }

    await runAction(async () => {
      const data = await api.getRecommendations(eventId, currentParticipantId);
      setRecommendations(data);
    }, "Рекомендации загружены");
  }

  async function sendRequest(toParticipantId) {
    if (!eventId || !currentParticipantId) {
      setError("Выбери мероприятие и текущего участника");
      return;
    }

    await runAction(async () => {
      return api.sendRequest({
        event_id: Number(eventId),
        from_participant_id: Number(currentParticipantId),
        to_participant_id: Number(toParticipantId),
      });
    }, "Запрос на знакомство отправлен");

    await loadIncomingRequests();
    await loadEventData(eventId);
  }

  async function loadIncomingRequests() {
    if (!currentParticipantId) {
      setError("Сначала выбери текущего участника");
      return;
    }

    await runAction(async () => {
      const data = await api.getIncomingRequests(currentParticipantId);
      setIncomingRequests(data);
    }, "Входящие запросы загружены");
  }

  async function acceptRequest(requestId) {
    await runAction(
      () => api.acceptRequest(requestId),
      "Запрос принят, контакты открыты"
    );

    await loadIncomingRequests();
    await loadContacts();
    await loadEventData(eventId);
  }

  async function skipRequest(requestId) {
    await runAction(() => api.skipRequest(requestId), "Запрос пропущен");

    await loadIncomingRequests();
    await loadEventData(eventId);
  }

  async function loadContacts() {
    if (!currentParticipantId) {
      setError("Сначала выбери текущего участника");
      return;
    }

    await runAction(async () => {
      const data = await api.getContacts(currentParticipantId);
      setContacts(data);
    }, "Контакты загружены");
  }

  function fillMaria() {
    setParticipantForm({
      name: "Maria",
      bio: "Backend developer interested in AI",
      role: "Backend Developer",
      company: "Student",
      tags: "backend, ai, startup",
      telegram: "@maria",
      email: "maria@example.com",
      linkedin: "https://linkedin.com/in/maria",
    });
  }

  function fillDima() {
    setParticipantForm({
      name: "Dima",
      bio: "Product manager interested in fintech and startups",
      role: "Product Manager",
      company: "Student",
      tags: "product, fintech, startup",
      telegram: "@dima",
      email: "dima@example.com",
      linkedin: "https://linkedin.com/in/dima",
    });
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Hackathon MVP</p>
          <h1>MeetPoint</h1>
          <p>
            Web-сервис для знакомств на мероприятиях: участники заполняют
            профиль, находят людей по тегам и получают контакты только после
            взаимного интереса.
          </p>
        </div>

        <div className="status-card">
          <span className={`status-dot ${backendStatus}`} />
          <div>
            <strong>Backend</strong>
            <p>
              {backendStatus === "ok"
                ? "Подключён"
                : backendStatus === "checking"
                ? "Проверяем..."
                : "Не отвечает"}
            </p>
          </div>
        </div>
      </header>

      {(message || error || loading) && (
        <section className="notice-area">
          {loading && <div className="notice loading">Загрузка...</div>}
          {message && <div className="notice success">{message}</div>}
          {error && <div className="notice error">{error}</div>}
        </section>
      )}

      <main className="grid">
        <section className="card wide">
          <div className="section-header">
            <div>
              <p className="eyebrow">Organizer</p>
              <h2>1. Создать мероприятие</h2>
            </div>
          </div>

          <form className="form" onSubmit={createEvent}>
            <label>
              Название
              <input
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm({ ...eventForm, title: e.target.value })
                }
              />
            </label>

            <label>
              Описание
              <textarea
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm({ ...eventForm, description: e.target.value })
                }
              />
            </label>

            <div className="two-columns">
              <label>
                Локация
                <input
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, location: e.target.value })
                  }
                />
              </label>

              <label>
                Организатор
                <input
                  value={eventForm.organizer_name}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      organizer_name: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label>
              Теги через запятую
              <input
                value={eventForm.tags}
                onChange={(e) =>
                  setEventForm({ ...eventForm, tags: e.target.value })
                }
              />
            </label>

            <button type="submit">Создать мероприятие</button>
          </form>
        </section>

        <section className="card">
          <p className="eyebrow">Current event</p>
          <h2>Мероприятие</h2>

          <label>
            Event ID
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="Например: 1"
            />
          </label>

          <div className="button-row">
            <button type="button" onClick={() => loadEventData(eventId)}>
              Загрузить
            </button>
            <button type="button" className="secondary" onClick={closeRegistration}>
              Закрыть регистрацию
            </button>
          </div>

          {event && (
            <div className="info-box">
              <h3>{event.title}</h3>
              <p>{event.description}</p>
              <div className="tags">
                {event.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <p className="small">
                Регистрация:{" "}
                <strong>{event.is_registration_open ? "открыта" : "закрыта"}</strong>
              </p>
            </div>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">QR / Link</p>
          <h2>Ссылка для участников</h2>

          {share ? (
            <div className="qr-box">
              <QRCodeSVG value={share.qr_payload} size={150} />
              <a href={share.join_url} target="_blank" rel="noreferrer">
                {share.join_url}
              </a>
            </div>
          ) : (
            <p className="muted">Создай или загрузи мероприятие.</p>
          )}
        </section>

        <section className="card wide">
          <div className="section-header">
            <div>
              <p className="eyebrow">Participant</p>
              <h2>2. Зарегистрировать участника</h2>
            </div>

            <div className="button-row">
              <button type="button" className="secondary" onClick={fillMaria}>
                Maria
              </button>
              <button type="button" className="secondary" onClick={fillDima}>
                Dima
              </button>
            </div>
          </div>

          <form className="form" onSubmit={createParticipant}>
            <div className="two-columns">
              <label>
                Имя
                <input
                  value={participantForm.name}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      name: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Роль
                <input
                  value={participantForm.role}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      role: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label>
              Bio
              <textarea
                value={participantForm.bio}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    bio: e.target.value,
                  })
                }
              />
            </label>

            <div className="two-columns">
              <label>
                Company
                <input
                  value={participantForm.company}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      company: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Теги
                <input
                  value={participantForm.tags}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      tags: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="three-columns">
              <label>
                Telegram
                <input
                  value={participantForm.telegram}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      telegram: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Email
                <input
                  value={participantForm.email}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      email: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                LinkedIn
                <input
                  value={participantForm.linkedin}
                  onChange={(e) =>
                    setParticipantForm({
                      ...participantForm,
                      linkedin: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            <button type="submit">Зарегистрировать участника</button>
          </form>
        </section>

        <section className="card wide">
          <div className="section-header">
            <div>
              <p className="eyebrow">Feed</p>
              <h2>3. Лента участников</h2>
            </div>

            <div className="inline-filter">
              <input
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="Фильтр по тегу"
              />
              <button type="button" onClick={() => loadEventData(eventId)}>
                Обновить
              </button>
            </div>
          </div>

          <label>
            Текущий участник
            <select
              value={currentParticipantId}
              onChange={(e) => setCurrentParticipantId(e.target.value)}
            >
              <option value="">Выбрать участника</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  #{participant.id} — {participant.name}
                </option>
              ))}
            </select>
          </label>

          {currentParticipant && (
            <p className="small">
              Сейчас выбран: <strong>{currentParticipant.name}</strong>
            </p>
          )}

          <div className="list">
            {participants.map((participant) => (
              <article key={participant.id} className="person-card">
                <div>
                  <h3>
                    #{participant.id} {participant.name}
                  </h3>
                  <p>{participant.bio}</p>
                  <p className="small">
                    {participant.role} · {participant.company}
                  </p>
                  <div className="tags">
                    {participant.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    !currentParticipantId ||
                    String(currentParticipantId) === String(participant.id)
                  }
                  onClick={() => sendRequest(participant.id)}
                >
                  Хочу познакомиться
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="card wide">
          <div className="section-header">
            <div>
              <p className="eyebrow">Recommendations</p>
              <h2>4. Вам может быть интересно</h2>
            </div>

            <button type="button" onClick={loadRecommendations}>
              Получить рекомендации
            </button>
          </div>

          <div className="list">
            {recommendations.map((person) => (
              <article key={person.id} className="person-card">
                <div>
                  <h3>
                    #{person.id} {person.name}
                  </h3>
                  <p>{person.bio}</p>
                  <p className="small">Match score: {person.match_score}</p>

                  <div className="tags">
                    {person.shared_tags.length > 0 ? (
                      person.shared_tags.map((tag) => (
                        <span className="match-tag" key={tag}>
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span>нет общих тегов</span>
                    )}
                  </div>
                </div>

                <button type="button" onClick={() => sendRequest(person.id)}>
                  Отправить запрос
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>5. Входящие запросы</h2>
            </div>

            <button type="button" onClick={loadIncomingRequests}>
              Обновить
            </button>
          </div>

          <div className="list compact">
            {incomingRequests.length === 0 && (
              <p className="muted">Входящих запросов пока нет.</p>
            )}

            {incomingRequests.map((request) => (
              <article key={request.id} className="mini-card">
                <h3>{request.from_participant.name}</h3>
                <p className="small">
                  Request #{request.id} · {request.status}
                </p>

                <div className="button-row">
                  <button type="button" onClick={() => acceptRequest(request.id)}>
                    Принять
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => skipRequest(request.id)}
                  >
                    Пропустить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Contacts</p>
              <h2>6. Мои контакты</h2>
            </div>

            <button type="button" onClick={loadContacts}>
              Показать контакты
            </button>
          </div>

          <div className="list compact">
            {contacts.length === 0 && (
              <p className="muted">
                Контакты появятся только после принятого запроса.
              </p>
            )}

            {contacts.map((contact) => (
              <article key={contact.id} className="mini-card">
                <h3>{contact.name}</h3>
                <p>{contact.role}</p>
                <p className="small">Telegram: {contact.telegram || "—"}</p>
                <p className="small">Email: {contact.email || "—"}</p>
                <p className="small">LinkedIn: {contact.linkedin || "—"}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card wide">
          <div className="section-header">
            <div>
              <p className="eyebrow">Analytics</p>
              <h2>7. Статистика мероприятия</h2>
            </div>

            <button type="button" onClick={() => loadEventData(eventId)}>
              Обновить статистику
            </button>
          </div>

          {stats ? (
            <div className="stats-grid">
              <div>
                <strong>{stats.participants_count}</strong>
                <span>участников</span>
              </div>
              <div>
                <strong>{stats.requests_count}</strong>
                <span>запросов</span>
              </div>
              <div>
                <strong>{stats.pending_requests_count}</strong>
                <span>ожидают</span>
              </div>
              <div>
                <strong>{stats.accepted_requests_count}</strong>
                <span>приняты</span>
              </div>
              <div>
                <strong>{stats.skipped_requests_count}</strong>
                <span>пропущены</span>
              </div>
              <div>
                <strong>{stats.matches_count}</strong>
                <span>знакомств</span>
              </div>
            </div>
          ) : (
            <p className="muted">Статистика появится после загрузки события.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;