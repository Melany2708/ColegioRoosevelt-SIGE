const localLoadFromStorage = loadFromStorage;
const localSaveToStorage = saveToStorage;
const localHandleLogin = handleLogin;
const localHandleLogout = handleLogout;
const localRecordLog = recordLog;
const localRenderSecuritySection = renderSecuritySection;
const LOGIN_PREFERENCES_KEY = "sge_login_preferences_v1";

const backendRuntime = {
  available: false,
  setupRequired: false,
  authenticated: false,
  remoteLoaded: false,
  syncTimer: null,
  syncInFlight: false,
  pendingSync: false,
  pendingAction: { action: "Actualizacion de datos centralizados", scope: "ui-mutation" },
  loginInFlight: false,
  importAttempted: false,
  lastSyncErrorAt: 0,
  snapshotSource: "local"
};

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function hydrateFromBackendWithRetry(showAuthenticatedToast, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await hydrateFromBackend(showAuthenticatedToast && attempt === 0);
      if (state.session) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(180 * (attempt + 1));
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("La sesion del servidor no pudo consolidarse en este navegador.");
}

function isHostedMode() {
  return window.location.protocol !== "file:";
}

function useNativeHostedAuth() {
  return isHostedMode();
}

function submitHostedLoginForm(form) {
  if (!form) {
    return;
  }
  HTMLFormElement.prototype.submit.call(form);
}

loadFromStorage = function loadFromStorageBackendAware(key, fallbackValue) {
  if (isHostedMode() && key === STORAGE_KEYS.session) {
    return null;
  }
  return localLoadFromStorage(key, fallbackValue);
};

saveToStorage = function saveToStorageBackendAware(key, value) {
  localSaveToStorage(key, value);
  if (!backendRuntime.available || !backendRuntime.authenticated || !backendRuntime.remoteLoaded) {
    return;
  }

  if (key === STORAGE_KEYS.data) {
    scheduleStateSync();
  }
};

handleLogin = async function handleLoginBackend(event) {
  event.preventDefault();

  if (useNativeHostedAuth()) {
    submitHostedLoginForm(event.currentTarget);
    return;
  }

  if (!backendRuntime.available) {
    localHandleLogin(event);
    return;
  }

  if (backendRuntime.setupRequired) {
    showToast("El backend esta activo, pero aun falta crear los usuarios iniciales desde la base de datos.", "error");
    return;
  }

  if (backendRuntime.loginInFlight) {
    return;
  }

  backendRuntime.loginInFlight = true;
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  const originalLabel = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Validando...";
  }

  try {
    const formData = new FormData(event.currentTarget);
    const username = normalizeText(formData.get("username"));
    const response = await apiFetch("/login", {
      method: "POST",
      body: {
        username,
        password: String(formData.get("password") || "")
      }
    });

    if (!response.ok) {
      throw new Error(response.error || "No se pudo iniciar sesion.");
    }

    await wait(150);
    await hydrateFromBackendWithRetry(true);
    if (!state.session) {
      throw new Error("El inicio fue aceptado, pero el navegador no pudo abrir la sesion. Revisa si este sitio tiene las cookies bloqueadas.");
    }

    try {
      localStorage.setItem(LOGIN_PREFERENCES_KEY, JSON.stringify({ lastUsername: username }));
    } catch (error) {
      // Ignore persistence failures for the remembered username.
    }

    showToast(`Bienvenido(a), ${state.session.name}.`);
  } catch (error) {
    showToast(error.message || "No se pudo iniciar sesion en el backend.", "error");
  } finally {
    backendRuntime.loginInFlight = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel || "Ingresar al sistema";
    }
  }
};
window.__backendHandleLogin = handleLogin;

handleLogout = async function handleLogoutBackend() {
  if (useNativeHostedAuth()) {
    window.location.assign("/api/logout-web");
    return;
  }

  if (!backendRuntime.available) {
    localHandleLogout();
    return;
  }

  try {
    await apiFetch("/logout", { method: "POST" });
  } catch (error) {
    showToast(error.message || "No se pudo cerrar la sesion del servidor.");
  }

  backendRuntime.authenticated = false;
  backendRuntime.remoteLoaded = false;
  state.session = null;
  localSaveToStorage(STORAGE_KEYS.session, null);
  renderApp();
  renderLoginStatus();
  showToast("La sesion fue cerrada correctamente.");
};
window.__backendHandleLogout = handleLogout;

recordLog = function recordLogBackend(user, action) {
  if (!backendRuntime.available || !backendRuntime.authenticated || !backendRuntime.remoteLoaded) {
    localRecordLog(user, action);
    return;
  }

  const source = user || state.session || { username: "sistema", name: "Sistema", role: "Administrador" };
  const optimisticLog = {
    id: `TMP-${Date.now()}`,
    user: source.username || "sistema",
    name: source.name || "Sistema",
    role: source.role || "Administrador",
    action,
    timestamp: new Date().toISOString()
  };

  state.logs.push(optimisticLog);
  localSaveToStorage(STORAGE_KEYS.logs, state.logs);
  if (typeof localRenderSecuritySection === "function") {
    renderSecuritySection();
  }

  apiFetch("/audit-log", {
    method: "POST",
    body: {
      action,
      details: {
        source: "frontend"
      }
    }
  }).then((response) => {
    if (!response.ok || !response.log) {
      return;
    }
    const index = state.logs.findIndex((item) => item.id === optimisticLog.id);
    if (index >= 0) {
      state.logs[index] = response.log;
      localSaveToStorage(STORAGE_KEYS.logs, state.logs);
      renderSecuritySection();
    }
  }).catch(() => {
    // Keep the optimistic entry so the UI still reflects the user action.
  });
};

