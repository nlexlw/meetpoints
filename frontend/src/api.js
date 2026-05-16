const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.detail;

    if (typeof detail === "string") {
      throw new Error(detail);
    }

    if (Array.isArray(detail)) {
      throw new Error(detail.map((item) => item.msg).join(", "));
    }

    throw new Error("Request failed");
  }

  return data;
}

export const api = {
  health() {
    return apiRequest("/health");
  },

  createEvent(payload) {
    return apiRequest("/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getEvent(eventId) {
    return apiRequest(`/events/${eventId}`);
  },

  closeEvent(eventId) {
    return apiRequest(`/events/${eventId}/close`, {
      method: "PATCH",
    });
  },

  getEventShare(eventId) {
    return apiRequest(`/events/${eventId}/share`);
  },

  getEventStats(eventId) {
    return apiRequest(`/events/${eventId}/stats`);
  },

  createParticipant(eventId, payload) {
    return apiRequest(`/events/${eventId}/participants`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getParticipants(eventId, tag = "") {
    const query = tag ? `?tag=${encodeURIComponent(tag)}` : "";
    return apiRequest(`/events/${eventId}/participants${query}`);
  },

  getRecommendations(eventId, participantId) {
    return apiRequest(
      `/events/${eventId}/participants/${participantId}/recommendations`
    );
  },

  sendRequest(payload) {
    return apiRequest("/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  acceptRequest(requestId) {
    return apiRequest(`/requests/${requestId}/accept`, {
      method: "PATCH",
    });
  },

  skipRequest(requestId) {
    return apiRequest(`/requests/${requestId}/skip`, {
      method: "PATCH",
    });
  },

  getIncomingRequests(participantId) {
    return apiRequest(`/participants/${participantId}/incoming-requests`);
  },

  getContacts(participantId) {
    return apiRequest(`/participants/${participantId}/contacts`);
  },
};