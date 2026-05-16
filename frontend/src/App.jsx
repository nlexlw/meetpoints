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
  
  // Role selection
  const [selectedRole, setSelectedRole] = useState(null); // 'organizer' | 'participant'
  
  // Event state
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [eventId, setEventId] = useState("");
  const [event, setEvent] = useState(null);
  const [share, setShare] = useState(null);
  const [stats, setStats] = useState(null);
  
  // Participant state
  const [participantForm, setParticipantForm] = useState(emptyParticipantForm);
  const [currentParticipantId, setCurrentParticipantId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  
  // Recommendations deck
  const [currentRecommendationIndex, setCurrentRecommendationIndex] = useState(0);
  
  // Requests & contacts
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [contacts, setContacts] = useState([]);
  
  // UI state
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
    
    // Check for event ID in URL path /events/:eventId/join
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3 && pathParts[1] === 'events' && pathParts[3] === 'join') {
      const eventIdFromUrl = pathParts[2];
      setEventId(eventIdFromUrl);
    }
    
    // Load saved data from localStorage
    const savedEventId = localStorage.getItem('meetpoint_eventId');
    const savedParticipantId = localStorage.getItem('meetpoint_participantId');
    
    if (savedEventId) {
      setEventId(savedEventId);
    }
    
    if (savedParticipantId) {
      setCurrentParticipantId(savedParticipantId);
    }
  }, []);

  // Save to localStorage when event or participant changes
  useEffect(() => {
    if (eventId) {
      localStorage.setItem('meetpoint_eventId', eventId);
    } else {
      localStorage.removeItem('meetpoint_eventId');
    }
  }, [eventId]);

  useEffect(() => {
    if (currentParticipantId) {
      localStorage.setItem('meetpoint_participantId', currentParticipantId);
    } else {
      localStorage.removeItem('meetpoint_participantId');
    }
  }, [currentParticipantId]);

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
      setError("Выберите мероприятие и текущего участника");
      return;
    }

    await runAction(async () => {
      const data = await api.getRecommendations(eventId, currentParticipantId);
      setRecommendations(data);
      setCurrentRecommendationIndex(0);
    }, "Рекомендации загружены");
  }

  async function sendRequest(toParticipantId) {
    if (!eventId || !currentParticipantId) {
      setError("Выберите мероприятие и текущего участника");
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
      setError("Сначала выберите текущего участника");
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
      setError("Сначала выберите текущего участника");
      return;
    }

    await runAction(async () => {
      const data = await api.getContacts(currentParticipantId);
      setContacts(data);
    }, "Контакты загружены");
  }

  function goBackToMain() {
    setSelectedRole(null);
    setEventId("");
    setCurrentParticipantId("");
    setEvent(null);
    setShare(null);
    setStats(null);
    setParticipants([]);
    setRecommendations([]);
    setIncomingRequests([]);
    setContacts([]);
    setCurrentRecommendationIndex(0);
    setError("");
    setMessage("");
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

  function handleRecommendationSkip() {
    if (currentRecommendationIndex < recommendations.length - 1) {
      setCurrentRecommendationIndex(currentRecommendationIndex + 1);
    } else {
      setCurrentRecommendationIndex(0);
    }
  }

  function handleRecommendationLike(participantId) {
    runAction(async () => {
      await api.sendRequest({
        event_id: Number(eventId),
        from_participant_id: Number(currentParticipantId),
        to_participant_id: Number(participantId),
      });
    }, "Запрос отправлен");

    // Move to next recommendation
    if (currentRecommendationIndex < recommendations.length - 1) {
      setCurrentRecommendationIndex(currentRecommendationIndex + 1);
    } else {
      setCurrentRecommendationIndex(0);
    }
  }

  return (
    <div className="app">
      {(message || error || loading) && (
        <section className="notice-area">
          {loading && <div className="notice loading">Загрузка...</div>}
          {message && <div className="notice success">{message}</div>}
          {error && <div className="notice error">{error}</div>}
        </section>
      )}

      {!selectedRole && (
        <div className="hero">
          <div>
            <p className="eyebrow">Hackathon MVP</p>
            <h1>MeetPoint</h1>
            <p>
              Платформа для нетворкинга на мероприятиях: организаторы создают мероприятия, участники регистрируются, отправляют запросы на знакомство и обмениваются контактами при взаимном интересе.
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
        </div>
      )}

      <main className="grid">
        {!selectedRole && (
          <section className="card wide">
            <div className="section-header">
              <div>
                <p className="eyebrow">Выберите роль</p>
                <h2>Начните работу</h2>
              </div>
            </div>
            
            <div className="role-selection">
              <div 
                className="role-card organizer"
                onClick={() => setSelectedRole('organizer')}
              >
                <div className="role-icon">👤</div>
                <h3>Я организатор</h3>
                <p>Создавайте мероприятия, управляйте участниками и отслеживайте статистику</p>
              </div>
              
              <div 
                className="role-card participant"
                onClick={() => setSelectedRole('participant')}
              >
                <div className="role-icon">👥</div>
                <h3>Я участник</h3>
                <p>Регистрируйтесь на мероприятия, знакомьтесь с другими участниками и обменивайтесь контактами</p>
              </div>
            </div>
          </section>
        )}

        {/* ORGANIZER FLOW */}
        {selectedRole === 'organizer' && (
          <>
            <section className="card wide">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Организатор</p>
                  <h2>1. Создать мероприятие</h2>
                </div>
                <button 
                  type="button" 
                  className="secondary" 
                  onClick={goBackToMain}
                >
                  Вернуться
                </button>
              </div>

              <form className="form" onSubmit={createEvent}>
                <label>
                  Название мероприятия
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

            {event && (
              <>
                <section className="card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Мероприятие</p>
                      <h2>Информация о событии</h2>
                    </div>
                  </div>

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
                    <p className="small">
                      ID мероприятия: <strong>{event.id}</strong>
                    </p>
                  </div>

                  <div className="button-row">
                    <button 
                      type="button" 
                      className="secondary" 
                      onClick={closeRegistration}
                      disabled={event.is_registration_open === false}
                    >
                      Закрыть регистрацию
                    </button>
                  </div>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Доступ участников</p>
                      <h2>Ссылка для регистрации</h2>
                    </div>
                  </div>

                  {share ? (
                    <div className="qr-box">
                      <QRCodeSVG value={share.qr_payload} size={150} />
                      <a href={share.join_url} target="_blank" rel="noreferrer">
                        {share.join_url}
                      </a>
                    </div>
                  ) : (
                    <p className="muted">Загрузите данные мероприятия.</p>
                  )}
                </section>

                <section className="card wide">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Участники</p>
                      <h2>Зарегистрированные участники</h2>
                    </div>
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={() => loadEventData(eventId)}>
                      Обновить список
                    </button>
                  </div>

                  <div className="list">
                    {participants.length === 0 ? (
                      <p className="muted">Пока нет зарегистрированных участников.</p>
                    ) : (
                      participants.map((participant) => (
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
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className="card wide">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Статистика</p>
                      <h2>Аналитика мероприятия</h2>
                    </div>
                  </div>

                  <div className="button-row">
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
                        <span>в обработке</span>
                      </div>
                      <div>
                        <strong>{stats.accepted_requests_count}</strong>
                        <span>знакомств</span>
                      </div>
                      <div>
                        <strong>{stats.skipped_requests_count}</strong>
                        <span>отклонено</span>
                      </div>
                      <div>
                        <strong>{stats.matches_count}</strong>
                        <span>совпадений</span>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Статистика появится после регистрации участников.</p>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {/* PARTICIPANT FLOW */}
        {selectedRole === 'participant' && (
          <>
            <section className="card wide">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Участник</p>
                  <h2>1. Присоединиться к мероприятию</h2>
                </div>
                <button 
                  type="button" 
                  className="secondary" 
                  onClick={goBackToMain}
                >
                  Вернуться
                </button>
              </div>

              {!event && (
                <div className="join-form">
                  <label>
                    ID мероприятия
                    <input
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      placeholder="Введите ID мероприятия"
                    />
                  </label>

                  <button 
                    type="button" 
                    onClick={() => loadEventData(eventId)}
                    disabled={!eventId}
                  >
                    Присоединиться
                  </button>

                  {event && (
                    <div className="info-box">
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <p className="small">
                        Регистрация:{" "}
                        <strong>{event.is_registration_open ? "открыта" : "закрыта"}</strong>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {event && !currentParticipantId && (
              <section className="card wide">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Регистрация</p>
                    <h2>2. Зарегистрироваться как участник</h2>
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
                    О себе (Bio)
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
                      Компания
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
                      Интересы (теги)
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

                  <div className="button-row">
                    <button type="button" className="secondary" onClick={fillMaria}>
                      Заполнить Maria
                    </button>
                    <button type="button" className="secondary" onClick={fillDima}>
                      Заполнить Dima
                    </button>
                  </div>

                  <button type="submit">Зарегистрироваться</button>
                </form>
              </section>
            )}

            {currentParticipantId && (
              <>
                <section className="card wide">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Рекомендации</p>
                      <h2>3. Знакомства</h2>
                    </div>
                  </div>

                  <div className="deck-container">
                    {recommendations.length > 0 && currentRecommendationIndex < recommendations.length ? (
                      <div className="recommendation-card">
                        <div className="person-card large">
                          <div>
                            <h3>
                              #{recommendations[currentRecommendationIndex].id} {recommendations[currentRecommendationIndex].name}
                            </h3>
                            <p>{recommendations[currentRecommendationIndex].bio}</p>
                            <p className="small">
                              {recommendations[currentRecommendationIndex].role} · {recommendations[currentRecommendationIndex].company}
                            </p>
                            <div className="tags">
                              {recommendations[currentRecommendationIndex].tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                            {recommendations[currentRecommendationIndex].shared_tags.length > 0 && (
                              <div className="shared-tags">
                                <p className="small">Общие интересы:</p>
                                {recommendations[currentRecommendationIndex].shared_tags.map((tag) => (
                                  <span className="match-tag" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                                <p className="small">
                                  Совпадение: <strong>{recommendations[currentRecommendationIndex].match_score}%</strong>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="deck-buttons">
                          <button 
                            type="button" 
                            className="secondary large"
                            onClick={handleRecommendationSkip}
                          >
                            Пропустить
                          </button>
                          <button 
                            type="button" 
                            className="large"
                            onClick={() => handleRecommendationLike(recommendations[currentRecommendationIndex].id)}
                          >
                            Хочу познакомиться
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="deck-empty">
                        <p className="muted">Рекомендации закончились. Нажмите "Получить рекомендации" для обновления.</p>
                        <button type="button" onClick={loadRecommendations}>
                          Получить рекомендации
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={loadRecommendations}>
                      Получить рекомендации
                    </button>
                  </div>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Запросы</p>
                      <h2>4. Входящие запросы</h2>
                    </div>
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={loadIncomingRequests}>
                      Проверить входящие
                    </button>
                  </div>

                  <div className="list compact">
                    {incomingRequests.length === 0 ? (
                      <p className="muted">Входящих запросов пока нет.</p>
                    ) : (
                      incomingRequests.map((request) => (
                        <article key={request.id} className="mini-card">
                          <h3>{request.from_participant.name}</h3>
                          <p className="small">
                            Запрос #{request.id} · {request.status}
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
                      ))
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Контакты</p>
                      <h2>5. Мои контакты</h2>
                    </div>
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={loadContacts}>
                      Показать контакты
                    </button>
                  </div>

                  <div className="list compact">
                    {contacts.length === 0 ? (
                      <p className="muted">
                        Контакты появятся только после принятия запроса.
                      </p>
                    ) : (
                      contacts.map((contact) => (
                        <article key={contact.id} className="mini-card">
                          <h3>{contact.name}</h3>
                          <p>{contact.role}</p>
                          <p className="small">Telegram: {contact.telegram || "—"}</p>
                          <p className="small">Email: {contact.email || "—"}</p>
                          <p className="small">LinkedIn: {contact.linkedin || "—"}</p>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;