renderSecuritySection = function renderSecuritySectionBackend() {
  localRenderSecuritySection();
  const container = refs.sections && refs.sections.security;
  if (!container) {
    return;
  }

  const backendStatus = backendRuntime.available ? "Backend activo" : "Modo local";
  const syncStatus = backendRuntime.available
    ? backendRuntime.syncInFlight
      ? "Sincronizando cambios con el servidor"
      : backendRuntime.remoteLoaded
        ? "Datos conectados a la base central"
        : "Esperando autenticacion"
    : "localStorage en el navegador";
  const expiresAt = state.session && state.session.expiresAt ? formatDateLong(state.session.expiresAt) : "-";

  container.insertAdjacentHTML("afterbegin", `
    <article class="glass-card backend-security-card">
      <h3>Estado del backend</h3>
      <div class="inline-metrics">
        <span class="tag">${escapeHtml(backendStatus)}</span>
        <span class="tag">${escapeHtml(syncStatus)}</span>
        <span class="tag">Fuente: ${escapeHtml(backendRuntime.snapshotSource)}</span>
      </div>
      <p class="supporting-copy">Sesion del servidor: ${escapeHtml(expiresAt)}</p>
    </article>
  `);
};

async function initializeBackend() {
  if (!isHostedMode()) {
    renderLoginStatus();
    return;
  }

  try {
    await hydrateFromBackend(false);
  } catch (error) {
    backendRuntime.available = false;
    backendRuntime.setupRequired = false;
    renderLoginStatus();
  }
}

async function hydrateFromBackend(showAuthenticatedToast) {
  const response = await apiFetch("/bootstrap", { method: "GET" }, true);
  backendRuntime.available = true;
  backendRuntime.setupRequired = Boolean(response.setupRequired);
  renderLoginStatus();

  if (!response.authenticated) {
    backendRuntime.authenticated = false;
    backendRuntime.remoteLoaded = false;
    state.session = null;
    localSaveToStorage(STORAGE_KEYS.session, null);
    renderApp();
    return response;
  }

  if (!backendRuntime.importAttempted && shouldImportLocalState(response)) {
    backendRuntime.importAttempted = true;
    await importLocalState();
    return hydrateFromBackend(showAuthenticatedToast);
  }

  backendRuntime.authenticated = true;
  backendRuntime.remoteLoaded = true;
  backendRuntime.snapshotSource = response.snapshotSource || "database";

  state.data = typeof hydrateData === "function" ? hydrateData(response.state) : response.state;
  state.logs = Array.isArray(response.logs) ? response.logs : [];
  state.session = {
    username: response.session.username,
    name: response.session.name,
    role: response.session.role,
    startedAt: response.session.startedAt,
    expiresAt: response.session.expiresAt,
    lastSeenAt: response.session.lastSeenAt
  };
  state.selectedStudentId = state.data.students[0] ? state.data.students[0].id : null;

  localSaveToStorage(STORAGE_KEYS.data, state.data);
  localSaveToStorage(STORAGE_KEYS.logs, state.logs);
  localSaveToStorage(STORAGE_KEYS.session, state.session);
  renderApp();

  if (showAuthenticatedToast) {
    showToast("Sesion validada contra el servidor.");
  }

  return response;
}

function shouldImportLocalState(response) {
  if (!response || !response.authenticated) {
    return false;
  }
  if (response.user.role !== "Administrador") {
    return false;
  }
  if (response.snapshotSource !== "default") {
    return false;
  }

  const localData = localLoadFromStorage(STORAGE_KEYS.data, null);
  if (!localData || !Array.isArray(localData.students) || !localData.students.length) {
    return false;
  }

  const localShape = JSON.stringify({
    students: localData.students.length,
    payments: Array.isArray(localData.payments) ? localData.payments.length : 0,
    template: Boolean(localData.school && localData.school.documentTemplate)
  });
  const remoteState = response.state || {};
  const remoteShape = JSON.stringify({
    students: Array.isArray(remoteState.students) ? remoteState.students.length : 0,
    payments: Array.isArray(remoteState.payments) ? remoteState.payments.length : 0,
    template: Boolean(remoteState.school && remoteState.school.documentTemplate)
  });

  return localShape !== remoteShape;
}

