(function attachDiexSupabase() {
  const config = window.DIEX_SUPABASE_CONFIG || {};
  const sessionStorageKey = "diex-invel-supabase-session-v1";
  const snapshotKey = "local_state_snapshot_v1";
  const defaultOrganizationId = "00000000-0000-0000-0000-000000000001";

  let session = readStoredSession();
  let context = null;

  function isConfigured() {
    return Boolean(config.url && config.publishableKey);
  }

  function readStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionStorageKey) || "null");
    } catch (error) {
      return null;
    }
  }

  function storeSession(nextSession) {
    session = nextSession;
    if (nextSession) localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
    else localStorage.removeItem(sessionStorageKey);
    return session;
  }

  function sessionWithExpiry(payload) {
    if (!payload?.access_token) return null;
    return {
      ...payload,
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600)
    };
  }

  async function request(path, options = {}, accessToken = session?.access_token) {
    if (!isConfigured()) throw new Error("Supabase no está configurado.");
    const response = await fetch(`${config.url}${path}`, {
      ...options,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken || config.publishableKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch (error) { payload = text; }
    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.error || `Error HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    try {
      const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token })
      }, null);
      return storeSession(sessionWithExpiry(refreshed));
    } catch (error) {
      storeSession(null);
      context = null;
      return null;
    }
  }

  async function getSession() {
    if (!session) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 60) return refreshSession();
    return session;
  }

  async function signIn(email, password) {
    const authenticated = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }, null);
    context = null;
    return storeSession(sessionWithExpiry(authenticated));
  }

  async function signUp(email, password, fullName) {
    const registered = await request("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { full_name: fullName } })
    }, null);
    if (registered?.access_token) storeSession(sessionWithExpiry(registered));
    return registered;
  }

  async function signOut() {
    const activeSession = await getSession();
    if (activeSession?.access_token) {
      try { await request("/auth/v1/logout", { method: "POST" }); } catch (error) { console.warn("No se pudo cerrar sesión remota", error); }
    }
    context = null;
    storeSession(null);
  }

  async function rest(table, params = {}, accessToken) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => search.set(key, value));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request(`/rest/v1/${table}${suffix}`, {}, accessToken);
  }

  async function restWrite(table, method, params, body, accessToken) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => search.set(key, value));
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request(`/rest/v1/${table}${suffix}`, {
      method,
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify(body)
    }, accessToken);
  }

  async function getUserContext() {
    const activeSession = await getSession();
    if (!activeSession?.user?.id) return null;
    if (context?.userId === activeSession.user.id) return context;

    const memberships = await rest("organization_members", {
      select: "organization_id,role",
      user_id: `eq.${activeSession.user.id}`,
      active: "eq.true",
      limit: "1"
    });
    if (!memberships?.length) throw new Error("Tu usuario aún no pertenece a una organización.");

    const membership = memberships[0];
    const profiles = await rest("user_profiles", {
      select: "id,full_name,phone",
      id: `eq.${activeSession.user.id}`,
      limit: "1"
    });
    const organizations = await rest("organizations", {
      select: "id,trade_name,currency,timezone",
      id: `eq.${membership.organization_id}`,
      limit: "1"
    });
    context = {
      userId: activeSession.user.id,
      email: activeSession.user.email || "",
      fullName: profiles?.[0]?.full_name || activeSession.user.email || "Usuario",
      organizationId: membership.organization_id || defaultOrganizationId,
      organization: organizations?.[0] || null,
      role: membership.role
    };
    return context;
  }

  async function saveLocalSnapshot(state) {
    const activeSession = await getSession();
    const currentContext = await getUserContext();
    if (!activeSession || !currentContext) throw new Error("Inicia sesión para guardar una copia en Supabase.");
    return restWrite("app_settings", "POST", { on_conflict: "organization_id,key" }, {
      organization_id: currentContext.organizationId,
      key: snapshotKey,
      value_json: state,
      updated_by: currentContext.userId
    }, activeSession.access_token);
  }

  async function loadLocalSnapshot() {
    const activeSession = await getSession();
    const currentContext = await getUserContext();
    if (!activeSession || !currentContext) throw new Error("Inicia sesión para descargar la copia de Supabase.");
    const rows = await rest("app_settings", {
      select: "value_json,updated_at",
      organization_id: `eq.${currentContext.organizationId}`,
      key: `eq.${snapshotKey}`,
      limit: "1"
    }, activeSession.access_token);
    return rows?.[0] || null;
  }

  async function connectionStatus() {
    if (!isConfigured()) return { configured: false, session: null, context: null };
    const activeSession = await getSession();
    if (!activeSession) return { configured: true, session: null, context: null };
    return { configured: true, session: activeSession, context: await getUserContext() };
  }

  window.DiexSupabase = Object.freeze({
    isConfigured,
    getSession,
    signIn,
    signUp,
    signOut,
    getUserContext,
    saveLocalSnapshot,
    loadLocalSnapshot,
    connectionStatus,
    snapshotKey
  });
})();
