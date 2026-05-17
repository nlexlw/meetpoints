import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrowserQRCodeReader } from "@zxing/browser";
import "./style.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

const PROFILE_STORAGE_KEY = "meetpoint_profiles_v1";
const AVATAR_STORAGE_KEY = "meetpoint_avatars_v1";
const ORGANIZER_EVENTS_STORAGE_KEY = "meetpoint_organizer_events_v1";
const FEEDBACK_STORAGE_KEY = "meetpoint_event_feedback_v1";
const emptyEventForm = {
  title: "Hackathon Minsk 2026",
  description: "Networking for hackathon participants",
  location: "Minsk",
  organizer_name: "Meetings Team",
  tags: "startup, ai, design, backend",
};

const emptyProfileForm = {
  name: "",
  role: "",
  company: "Student",
  bio: "",
  tags: "",
  looking_for: "",
  telegram: "",
  email: "",
  linkedin: "",
  avatarPreview: "",
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Ошибка ${response.status}`;

    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail || data);
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function extractEventId(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const joinPathMatch = text.match(/\/events\/(\d+)\/join/i);
  if (joinPathMatch) return joinPathMatch[1];

  if (/^\d+$/.test(text)) return text;

  try {
    const url = new URL(text);
    const fromPath = url.pathname.match(/\/events\/(\d+)\/join/i);
    if (fromPath) return fromPath[1];

    const fromQuery =
      url.searchParams.get("event_id") ||
      url.searchParams.get("eventId") ||
      url.searchParams.get("id");

    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
  } catch {
    return "";
  }

  return "";
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function initials(name = "M") {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Logo({ small = false }) {
  return (
    <div className={small ? "logo small" : "logo"}>
      <div className="logo-mark">
  <img src="/logo.png" alt="Meetings logo" />
</div>
      <span>Meetings</span>
    </div>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <header className="screen-header">
      <div>
        <Logo small />
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      {onBack && (
        <button className="ghost-button" type="button" onClick={onBack}>
          На главный экран
        </button>
      )}
    </header>
  );
}

function Tags({ tags = [] }) {
  if (!tags.length) return null;

  return (
    <div className="tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}

function Avatar({ name, src, big = false }) {
  return (
    <div className={big ? "avatar big" : "avatar"}>
      {src ? <img src={src} alt={name} /> : <span>{initials(name)}</span>}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");

  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [eventStep, setEventStep] = useState(1);
  const [eventId, setEventId] = useState("");
  const [qrInput, setQrInput] = useState("");
  const qrVideoRef = useRef(null);
  const qrReaderRef = useRef(null);
  const qrControlsRef = useRef(null);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [qrScannerMessage, setQrScannerMessage] = useState("");

  const [event, setEvent] = useState(null);
  const [share, setShare] = useState(null);
  const [stats, setStats] = useState(null);
  const [participants, setParticipants] = useState([]);

  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [currentParticipantId, setCurrentParticipantId] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [requestedIds, setRequestedIds] = useState(new Set());

  const [incomingRequests, setIncomingRequests] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [savedProfiles, setSavedProfiles] = useState(() =>
    readStorage(PROFILE_STORAGE_KEY, [])
  );
  const [avatars, setAvatars] = useState(() => readStorage(AVATAR_STORAGE_KEY, {}));
  const [savedOrganizerEvents, setSavedOrganizerEvents] = useState(() =>
    readStorage(ORGANIZER_EVENTS_STORAGE_KEY, [])
  );
  const [feedbacks, setFeedbacks] = useState(() =>
  readStorage(FEEDBACK_STORAGE_KEY, [])
);
const [feedbackRating, setFeedbackRating] = useState(5);
const [feedbackText, setFeedbackText] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGlobalLoader, setShowGlobalLoader] = useState(false);
  const loaderShownAtRef = useRef(0);

  const currentParticipant = useMemo(() => {
    return participants.find(
      (participant) => String(participant.id) === String(currentParticipantId)
    );
  }, [participants, currentParticipantId]);

  const savedProfilesForEvent = useMemo(() => {
    return savedProfiles.filter(
      (profile) =>
        String(profile.event_id) === String(eventId) && !profile.archived
    );
  }, [savedProfiles, eventId]);

  const ownedProfileIdsForEvent = useMemo(() => {
    return new Set(
      savedProfiles
        .filter((profile) => String(profile.event_id) === String(eventId))
        .map((profile) => String(profile.id))
    );
  }, [savedProfiles, eventId]);

  const visibleCards = useMemo(() => {
    return recommendations.filter((person) => {
      const id = String(person.id);
      const currentId = String(currentParticipantId || "");

      if (id === currentId) return false;
      if (ownedProfileIdsForEvent.has(id)) return false;
      if (dismissedIds.has(id)) return false;
      if (requestedIds.has(id)) return false;
      if (person.request_status === "pending") return false;
      if (person.request_status === "accepted") return false;

      return true;
    });
  }, [
    recommendations,
    currentParticipantId,
    ownedProfileIdsForEvent,
    dismissedIds,
    requestedIds,
  ]);

  const activeCard = visibleCards[0];
  const currentEventFeedbacks = useMemo(() => {
  return feedbacks.filter(
    (feedback) => String(feedback.event_id) === String(eventId)
  );
}, [feedbacks, eventId]);

const averageEventRating = useMemo(() => {
  if (currentEventFeedbacks.length === 0) return null;

  const sum = currentEventFeedbacks.reduce(
    (total, feedback) => total + Number(feedback.rating || 0),
    0
  );

  return (sum / currentEventFeedbacks.length).toFixed(1);
}, [currentEventFeedbacks]);

  useEffect(() => {
    const idFromUrl = extractEventId(window.location.href);

    if (idFromUrl) {
      setEventId(idFromUrl);
      setQrInput(idFromUrl);
      setScreen("participant-join");
      loadEventBundle(idFromUrl, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timerId;

    if (loading) {
      timerId = window.setTimeout(() => {
        loaderShownAtRef.current = Date.now();
        setShowGlobalLoader(true);
      }, 650);

      return () => window.clearTimeout(timerId);
    }

    if (showGlobalLoader) {
      const elapsed = Date.now() - loaderShownAtRef.current;
      const remaining = Math.max(0, 850 - elapsed);

      timerId = window.setTimeout(() => {
        setShowGlobalLoader(false);
      }, remaining);

      return () => window.clearTimeout(timerId);
    }

    setShowGlobalLoader(false);

    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, [loading, showGlobalLoader]);

  useEffect(() => {
    if (screen !== "participant-join") {
      stopQrScanner();
    }

    return () => {
      stopQrScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

function showNotice(message) {
  setNotice(message);
  setError("");

  window.setTimeout(() => {
    setNotice((current) => (current === message ? "" : current));
  }, 5500);
}

function showError(message) {
  setError(message);
  setNotice("");

  window.setTimeout(() => {
    setError((current) => (current === message ? "" : current));
  }, 8000);
}

function stopQrScanner() {
  if (qrControlsRef.current) {
    qrControlsRef.current.stop();
    qrControlsRef.current = null;
  }

  setIsQrScannerOpen(false);
}

async function startQrScanner() {
  setQrScannerMessage("");

  if (!navigator.mediaDevices?.getUserMedia) {
    setQrScannerMessage(
      "Камера недоступна в этом браузере. Введите ID или ссылку вручную."
    );
    return;
  }

  stopQrScanner();

  setIsQrScannerOpen(true);
  setQrScannerMessage("Разрешите доступ к камере и наведите её на QR-код.");

  window.setTimeout(async () => {
    if (!qrVideoRef.current) {
      setQrScannerMessage(
        "Видео ещё не готово. Попробуйте остановить камеру и включить снова."
      );
      return;
    }

    try {
      qrReaderRef.current = new BrowserQRCodeReader();

      const controls = await qrReaderRef.current.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        qrVideoRef.current,
        async (result) => {
          if (!result) return;

          const rawValue = result.getText();
          const parsedId = extractEventId(rawValue);

          if (!parsedId) {
            setQrScannerMessage("QR найден, но ID мероприятия не распознан.");
            return;
          }

          stopQrScanner();
          setQrInput(rawValue);
          setEventId(String(parsedId));
          setQrScannerMessage("QR-код считан. Загружаем мероприятие...");

          await loadEventBundle(parsedId);
        }
      );

      qrControlsRef.current = controls;
    } catch (err) {
      stopQrScanner();
      setQrScannerMessage(
        "Не удалось открыть камеру. Проверьте разрешение или введите ID вручную."
      );
    }
  }, 250);
}
async function saveEventFeedback() {
  if (!eventId || !currentParticipantId) {
    showError("Сначала выберите мероприятие и анкету участника.");
    return;
  }

  const text = feedbackText.trim();

  if (!text) {
    showError("Напишите короткий отзыв.");
    return;
  }

  try {
    setLoading(true);

    await api(`/events/${eventId}/feedback`, {
      method: "POST",
      body: JSON.stringify({
        participant_id: Number(currentParticipantId),
        rating: Number(feedbackRating),
        text,
      }),
    });

    const data = await api(`/events/${eventId}/feedback`);

    setFeedbacks((current) => {
      const otherEventsFeedbacks = current.filter(
        (feedback) => String(feedback.event_id) !== String(eventId)
      );

      const nextFeedbacks = [...otherEventsFeedbacks, ...data];

      writeStorage(FEEDBACK_STORAGE_KEY, nextFeedbacks);

      return nextFeedbacks;
    });

    setFeedbackText("");
    setFeedbackRating(5);

    showNotice("Спасибо! Отзыв сохранён.");
  } catch (err) {
    showError(err.message || "Не удалось сохранить отзыв.");
  } finally {
    setLoading(false);
  }
}
function getSavedOrganizerEventsFromStorage() {
  return readStorage(ORGANIZER_EVENTS_STORAGE_KEY, []);
}

function findSavedOrganizerEvent(id) {
  const fromState = savedOrganizerEvents.find(
    (item) => String(item.id) === String(id)
  );

  if (fromState) return fromState;

  return getSavedOrganizerEventsFromStorage().find(
    (item) => String(item.id) === String(id)
  );
}

function getOrganizerAdminToken(id) {
  return findSavedOrganizerEvent(id)?.admin_token || null;
}

function saveOrganizerEvent(eventData) {
  if (!eventData?.id) return;

  setSavedOrganizerEvents((currentEvents) => {
    const storageEvents = getSavedOrganizerEventsFromStorage();
    const sourceEvents = currentEvents.length ? currentEvents : storageEvents;

    const existingEvent = sourceEvents.find(
      (item) => String(item.id) === String(eventData.id)
    );

    const normalizedEvent = {
      id: eventData.id,
      title: eventData.title || existingEvent?.title || "Мероприятие",
      description: eventData.description ?? existingEvent?.description ?? "",
      location: eventData.location ?? existingEvent?.location ?? "",
      organizer_name:
        eventData.organizer_name ?? existingEvent?.organizer_name ?? "",
      tags: eventData.tags || existingEvent?.tags || [],
      is_registration_open:
        eventData.is_registration_open ??
        existingEvent?.is_registration_open ??
        true,
      created_at: eventData.created_at || existingEvent?.created_at,
      saved_at: existingEvent?.saved_at || new Date().toISOString(),
      admin_token: eventData.admin_token || existingEvent?.admin_token || null,
    };

    const nextEvents = [
      normalizedEvent,
      ...sourceEvents.filter(
        (item) => String(item.id) !== String(eventData.id)
      ),
    ];

    writeStorage(ORGANIZER_EVENTS_STORAGE_KEY, nextEvents);

    return nextEvents;
  });
}

async function openOrganizerDashboard(eventData) {
  const id = eventData?.id || eventData;

  if (!id) {
    showError("Не удалось открыть мероприятие.");
    return;
  }

  setEventId(String(id));

const freshEvent = await loadEventBundle(id, true);
const adminToken = eventData?.admin_token || getOrganizerAdminToken(id);

if (freshEvent) {
  saveOrganizerEvent({
    ...freshEvent,
    admin_token: adminToken,
  });
}

setScreen("organizer-dashboard");
}
  async function loadEventBundle(id = eventId, silent = false) {
    const parsedId = extractEventId(id);

    if (!parsedId) {
      showError("Введите ID мероприятия или ссылку из QR-кода.");
      return;
    }

    try {
      setLoading(true);

  const [eventData, shareData, statsData, participantsData, feedbackData] =
  await Promise.all([
    api(`/events/${parsedId}`),
    api(`/events/${parsedId}/share`),
    api(`/events/${parsedId}/stats`),
    api(`/events/${parsedId}/participants`),
    api(`/events/${parsedId}/feedback`).catch(() => []),
  ]);
      setEventId(String(parsedId));
setEvent(eventData);
setShare(shareData);
setStats(statsData);
setParticipants(participantsData);
setFeedbacks((current) => {
  const otherEventsFeedbacks = current.filter(
    (feedback) => String(feedback.event_id) !== String(parsedId)
  );

  const nextFeedbacks = [...otherEventsFeedbacks, ...feedbackData];

  writeStorage(FEEDBACK_STORAGE_KEY, nextFeedbacks);

  return nextFeedbacks;
});
      

      if (!silent) showNotice("Мероприятие загружено.");
      return eventData;
    } catch (err) {
      showError(err.message || "Не удалось загрузить мероприятие.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function createEvent(e) {
    e.preventDefault();

    try {
      setLoading(true);

      const created = await api("/events", {
        method: "POST",
        body: JSON.stringify({
          title: eventForm.title,
          description: eventForm.description,
          location: eventForm.location,
          organizer_name: eventForm.organizer_name,
          tags: parseCsv(eventForm.tags),
        }),
      });

      saveOrganizerEvent(created);
setEventId(String(created.id));
setEventStep(1);
setEventForm(emptyEventForm);

await loadEventBundle(created.id, true);

setScreen("organizer-dashboard");
showNotice("Мероприятие создано. QR-код готов.");

    } catch (err) {
      showError(err.message || "Не удалось создать мероприятие.");
    } finally {
      setLoading(false);
    }
  }

  async function closeRegistration() {
  if (!eventId) return;

  const adminToken = getOrganizerAdminToken(eventId);

  if (!adminToken) {
    showError(
      "Закрыть регистрацию может только организатор, который создал мероприятие на этом устройстве."
    );
    return;
  }

  try {
    setLoading(true);

    await api(`/events/${eventId}/close`, {
      method: "PATCH",
      headers: {
        "X-Admin-Token": adminToken,
      },
    });

    const freshEvent = await loadEventBundle(eventId, true);

    saveOrganizerEvent({
      ...(freshEvent || event || {}),
      id: eventId,
      admin_token: adminToken,
      is_registration_open: false,
    });

    setEvent((current) =>
      current
        ? {
            ...current,
            is_registration_open: false,
          }
        : freshEvent
    );

    setStats((current) =>
      current
        ? {
            ...current,
            is_registration_open: false,
          }
        : current
    );

    showNotice("Регистрация закрыта.");
  } catch (err) {
    showError(err.message || "Не удалось закрыть регистрацию.");
  } finally {
    setLoading(false);
  }
}


  function findEvent(e) {
    e.preventDefault();

    const parsedId = extractEventId(qrInput);

    if (!parsedId) {
      showError("Не получилось распознать ID мероприятия.");
      return;
    }

    setEventId(parsedId);
    loadEventBundle(parsedId);
  }

  function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setProfileForm((current) => ({
        ...current,
        avatarPreview: String(reader.result || ""),
      }));
    };

    reader.readAsDataURL(file);
  }

  function saveLocalProfile(participant, avatarPreview) {
    const participantId = String(participant.id);
    const participantEventId = String(participant.event_id);

    const archivedOldProfiles = savedProfiles.map((profile) => {
      const isSameEvent = String(profile.event_id) === participantEventId;
      const isSameProfile = String(profile.id) === participantId;

      if (isSameEvent && !isSameProfile) {
        return {
          ...profile,
          archived: true,
        };
      }

      return profile;
    });

    const nextProfiles = [
      ...archivedOldProfiles.filter(
        (profile) => String(profile.id) !== participantId
      ),
      {
        id: participant.id,
        event_id: participant.event_id,
        name: participant.name,
        role: participant.role,
        company: participant.company,
        bio: participant.bio,
        tags: participant.tags || [],
        telegram: profileForm.telegram?.trim?.() || participant.telegram || "",
        email: profileForm.email?.trim?.() || participant.email || "",
        linkedin: profileForm.linkedin?.trim?.() || participant.linkedin || "",
        archived: false,
      },
    ];

    const nextAvatars = { ...avatars };

    if (avatarPreview) {
      nextAvatars[participantId] = avatarPreview;
    }

    setSavedProfiles(nextProfiles);
    setAvatars(nextAvatars);

    writeStorage(PROFILE_STORAGE_KEY, nextProfiles);
    writeStorage(AVATAR_STORAGE_KEY, nextAvatars);
  }

  async function createParticipant(e) {
    e.preventDefault();

    if (!eventId) {
      showError("Сначала выберите мероприятие.");
      return;
    }

    if (!profileForm.name.trim()) {
      showError("Введите имя.");
      return;
    }

    try {
      setLoading(true);

      const tags = [
        ...parseCsv(profileForm.tags),
        ...parseCsv(profileForm.looking_for),
      ];

      const normalizedTelegram = profileForm.telegram.trim().toLowerCase();
      const normalizedEmail = profileForm.email.trim().toLowerCase();
      const normalizedLinkedin = profileForm.linkedin.trim().toLowerCase();

      const existingLocalProfile = savedProfilesForEvent.find((profile) => {
        const sameTelegram =
          normalizedTelegram &&
          String(profile.telegram || "").trim().toLowerCase() === normalizedTelegram;

        const sameEmail =
          normalizedEmail &&
          String(profile.email || "").trim().toLowerCase() === normalizedEmail;

        const sameLinkedin =
          normalizedLinkedin &&
          String(profile.linkedin || "").trim().toLowerCase() === normalizedLinkedin;

        return sameTelegram || sameEmail || sameLinkedin;
      });

      if (existingLocalProfile) {
        showNotice("Эта анкета уже есть. Открываем готовый профиль.");
        await continueWithProfile(existingLocalProfile.id);
        return;
      }

      const participant = await api(`/events/${eventId}/participants`, {
        method: "POST",
        body: JSON.stringify({
          name: profileForm.name.trim(),
          bio: profileForm.bio.trim(),
          role: profileForm.role.trim(),
          company: profileForm.company.trim(),
          tags,
          telegram: profileForm.telegram.trim(),
          email: profileForm.email.trim(),
          linkedin: profileForm.linkedin.trim(),
        }),
      });

      saveLocalProfile(participant, profileForm.avatarPreview);
      setCurrentParticipantId(String(participant.id));
      setDismissedIds(new Set());
      setRequestedIds(new Set());

      await loadEventBundle(eventId, true);
      await loadRecommendations(participant.id);

      setScreen("participant-swipe");
      showNotice("Анкета создана. Можно знакомиться.");
    } catch (err) {
      showError(err.message || "Не удалось создать анкету.");
    } finally {
      setLoading(false);
    }
  }

  async function enterAsGuest() {
    if (!eventId) {
      showError("Сначала выберите мероприятие.");
      return;
    }

    try {
      setLoading(true);

      const guest = await api(`/events/${eventId}/participants`, {
        method: "POST",
        body: JSON.stringify({
          name: `Гость ${Math.floor(1000 + Math.random() * 9000)}`,
          bio: "Хочу посмотреть участников мероприятия.",
          role: "Guest",
          company: "",
          tags: ["networking"],
          telegram: "",
          email: "",
          linkedin: "",
        }),
      });

      saveLocalProfile(guest, "");
      setCurrentParticipantId(String(guest.id));
      setDismissedIds(new Set());
      setRequestedIds(new Set());
      await loadEventBundle(eventId, true);
      await loadRecommendations(guest.id);

      setScreen("participant-swipe");
      showNotice("Вы вошли как гость.");
    } catch (err) {
      showError(err.message || "Не удалось войти как гость.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithProfile(profileId) {
    setCurrentParticipantId(String(profileId));
    setDismissedIds(new Set());
    setRequestedIds(new Set());
    await loadEventBundle(eventId, true);
    await loadRecommendations(profileId);
    setScreen("participant-swipe");
  }

  async function loadRecommendations(participantId = currentParticipantId) {
    if (!eventId || !participantId) {
      showError("Сначала выберите мероприятие и анкету.");
      return;
    }

    try {
      setLoading(true);

      const data = await api(
        `/events/${eventId}/participants/${participantId}/recommendations`
      );

      setRecommendations(
  [...data].sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0))
);

showNotice("Рекомендации обновлены.");

    
    } catch (err) {
      showError(err.message || "Не удалось загрузить рекомендации.");
    } finally {
      setLoading(false);
    }
  }

  function skipCard() {
    if (!activeCard) return;

    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(String(activeCard.id));
      return next;
    });
  }

  async function likeCard() {
    if (!activeCard || !currentParticipantId) return;

    if (
      String(activeCard.id) === String(currentParticipantId) ||
      ownedProfileIdsForEvent.has(String(activeCard.id))
    ) {
      setDismissedIds((current) => {
        const next = new Set(current);
        next.add(String(activeCard.id));
        return next;
      });

      showError("Нельзя отправить запрос своей анкете.");
      return;
    }

    try {
      setLoading(true);

      await api("/requests", {
        method: "POST",
        body: JSON.stringify({
          event_id: Number(eventId),
          from_participant_id: Number(currentParticipantId),
          to_participant_id: Number(activeCard.id),
        }),
      });

      setRequestedIds((current) => {
        const next = new Set(current);
        next.add(String(activeCard.id));
        return next;
      });

      setDismissedIds((current) => {
        const next = new Set(current);
        next.add(String(activeCard.id));
        return next;
      });

      showNotice("Запрос отправлен.");
    } catch (err) {
      if (String(err.message).toLowerCase().includes("duplicate")) {
        setRequestedIds((current) => {
          const next = new Set(current);
          next.add(String(activeCard.id));
          return next;
        });

        setDismissedIds((current) => {
          const next = new Set(current);
          next.add(String(activeCard.id));
          return next;
        });

        showNotice("Вы уже отправляли запрос этому участнику.");
      } else {
        showError(err.message || "Не удалось отправить запрос.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadIncomingRequests() {
    if (!currentParticipantId) return;

    try {
      setLoading(true);

      const data = await api(
        `/participants/${currentParticipantId}/incoming-requests`
      );

      setIncomingRequests(data);
      showNotice("Входящие запросы обновлены.");
    } catch (err) {
      showError(err.message || "Не удалось загрузить входящие запросы.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptRequest(requestId) {
    try {
      setLoading(true);

      await api(`/requests/${requestId}/accept`, {
        method: "PATCH",
      });

      await loadIncomingRequests();
      await loadContacts();

      showNotice("Запрос принят. Контакты открыты.");
    } catch (err) {
      showError(err.message || "Не удалось принять запрос.");
    } finally {
      setLoading(false);
    }
  }

  async function skipRequest(requestId) {
    try {
      setLoading(true);

      await api(`/requests/${requestId}/skip`, {
        method: "PATCH",
      });

      await loadIncomingRequests();
      showNotice("Запрос пропущен.");
    } catch (err) {
      showError(err.message || "Не удалось пропустить запрос.");
    } finally {
      setLoading(false);
    }
  }

  async function loadContacts() {
    if (!currentParticipantId) return;

    try {
      setLoading(true);

      const data = await api(`/participants/${currentParticipantId}/contacts`);
      setContacts(data);
      showNotice("Контакты обновлены.");
    } catch (err) {
      showError(err.message || "Не удалось загрузить контакты.");
    } finally {
      setLoading(false);
    }
  }

  function goHome() {
    setScreen("home");
    setError("");
    setNotice("");
  }

  function openMyProfile() {
    if (currentParticipant) {
      setProfileForm({
        name: currentParticipant.name || "",
        role: currentParticipant.role || "",
        company: currentParticipant.company || "",
        bio: currentParticipant.bio || "",
        tags: (currentParticipant.tags || []).join(", "),
        looking_for: "",
        telegram: "",
        email: "",
        linkedin: "",
        avatarPreview: avatars[String(currentParticipant.id)] || "",
      });
    }

    setScreen("participant-profile");
  }

  return (
    <div className="app">
      {(notice || error) && (
        <div className="toast-stack">
          {notice && <div className="app-toast notice-toast">{notice}</div>}
          {error && <div className="app-toast error-toast">{error}</div>}
        </div>
      )}

{screen === "home" && (
  <main className="home-screen clean-home">
    <nav className="clean-nav">
      <div className="clean-logo">
        <div className="clean-logo-mark">M</div>
        <span>Meetings</span>
      </div>
    </nav>

    <section className="clean-hero">
      <div className="clean-hero-copy">
        <p className="eyebrow">PROD Hackathon MVP</p>

        <h1>
          Знакомства на мероприятиях без неловкости и хаоса
        </h1>

        <p className="clean-hero-text">
          Meetings помогает участникам быстро находить людей по интересам,
          а организаторам — видеть активность, статистику и реальные знакомства
          внутри события.
        </p>

        <div className="clean-steps">
          <div>
            <strong>01</strong>
            <span>Организатор создаёт событие</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Участники входят по QR или ID</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Карточки, запросы и контакты при взаимном интересе</span>
          </div>
        </div>
      </div>

      <div className="clean-action-panel">
<div className="role-panel">
  <div className="role-panel-header">
    <p className="eyebrow">Выберите сценарий</p>
    <h2>Кто вы на мероприятии?</h2>
  </div>

  <div className="clean-role-grid">
    <button
      type="button"
      className="clean-role-card"
      onClick={() => setScreen("organizer-home")}
    >
      <span className="role-tag">QR</span>

      <div>
        <strong>Я организатор</strong>
        <p>
          Создать одно или несколько мероприятий, получить QR-код, смотреть
          участников и статистику.
        </p>
      </div>

      <span className="role-cta">Создать мероприятие →</span>
    </button>

    <button
      type="button"
      className="clean-role-card accent"
      onClick={() => setScreen("participant-join")}
    >
      <span className="role-tag">MATCH</span>

      <div>
        <strong>Я участник</strong>
        <p>
          Войти по QR или ID встречи, заполнить анкету и найти людей по
          интересам.
        </p>
      </div>

      <span className="role-cta">Присоединиться →</span>
    </button>
  </div>
</div>
      </div>
    </section>
  </main>
)}
{screen === "organizer-home" && (
  <main className="page organizer-home-page">
    <Header
      title="Мои мероприятия"
      subtitle="Создавайте несколько событий, открывайте dashboard и следите за участниками, QR-кодами и статистикой."
      onBack={goHome}
    />

    <section className="organizer-home-layout">
      <div className="organizer-create-banner">
        <div>
          <p className="eyebrow">Организатор</p>
          <h2>Создайте новое мероприятие</h2>
          <p>
            После создания вы получите QR-код и ссылку для участников, а также
            dashboard со статистикой и списком людей.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEventStep(1);
            setEventForm(emptyEventForm);
            setScreen("organizer-create");
            setDismissedIds(new Set());
            setRequestedIds(new Set());
          }}
        >
          Создать мероприятие
        </button>
      </div>

      <div className="organizer-events-section">
        <div className="section-row">
          <div>
            <p className="eyebrow">Сохранённые события</p>
            <h2>Dashboard мероприятий</h2>
          </div>

          <span className="events-count">
            {savedOrganizerEvents.length} событий
          </span>
        </div>

        {savedOrganizerEvents.length === 0 ? (
          <div className="empty-organizer-state">
            <h3>Пока нет созданных мероприятий</h3>
            <p>
              Создайте первое событие, чтобы показать QR-код участникам и
              начать собирать статистику.
            </p>
          </div>
        ) : (
          <div className="organizer-events-grid">
            {savedOrganizerEvents.map((item) => (
              <article className="organizer-event-card" key={item.id}>
                <div className="event-card-top">
                  <span className="event-id">ID #{item.id}</span>
                  <span
                    className={
                      item.is_registration_open
                        ? "event-status open"
                        : "event-status closed"
                    }
                  >
                    {item.is_registration_open ? "Регистрация открыта" : "Закрыто"}
                  </span>
                </div>

                <h3>{item.title}</h3>
                <p>{item.description || "Описание не указано."}</p>

                <div className="event-card-meta">
                  <span>{item.location || "Локация не указана"}</span>
                  <span>{item.organizer_name || "Организатор не указан"}</span>
                </div>

                <Tags tags={(item.tags || []).slice(0, 5)} />

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openOrganizerDashboard(item)}
                >
                  Открыть dashboard
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  </main>
)}
{screen === "organizer-create" && (
  <main className="page clean-page organizer-create-page">
    <Header
      title="Создание мероприятия"
      subtitle="Заполним событие по шагам и сразу получим QR-код."
      onBack={goHome}
    />

    <section className="event-wizard-card">
      <div className="wizard-top">
        <div>
          <p className="eyebrow">Шаг {eventStep} из 3</p>
          <h2>
            {eventStep === 1 && "Что за мероприятие?"}
            {eventStep === 2 && "Нетворкинг и теги"}
            {eventStep === 3 && "Проверка перед созданием"}
          </h2>
        </div>

        <div className="wizard-dots">
          <button
            type="button"
            className={eventStep === 1 ? "active" : ""}
            onClick={() => setEventStep(1)}
          >
            1
          </button>
          <button
            type="button"
            className={eventStep === 2 ? "active" : ""}
            onClick={() => setEventStep(2)}
          >
            2
          </button>
          <button
            type="button"
            className={eventStep === 3 ? "active" : ""}
            onClick={() => setEventStep(3)}
          >
            3
          </button>
        </div>
      </div>

      <form onSubmit={createEvent}>
        {eventStep === 1 && (
          <div className="wizard-step">
            <label className="field">
              <span>Название мероприятия</span>
              <input
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm({ ...eventForm, title: e.target.value })
                }
                placeholder="Например: Hackathon Minsk 2026"
              />
              <small>Так участник поймёт, к какому событию он присоединяется.</small>
            </label>

            <label className="field">
              <span>Локация</span>
              <input
                value={eventForm.location}
                onChange={(e) =>
                  setEventForm({ ...eventForm, location: e.target.value })
                }
                placeholder="Минск, офис, зал или онлайн"
              />
              <small>Можно указать город, площадку, аудиторию или онлайн-формат.</small>
            </label>

            <label className="field wide">
              <span>Короткое описание</span>
              <textarea
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm({ ...eventForm, description: e.target.value })
                }
                placeholder="Например: Нетворкинг для участников хакатона, поиска команды и обмена контактами."
              />
              <small>1–2 предложения: зачем люди здесь знакомятся.</small>
            </label>
          </div>
        )}

        {eventStep === 2 && (
          <div className="wizard-step">
            <label className="field">
              <span>Организатор</span>
              <input
                value={eventForm.organizer_name}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    organizer_name: e.target.value,
                  })
                }
                placeholder="Например: Meetings Team"
              />
              <small>Команда, компания или человек, который проводит событие.</small>
            </label>

            <label className="field">
              <span>Теги мероприятия</span>
              <input
                value={eventForm.tags}
                onChange={(e) =>
                  setEventForm({ ...eventForm, tags: e.target.value })
                }
                placeholder="backend, design, startup, AI"
              />
              <small>
                Пишите через запятую. По тегам система будет подбирать людей.
              </small>
            </label>

            <div className="tag-helper wide">
              <strong>Примеры тегов:</strong>
              <span>frontend</span>
              <span>backend</span>
              <span>design</span>
              <span>AI</span>
              <span>startup</span>
              <span>product</span>
            </div>
          </div>
        )}

        {eventStep === 3 && (
          <div className="wizard-step">
            <div className="event-preview-card wide">
              <p className="eyebrow">Проверьте данные</p>
              <h3>{eventForm.title || "Название мероприятия"}</h3>
              <p>{eventForm.description || "Описание пока не указано."}</p>

              <div className="preview-meta">
                <span>Локация: {eventForm.location || "—"}</span>
                <span>Организатор: {eventForm.organizer_name || "—"}</span>
              </div>

              <div className="tags">
                {parseCsv(eventForm.tags).length > 0 ? (
                  parseCsv(eventForm.tags).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))
                ) : (
                  <span>теги не указаны</span>
                )}
              </div>

              <div className="qr-preview-note">
                После создания мы сразу покажем QR-код, ссылку для участников,
                список участников и статистику.
              </div>
            </div>
          </div>
        )}

        <div className="wizard-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setEventStep((current) => Math.max(1, current - 1))}
            disabled={eventStep === 1}
          >
            Назад
          </button>

          {eventStep < 3 ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => setEventStep((current) => Math.min(3, current + 1))}
              disabled={eventStep === 1 && !eventForm.title.trim()}
            >
              Дальше
            </button>
          ) : (
            <button type="submit" className="primary-button">
              Создать мероприятие и QR
            </button>
          )}
        </div>
      </form>
    </section>
  </main>
)}
      {screen === "organizer-dashboard" && (
  <main className="page organizer-dashboard-page">
    <Header
      title={event?.title || "Dashboard организатора"}
      subtitle="QR-код, список участников, статистика и управление регистрацией."
      onBack={() => setScreen("organizer-home")}
    />

    <div className="dashboard-grid">
      <section className="panel">
        <p className="eyebrow">QR / ссылка</p>
        <h2>Вход для участников</h2>

        {share ? (
          <>
            <div className="qr-box">
              <QRCodeSVG value={share.qr_payload} size={180} />
            </div>
            <a href={share.join_url} target="_blank" rel="noreferrer">
              {share.join_url}
            </a>
          </>
        ) : (
          <p className="muted">QR появится после создания мероприятия.</p>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow">Регистрация</p>
        <h2>Статус</h2>

        <p>
          Сейчас регистрация:{" "}
          <strong>
            {event?.is_registration_open ? "открыта" : "закрыта"}
          </strong>
        </p>

        {event?.is_registration_open ? (
          <button
            type="button"
            className="danger-button"
            onClick={closeRegistration}
          >
            Закрыть регистрацию
          </button>
        ) : (
          <div className="closed-registration-note">
            Регистрация уже закрыта. Новые участники не смогут присоединиться.
          </div>
        )}
      </section>

      <section className="panel wide-panel">
        <div className="section-row">
          <div>
            <p className="eyebrow">Участники</p>
            <h2>Список участников</h2>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={() => loadEventBundle(eventId)}
          >
            Обновить
          </button>
        </div>

        <div className="list-grid">
          {participants.length === 0 ? (
            <p className="muted">Пока никто не зарегистрировался.</p>
          ) : (
            participants.map((participant) => (
              <article className="mini-card" key={participant.id}>
                <Avatar
                  name={participant.name}
                  src={avatars[String(participant.id)]}
                />

                <div>
                  <h3>{participant.name}</h3>
                  <p>{participant.role || "Участник"}</p>
                  <Tags tags={(participant.tags || []).slice(0, 4)} />
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel wide-panel">
        <p className="eyebrow">Статистика</p>
        <h2>Активность мероприятия</h2>

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
              <strong>{stats.matches_count}</strong>
              <span>контактов</span>
            </div>
          </div>
        ) : (
          <p className="muted">Статистика появится после загрузки.</p>
        )}
      </section>

      <section className="panel wide-panel feedback-panel">
        <p className="eyebrow">Отзывы</p>

        <div className="section-row">
          <div>
            <h2>Обратная связь участников</h2>
            <p className="muted">
              Здесь организатор видит, насколько полезным оказалось мероприятие.
            </p>
          </div>

          <div className="rating-summary">
            <strong>{averageEventRating || "—"}</strong>
            <span>
              {currentEventFeedbacks.length > 0
                ? `${currentEventFeedbacks.length} отзывов`
                : "пока нет отзывов"}
            </span>
          </div>
        </div>

        {currentEventFeedbacks.length === 0 ? (
          <div className="empty-feedback-state">
            Участники смогут оставить оценку после знакомства.
          </div>
        ) : (
          <div className="feedback-list">
            {currentEventFeedbacks.slice(0, 5).map((feedback) => (
              <article className="feedback-card" key={feedback.id}>
                <div>
                  <strong>{feedback.participant_name}</strong>
                  <span>{"★".repeat(feedback.rating)}</span>
                </div>
                <p>{feedback.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  </main>
)}

      {screen === "participant-join" && (
        <main className="page narrow participant-join-page">
          <Header
            title="Вход на событие"
            subtitle="Сканируйте QR-код или введите код встречи."
            onBack={goHome}
          />

          <section className="panel qr-entry-panel join-redesign-panel">
            <div className="join-redesign-header">
              <p className="eyebrow">Вход</p>
              <h2>Присоединиться к событию</h2>
              <p>Выберите способ входа: QR-код или код встречи.</p>
            </div>

            <div className="join-action-row">
              <button
                type="button"
                className={isQrScannerOpen ? "join-action active" : "join-action"}
                onClick={isQrScannerOpen ? stopQrScanner : startQrScanner}
              >
                <span>QR</span>
                <strong>{isQrScannerOpen ? "Камера включена" : "Сканировать QR"}</strong>
                <small>Для телефона</small>
              </button>

              <button
                type="button"
                className="join-action"
                onClick={() => document.getElementById("manual-event-code")?.focus()}
              >
                <span>ID</span>
                <strong>Ввести код</strong>
                <small>Если QR не открылся</small>
              </button>
            </div>

            {isQrScannerOpen && (
              <div className="join-camera-box">
                <video
                  ref={qrVideoRef}
                  className="qr-scanner-video"
                  muted
                  autoPlay
                  playsInline
                />
              </div>
            )}

            {qrScannerMessage && (
              <p className="qr-scanner-message join-scanner-message">
                {qrScannerMessage}
              </p>
            )}

            <form className="join-code-form" onSubmit={findEvent}>
              <label className="field">
                <span>Код встречи или ссылка</span>
                <div className="join-code-row">
                  <input
                    id="manual-event-code"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Например: 1"
                  />

                  <button type="submit" className="primary-button">
                    Найти
                  </button>
                </div>
                <small>Можно вставить ID события или полную QR-ссылку.</small>
              </label>
            </form>

            {event && (
              <div className="event-card found-event-card">
                <p className="eyebrow">Найдено</p>
                <h2>{event.title}</h2>
                <p>{event.description}</p>
                <Tags tags={event.tags || []} />

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    document
                      .getElementById("participant-entry-options")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Продолжить
                </button>
              </div>
            )}
          </section>

          {event && (
            <section
              id="participant-entry-options"
              className="panel participant-entry-options"
            >
              <p className="eyebrow">Анкета</p>
              <h2>Как войти?</h2>

              <div className="choice-grid">
                <button
                  type="button"
                  className="choice-card"
                  onClick={() => setScreen("participant-profile")}
                >
                  <strong>Создать анкету</strong>
                  <span>Фото, роль, интересы и контакты</span>
                </button>

                <button
                  type="button"
                  className="choice-card"
                  onClick={enterAsGuest}
                >
                  <strong>Войти как гость</strong>
                  <span>Быстро посмотреть людей без полной анкеты</span>
                </button>
              </div>

              {savedProfilesForEvent.length > 0 && (
                <div className="saved-box">
                  <h3>Продолжить с готовой анкетой</h3>

                  {savedProfilesForEvent.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="saved-profile"
                      onClick={() => continueWithProfile(profile.id)}
                    >
                      <span>{profile.name}</span>
                      <small>{profile.role || "Участник"}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      )}

      {screen === "participant-profile" && (
        <main className="page">
          <Header
            title="Анкета участника"
            subtitle="Короткий профиль помогает системе показать релевантных людей."
            onBack={() => setScreen("participant-join")}
          />

          <section className="panel">
            <form className="profile-layout" onSubmit={createParticipant}>
              <div className="photo-column">
                <Avatar
                  big
                  name={profileForm.name || "Meetings"}
                  src={profileForm.avatarPreview}
                />

                <label className="upload-button">
                  Добавить фото
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} />
                </label>
              </div>

              <div className="form-grid">
                <label>
                  Имя
                  <input
                    value={profileForm.name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, name: e.target.value })
                    }
                  />
                </label>

                <label>
                  Роль
                  <input
                    value={profileForm.role}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, role: e.target.value })
                    }
                    placeholder="Designer / Backend / Product"
                  />
                </label>

                <label>
                  Компания / команда
                  <input
                    value={profileForm.company}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, company: e.target.value })
                    }
                  />
                </label>

                <label>
                  Интересы
                  <input
                    value={profileForm.tags}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, tags: e.target.value })
                    }
                    placeholder="design, startup, frontend"
                  />
                </label>

                <label>
                  Кого ищу
                  <input
                    value={profileForm.looking_for}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        looking_for: e.target.value,
                      })
                    }
                    placeholder="backend, designer, team"
                  />
                </label>

                <label>
                  Telegram
                  <input
                    value={profileForm.telegram}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, telegram: e.target.value })
                    }
                    placeholder="@username"
                  />
                </label>

                <label>
                  Email
                  <input
                    value={profileForm.email}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, email: e.target.value })
                    }
                  />
                </label>

                <label>
                  LinkedIn
                  <input
                    value={profileForm.linkedin}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, linkedin: e.target.value })
                    }
                  />
                </label>

                <label className="wide">
                  О себе
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, bio: e.target.value })
                    }
                    placeholder="Кто вы, что делаете и зачем хотите познакомиться?"
                  />
                </label>

                <button type="submit" className="primary-button wide">
                  Сохранить и перейти к знакомствам
                </button>
              </div>
            </form>
          </section>
        </main>
      )}

      {screen === "participant-swipe" && (
        <main className="swipe-screen">
          <nav className="participant-nav">
            <Logo small />

            <div>
              <button type="button" onClick={openMyProfile}>
                Моя анкета
              </button>

              <button
                type="button"
                onClick={async () => {
                  await loadIncomingRequests();
                  setScreen("participant-inbox");
                }}
              >
                Кто меня лайкнул
              </button>

              <button
                type="button"
                onClick={async () => {
                  await loadContacts();
                  setScreen("participant-contacts");
                }}
              >
                Контакты
              </button>

              <button type="button" onClick={goHome}>
                Выйти
              </button>
            </div>
          </nav>

          <section className="swipe-title">
            <div>
              <p className="eyebrow">Знакомства</p>
              <h1>Люди, с которыми стоит поговорить</h1>
              {currentParticipant && (
                <p>
                  Сейчас вы: <strong>{currentParticipant.name}</strong>
                </p>
              )}
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={() => loadRecommendations()}
            >
              Обновить рекомендации
            </button>
          </section>

          <section className="card-stage">
            {activeCard ? (
              <article className="swipe-card">
                <div className="swipe-photo">
                  <Avatar
                    big
                    name={activeCard.name}
                    src={avatars[String(activeCard.id)]}
                  />
                </div>

                <div className="swipe-info">
                  <div className="card-top">
                    <div>
                      <h2>{activeCard.name}</h2>
                      <p>
                        {activeCard.role || "Участник"} ·{" "}
                        {activeCard.company || "Meetings"}
                      </p>
                    </div>

                    <span className="score">
                      {Number(activeCard.match_score || 0)} score
                    </span>
                  </div>

                  <p>{activeCard.bio || "Без описания."}</p>

                  <Tags tags={activeCard.tags || []} />

                  <div className="common-box">
                    <span>Общие интересы</span>
                    <strong>
                      {(activeCard.shared_tags || []).length
                        ? activeCard.shared_tags.join(", ")
                        : "пока нет"}
                    </strong>
                  </div>
                </div>

                <div className="swipe-actions">
                  <button type="button" className="skip-button" onClick={skipCard}>
                    Пропустить
                  </button>

                  <button type="button" className="like-button" onClick={likeCard}>
                    Хочу познакомиться
                  </button>
                </div>
              </article>
            ) : (
              <div className="empty-state">
                <h2>Анкеты закончились</h2>
                <p>
                  Вы посмотрели всех доступных участников. Можно обновить
                  рекомендации или проверить входящие запросы.
                </p>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => loadRecommendations()}
                >
                  Обновить рекомендации
                </button>
              </div>
            )}
          </section>
        </main>
      )}

      {screen === "participant-inbox" && (
        <main className="page">
          <Header
            title="Кто меня лайкнул"
            subtitle="Входящие запросы на знакомство."
            onBack={() => setScreen("participant-swipe")}
          />

          <section className="panel">
            <div className="section-row">
              <h2>Входящие запросы</h2>

              <button
                type="button"
                className="ghost-button"
                onClick={loadIncomingRequests}
              >
                Обновить
              </button>
            </div>

            <div className="request-list">
              {incomingRequests.length === 0 ? (
                <p className="muted">Пока входящих запросов нет.</p>
              ) : (
                incomingRequests.map((request) => (
                  <article className="request-card" key={request.id}>
                    <Avatar
                      name={request.from_participant.name}
                      src={avatars[String(request.from_participant.id)]}
                    />

                    <div>
                      <h3>{request.from_participant.name}</h3>
                      <p>{request.from_participant.bio}</p>
                      <small>Статус: {request.status}</small>
                    </div>

                    <div className="request-actions">
                      <button
                        type="button"
                        className="like-button"
                        onClick={() => acceptRequest(request.id)}
                      >
                        Принять
                      </button>

                      <button
                        type="button"
                        className="skip-button"
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
        </main>
      )}

      {screen === "participant-contacts" && (
  <main className="page">
    <Header
      title="Контакты"
      subtitle="Контакты открываются только после взаимного интереса."
      onBack={() => setScreen("participant-swipe")}
    />

    <section className="panel">
      <div className="section-row">
        <h2>Открытые контакты</h2>

        <button type="button" className="ghost-button" onClick={loadContacts}>
          Обновить
        </button>
      </div>

      <div className="contacts-grid">
        {contacts.length === 0 ? (
          <p className="muted">
            Контакты появятся после принятия запроса.
          </p>
        ) : (
          contacts.map((contact) => (
            <article className="contact-card" key={contact.id}>
              <Avatar name={contact.name} src={avatars[String(contact.id)]} />
              <h3>{contact.name}</h3>
              <p>{contact.role}</p>
              <span>Telegram: {contact.telegram || "—"}</span>
              <span>Email: {contact.email || "—"}</span>
              <span>LinkedIn: {contact.linkedin || "—"}</span>
            </article>
          ))
        )}
      </div>
    </section>

    <section className="panel participant-feedback-form">
      <p className="eyebrow">После мероприятия</p>
      <h2>Оцените нетворкинг</h2>

      <p className="muted">
        Ваш отзыв поможет организатору понять, были ли знакомства полезными.
      </p>

      <label className="field">
        <span>Оценка</span>
        <select
          value={feedbackRating}
          onChange={(e) => setFeedbackRating(Number(e.target.value))}
        >
          <option value={5}>5 — отлично</option>
          <option value={4}>4 — хорошо</option>
          <option value={3}>3 — нормально</option>
          <option value={2}>2 — слабо</option>
          <option value={1}>1 — не помогло</option>
        </select>
        <small>Оцените, насколько полезным был нетворкинг.</small>
      </label>

      <label className="field">
        <span>Короткий отзыв</span>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="Например: нашла человека в команду, удобно было смотреть анкеты."
        />
        <small>1–2 предложения достаточно.</small>
      </label>

      <button type="button" className="primary-button" onClick={saveEventFeedback}>
        Сохранить отзыв
      </button>
    </section>
  </main>
)}
      {showGlobalLoader && (
  <div className="loading">
    <div className="loading-card">
      <span className="loader-dot" />
      <strong>Загрузка</strong>
      <p>Пожалуйста, подождите. Мы обрабатываем действие.</p>
    </div>
  </div>
)}
    </div>
  );
}