async function importLocalState() {
  const localData = localLoadFromStorage(STORAGE_KEYS.data, null);
  const localLogs = localLoadFromStorage(STORAGE_KEYS.logs, []);
  if (!localData) {
    return;
  }

  await apiFetch("/import-local", {
    method: "POST",
    body: {
      state: localData,
      logs: Array.isArray(localLogs) ? localLogs : []
    }
  });
  showToast("Se migraron los datos locales del navegador a la base central.");
}

function scheduleStateSync(action = "Actualizacion de datos centralizados", scope = "ui-mutation") {
  backendRuntime.pendingAction = { action, scope };
  if (backendRuntime.syncTimer) {
    window.clearTimeout(backendRuntime.syncTimer);
  }
  backendRuntime.syncTimer = window.setTimeout(flushStateSync, 300);
}

async function flushStateSync() {
  if (!backendRuntime.available || !backendRuntime.authenticated || !backendRuntime.remoteLoaded) {
    return;
  }

  if (backendRuntime.syncInFlight) {
    backendRuntime.pendingSync = true;
    return;
  }

  backendRuntime.syncInFlight = true;
  try {
    await apiFetch("/state", {
      method: "POST",
      body: {
        state: state.data,
        action: backendRuntime.pendingAction.action,
        scope: backendRuntime.pendingAction.scope
      }
    });
  } catch (error) {
    const now = Date.now();
    if (now - backendRuntime.lastSyncErrorAt > 4000) {
      backendRuntime.lastSyncErrorAt = now;
      showToast("No se pudo sincronizar con el servidor. Se mantiene una copia local temporal.");
    }
  } finally {
    backendRuntime.syncInFlight = false;
    if (backendRuntime.pendingSync) {
      backendRuntime.pendingSync = false;
      scheduleStateSync();
    }
    renderSecuritySection();
  }
}

async function apiFetch(path, options = {}, allowAnonymous = false) {
  const requestOptions = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  };

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api${path}`, requestOptions);
  const payload = await readApiPayload(response);
  if (!response.ok && !allowAnonymous) {
    throw new Error(payload.error || `Error ${response.status}`);
  }
  if (!response.ok && allowAnonymous) {
    throw new Error(payload.error || `Error ${response.status}`);
  }
  return payload;
}

async function readApiPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { ok: response.ok, error: "La respuesta del servidor no fue JSON." };
  }
  return response.json();
}

function renderLoginStatus() {
  const credentialsList = document.querySelector(".credentials");
  const helperText = document.querySelector(".helper-text");
  const accessCard = credentialsList ? credentialsList.closest(".hero-card") : null;
  const title = accessCard ? accessCard.querySelector("h2") : null;

  if (title) {
    title.textContent = backendRuntime.available ? "Acceso administrado" : "Accesos locales";
  }

  if (credentialsList) {
    if (backendRuntime.available && backendRuntime.setupRequired) {
      credentialsList.innerHTML = `
        <li>Backend detectado correctamente.</li>
        <li>Falta ejecutar <code>db/schema.sql</code> y <code>npm run seed:users</code>.</li>
        <li>Despues de eso el login quedara controlado por la base de datos.</li>
      `;
    } else if (backendRuntime.available) {
      credentialsList.innerHTML = `
        <li>La autenticacion ya se valida desde el servidor.</li>
        <li>Las credenciales viven en la base de datos centralizada.</li>
        <li>Las sesiones usan cookies seguras y control del lado servidor.</li>
      `;
    } else {
      credentialsList.innerHTML = `
        <li>Verificando acceso institucional...</li>
        <li>Ingresa con tu usuario y contrasena asignados.</li>
        <li>El acceso se muestra con informacion institucional.</li>
      `;
    }
  }

  if (helperText) {
    helperText.textContent = backendRuntime.available
      ? "La sesion activa se valida desde el servidor y se registra en la bitacora centralizada."
      : "El ultimo usuario usado queda recordado en este navegador; la contrasena no se guarda en texto plano.";
  }
}

function rebindAuthControlsToBackend() {
  if (refs.loginForm) {
    refs.loginForm.removeEventListener("submit", localHandleLogin);
    refs.loginForm.removeEventListener("submit", handleLogin);
    if (!useNativeHostedAuth()) {
      refs.loginForm.addEventListener("submit", handleLogin);
    }
  }

  if (useNativeHostedAuth()) {
    return;
  }

  const logoutButton = document.getElementById("logoutBtn");
  if (logoutButton) {
    logoutButton.removeEventListener("click", localHandleLogout);
    logoutButton.removeEventListener("click", handleLogout);
    logoutButton.addEventListener("click", handleLogout);
  }
}

function interceptAuthSubmit(event) {
  if (event.target?.id !== "loginForm") {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  handleLogin({
    preventDefault() {},
    currentTarget: event.target
  });
}

function interceptAuthClick(event) {
  const logoutButton = event.target?.closest?.("#logoutBtn");
  if (!logoutButton) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  handleLogout();
}

document.addEventListener("DOMContentLoaded", () => {
  rebindAuthControlsToBackend();
  if (!useNativeHostedAuth()) {
    document.addEventListener("submit", interceptAuthSubmit, true);
    document.addEventListener("click", interceptAuthClick, true);
  }
  renderLoginStatus();
  initializeBackend();
});

