(function attachDiexSupabase() {
  const config = window.DIEX_SUPABASE_CONFIG || {};
  const sessionStorageKey = "diex-invel-supabase-session-v1";
  const snapshotKey = "local_state_snapshot_v1";
  const defaultOrganizationId = "00000000-0000-0000-0000-000000000001";
  const usernamePattern = /^[A-Za-z0-9]{3,15}$/;
  const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,10}$/;
  const authDomain = "auth.diex.local";

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateUsername(value) {
    const username = normalizeUsername(value);
    if (!usernamePattern.test(username)) throw new Error("El usuario debe tener entre 3 y 15 caracteres, solo letras y números.");
    return username;
  }

  function validatePassword(value) {
    const password = String(value || "");
    if (!passwordPattern.test(password)) throw new Error("La contraseña debe tener entre 6 y 10 caracteres e incluir letras y números.");
    return password;
  }

  function authEmailForUsername(username) {
    return `${validateUsername(username)}@${authDomain}`;
  }

  function usernameFromAuthEmail(email) {
    return normalizeUsername(String(email || "").split("@")[0]);
  }

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
      const rawMessage = payload?.message || payload?.error_description || payload?.error || `Error HTTP ${response.status}`;
      const message = response.status === 400 && /invalid login credentials/i.test(rawMessage)
        ? "Usuario o contraseña incorrectos."
        : rawMessage;
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

  async function signIn(username, password) {
    const authEmail = authEmailForUsername(username);
    validatePassword(password);
    const authenticated = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: authEmail, password })
    }, null);
    context = null;
    return storeSession(sessionWithExpiry(authenticated));
  }

  async function signUp(username, password, fullName) {
    const normalizedUsername = validateUsername(username);
    validatePassword(password);
    const registered = await request("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email: authEmailForUsername(normalizedUsername),
        password,
        data: { username: normalizedUsername, full_name: fullName }
      })
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
      body: body === undefined ? undefined : JSON.stringify(body)
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
      select: "id,username,full_name,phone",
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
      username: profiles?.[0]?.username || usernameFromAuthEmail(activeSession.user.email),
      fullName: profiles?.[0]?.full_name || profiles?.[0]?.username || usernameFromAuthEmail(activeSession.user.email) || "Usuario",
      organizationId: membership.organization_id || defaultOrganizationId,
      organization: organizations?.[0] || null,
      role: membership.role
    };
    return context;
  }

  async function requireAdminContext() {
    const currentContext = await getUserContext();
    if (!currentContext || currentContext.role !== "admin") throw new Error("Solo un administrador puede gestionar esta sección.");
    return currentContext;
  }

  async function listAdministration() {
    const currentContext = await requireAdminContext();
    const organizationId = currentContext.organizationId;
    const [organizations, branches, warehouses, members, profiles, invitations] = await Promise.all([
      rest("organizations", { select: "id,legal_name,trade_name,tax_id,currency,timezone,active", id: `eq.${organizationId}`, limit: "1" }),
      rest("branches", { select: "id,code,name,address,phone,active,created_at", organization_id: `eq.${organizationId}`, order: "name.asc" }),
      rest("warehouses", { select: "id,branch_id,code,name,warehouse_type,active,created_at", organization_id: `eq.${organizationId}`, order: "name.asc" }),
      rest("organization_members", { select: "organization_id,user_id,role,branch_id,warehouse_id,active,created_at,updated_at", organization_id: `eq.${organizationId}`, order: "created_at.asc" }),
      rest("user_profiles", { select: "id,username,full_name,document_number,phone,active,created_at,updated_at", order: "full_name.asc" }),
      rest("user_invitations", { select: "id,username,full_name,phone,role,branch_id,warehouse_id,active,created_at,accepted_at", organization_id: `eq.${organizationId}`, order: "created_at.desc" })
    ]);
    const memberIds = new Set((members || []).map((member) => member.user_id));
    return {
      organization: organizations?.[0] || currentContext.organization || null,
      branches: branches || [],
      warehouses: warehouses || [],
      members: (members || []).map((member) => ({ ...member, profile: (profiles || []).find((profile) => profile.id === member.user_id) || null })),
      invitations: invitations || [],
      profiles: (profiles || []).filter((profile) => memberIds.has(profile.id))
    };
  }

  async function createAdministrationUser(input) {
    const currentContext = await requireAdminContext();
    const username = validateUsername(input.username);
    const existingProfiles = await rest("user_profiles", { select: "id,username,full_name,phone", username: `eq.${username}`, limit: "1" });
    const profile = existingProfiles?.[0];
    const memberPayload = {
      organization_id: currentContext.organizationId,
      user_id: profile?.id,
      role: input.role || "sales",
      branch_id: input.branchId || null,
      warehouse_id: input.warehouseId || null,
      active: true
    };

    if (profile?.id) {
      const existingMembership = await rest("organization_members", {
        select: "organization_id,user_id",
        organization_id: `eq.${currentContext.organizationId}`,
        user_id: `eq.${profile.id}`,
        limit: "1"
      });
      if (existingMembership?.length) {
        await restWrite("organization_members", "PATCH", { organization_id: `eq.${currentContext.organizationId}`, user_id: `eq.${profile.id}` }, memberPayload);
      } else {
        await restWrite("organization_members", "POST", {}, memberPayload);
      }
      await restWrite("user_profiles", "PATCH", { id: `eq.${profile.id}` }, {
        full_name: input.fullName || profile.full_name || username,
        phone: input.phone || profile.phone || null,
        active: true
      });
      return { kind: "member", username };
    }

    await restWrite("user_invitations", "POST", { on_conflict: "organization_id,email" }, {
      organization_id: currentContext.organizationId,
      username,
      email: authEmailForUsername(username),
      full_name: input.fullName || username,
      phone: input.phone || null,
      role: input.role || "sales",
      branch_id: input.branchId || null,
      warehouse_id: input.warehouseId || null,
      active: true,
      invited_by: currentContext.userId
    });
    return { kind: "invitation", username };
  }

  async function updateAdministrationUser(input) {
    const currentContext = await requireAdminContext();
    if (!input.userId) throw new Error("Usuario no válido.");
    if (input.userId === currentContext.userId && input.role !== "admin") throw new Error("No puedes quitarte el rol de administrador desde tu propia sesión.");
    await restWrite("organization_members", "PATCH", {
      organization_id: `eq.${currentContext.organizationId}`,
      user_id: `eq.${input.userId}`
    }, {
      role: input.role,
      branch_id: input.branchId || null,
      warehouse_id: input.warehouseId || null,
      active: input.active !== false
    });
    await restWrite("user_profiles", "PATCH", { id: `eq.${input.userId}` }, {
      full_name: input.fullName,
      phone: input.phone || null,
      document_number: input.documentNumber || null
    });
  }

  async function setAdministrationUserActive(userId, active) {
    const currentContext = await requireAdminContext();
    if (userId === currentContext.userId && !active) throw new Error("No puedes inactivar tu propio acceso.");
    return restWrite("organization_members", "PATCH", {
      organization_id: `eq.${currentContext.organizationId}`,
      user_id: `eq.${userId}`
    }, { active });
  }

  async function removeAdministrationUser(userId) {
    const currentContext = await requireAdminContext();
    if (userId === currentContext.userId) throw new Error("No puedes eliminar tu propio acceso.");
    return restWrite("organization_members", "DELETE", {
      organization_id: `eq.${currentContext.organizationId}`,
      user_id: `eq.${userId}`
    });
  }

  async function setInvitationActive(invitationId, active) {
    await requireAdminContext();
    return restWrite("user_invitations", "PATCH", { id: `eq.${invitationId}` }, { active });
  }

  async function updateInvitation(invitationId, input) {
    const currentContext = await requireAdminContext();
    return restWrite("user_invitations", "PATCH", {
      id: `eq.${invitationId}`,
      organization_id: `eq.${currentContext.organizationId}`
    }, {
      username: validateUsername(input.username),
      email: authEmailForUsername(input.username),
      full_name: input.fullName,
      phone: input.phone || null,
      role: input.role,
      branch_id: input.branchId || null,
      warehouse_id: input.warehouseId || null
    });
  }

  async function deleteInvitation(invitationId) {
    await requireAdminContext();
    return restWrite("user_invitations", "DELETE", { id: `eq.${invitationId}` });
  }

  async function saveAdministrationOrganization(input) {
    const currentContext = await requireAdminContext();
    return restWrite("organizations", "PATCH", { id: `eq.${currentContext.organizationId}` }, {
      legal_name: input.legalName,
      trade_name: input.tradeName,
      tax_id: input.taxId || null,
      currency: input.currency || "PEN",
      timezone: input.timezone || "America/Lima"
    });
  }

  async function createAdministrationBranch(input) {
    const currentContext = await requireAdminContext();
    return restWrite("branches", "POST", {}, {
      organization_id: currentContext.organizationId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      active: true
    });
  }

  async function updateAdministrationBranch(id, input) {
    const currentContext = await requireAdminContext();
    return restWrite("branches", "PATCH", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` }, {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null
    });
  }

  async function setAdministrationBranchActive(id, active) {
    const currentContext = await requireAdminContext();
    return restWrite("branches", "PATCH", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` }, { active });
  }

  async function deleteAdministrationBranch(id) {
    const currentContext = await requireAdminContext();
    return restWrite("branches", "DELETE", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` });
  }

  async function createAdministrationWarehouse(input) {
    const currentContext = await requireAdminContext();
    return restWrite("warehouses", "POST", {}, {
      organization_id: currentContext.organizationId,
      branch_id: input.branchId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      warehouse_type: input.type || "store",
      active: true
    });
  }

  async function updateAdministrationWarehouse(id, input) {
    const currentContext = await requireAdminContext();
    return restWrite("warehouses", "PATCH", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` }, {
      branch_id: input.branchId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      warehouse_type: input.type || "store"
    });
  }

  async function setAdministrationWarehouseActive(id, active) {
    const currentContext = await requireAdminContext();
    return restWrite("warehouses", "PATCH", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` }, { active });
  }

  async function deleteAdministrationWarehouse(id) {
    const currentContext = await requireAdminContext();
    return restWrite("warehouses", "DELETE", { id: `eq.${id}`, organization_id: `eq.${currentContext.organizationId}` });
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
    listAdministration,
    createAdministrationUser,
    updateAdministrationUser,
    setAdministrationUserActive,
    removeAdministrationUser,
    setInvitationActive,
    updateInvitation,
    deleteInvitation,
    saveAdministrationOrganization,
    createAdministrationBranch,
    updateAdministrationBranch,
    setAdministrationBranchActive,
    deleteAdministrationBranch,
    createAdministrationWarehouse,
    updateAdministrationWarehouse,
    setAdministrationWarehouseActive,
    deleteAdministrationWarehouse,
    connectionStatus,
    snapshotKey
  });
})();
