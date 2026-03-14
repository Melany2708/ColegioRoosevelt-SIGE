(function () {
  "use strict";

  const hasFn = (value) => typeof value === "function";
  const hasObj = (value) => value && typeof value === "object";

  if (!hasObj(window.state)) {
    console.error("backend.js: window.state no existe. Carga app.js antes que backend.js.");
    return;
  }

  if (!hasObj(window.refs)) {
    console.error("backend.js: window.refs no existe. Carga app.js antes que backend.js.");
    return;
  }

  if (!hasObj(window.STORAGE_KEYS)) {
    console.error("backend.js: STORAGE_KEYS no existe. Carga app.js antes que backend.js.");
    return;
  }

  const fallbackLoadFromStorage = function (key, fallbackValue) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallbackValue;
      return JSON.parse(raw);
    } catch (error) {
      return fallbackValue;
    }
  };

  const fallbackSaveToStorage = function (key, value) {
    try {
      if (value === null) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // ignore
    }
  };

  const localLoadFromStorage = hasFn(window.loadFromStorage) ? window.loadFromStorage : fallbackLoadFromStorage;
  const localSaveToStorage = hasFn(window.saveToStorage) ? window.saveToStorage : fallbackSaveToStorage;
  const localHandleLogin = hasFn(window.handleLogin) ? window.handleLogin : async function () {};
  const localHandleLogout = hasFn(window.handleLogout) ? window.handleLogout : async function () {};
  const localRecordLog = hasFn(window.recordLog) ? window.recordLog : function () {};
  const localRenderSecuritySection = hasFn(window.renderSecuritySection) ? window.renderSecuritySection : function () {};

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

  window.__backendRuntime = backendRuntime;

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function isHostedMode() {
    return window.location.protocol !== "file:";
  }

  function useNativeHostedAuth() {
    return isHostedMode();
  }

  function submitHostedLoginForm(form) {
    if (!form) return;
    HTMLFormElement.prototype.submit.call(form);
  }

  async function hydrateFromBackendWithRetry(showAuthenticatedToast, attempts) {
    const totalAttempts = typeof attempts === "number" ? attempts : 4;
    let lastError = null;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      try {
        const response = await hydrateFromBackend(showAuthenticatedToast && attempt === 0);
        if (window.state.session) {
          return response;
        }
      } catch (error) {
        lastError = error;
      }
      await wait(180 * (attempt + 1));
    }

    if (lastError) throw lastError;
    throw new Error("La sesion del servidor no pudo consolidarse en este navegador.");
  }

  window.__sgeHydrateFromBackend = hydrateFromBackendWithRetry;

  window.loadFromStorage = function (key, fallbackValue) {
    if (isHostedMode() && key === window.STORAGE_KEYS.session) {
      return null;
    }
    return localLoadFromStorage(key, fallbackValue);
  };

  window.saveToStorage = function (key, value) {
    localSaveToStorage(key, value);

    if (!backendRuntime.available || !backendRuntime.authenticated || !backendRuntime.remoteLoaded) {
      return;
    }

    if (key === window.STORAGE_KEYS.data) {
      scheduleStateSync();
    }
  };

  window.handleLogin = async function (event) {
    if (event && hasFn(event.preventDefault)) {
      event.preventDefault();
    }

    const currentTarget = (event && event.currentTarget) || window.refs.loginForm || null;

    if (useNativeHostedAuth()) {
      submitHostedLoginForm(currentTarget);
      return;
    }

    if (!backendRuntime.available) {
      return localHandleLogin(event);
    }

    if (backendRuntime.setupRequired) {
      if (hasFn(window.showToast)) {
        window.showToast("El backend esta activo, pero aun falta crear los usuarios iniciales desde la base de datos.", "error");
      }
      return;
    }

    if (backendRuntime.loginInFlight) {
      return;
    }

    backendRuntime.loginInFlight = true;

    const submitButton = currentTarget ? currentTarget.querySelector('button[type="submit"]') : null;
    const originalLabel = submitButton ? submitButton.textContent : "";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Validando...";
    }

    try {
      const formData = new FormData(currentTarget);
      const username = hasFn(window.normalizeText)
        ? window.normalizeText(formData.get("username"))
        : String(formData.get("username") || "").trim().toLowerCase();

      const response = await apiFetch("/login", {
        method: "POST",
        body: {
          username: username,
          password: String(formData.get("password") || "")
        }
      });

      if (!response.ok) {
        throw new Error(response.error || "No se pudo iniciar sesion.");
      }

      await wait(150);
      await hydrateFromBackendWithRetry(true);

      if (!window.state.session) {
        throw new Error("El inicio fue aceptado, pero el navegador no pudo abrir la sesion. Revisa si este sitio tiene las cookies bloqueadas.");
      }

      try {
        window.localStorage.setItem(
          LOGIN_PREFERENCES_KEY,
          JSON.stringify({ lastUsername: username })
        );
      } catch (error) {
        // ignore
      }

      if (hasFn(window.showToast)) {
        window.showToast("Bienvenido(a), " + window.state.session.name + ".");
      }
    } catch (error) {
      if (hasFn(window.showToast)) {
        window.showToast(error.message || "No se pudo iniciar sesion en el backend.", "error");
      }
    } finally {
      backendRuntime.loginInFlight = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel || "Ingresar al sistema";
      }
    }
  };

  window.__backendHandleLogin = window.handleLogin;

  window.handleLogout = async function () {
    if (useNativeHostedAuth()) {
      window.location.assign("/api/logout-web");
      return;
    }

    if (!backendRuntime.available) {
      return localHandleLogout();
    }

    try {
      await apiFetch("/logout", { method: "POST" });
    } catch (error) {
      if (hasFn(window.showToast)) {
        window.showToast(error.message || "No se pudo cerrar la sesion del servidor.");
      }
    }

    backendRuntime.authenticated = false;
    backendRuntime.remoteLoaded = false;
    window.state.session = null;
    localSaveToStorage(window.STORAGE_KEYS.session, null);

    if (hasFn(window.renderApp)) {
      window.renderApp();
    }
    renderLoginStatus();

    if (hasFn(window.showToast)) {
      window.showToast("La sesion fue cerrada correctamente.");
    }
  };

  window.__backendHandleLogout = window.handleLogout;

  window.recordLog = function (user, action) {
    if (!backendRuntime.available || !backendRuntime.authenticated || !backendRuntime.remoteLoaded) {
      localRecordLog(user, action);
      return;
    }

    const source = user || window.state.session || {
      username: "sistema",
      name: "Sistema",
      role: "Administrador"
    };

    const optimisticLog = {
      id: "TMP-" + Date.now(),
      user: source.username || "sistema",
      name: source.name || "Sistema",
      role: source.role || "Administrador",
      action: action,
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(window.state.logs)) {
      window.state.logs = [];
    }

    window.state.logs.push(optimisticLog);
    localSaveToStorage(window.STORAGE_KEYS.logs, window.state.logs);

    if (hasFn(localRenderSecuritySection)) {
      window.renderSecuritySection();
    }

    apiFetch("/audit-log", {
      method: "POST",
      body: {
        action: action,
        details: {
          source: "frontend"
        }
      }
    })
      .then(function (response) {
        if (!response.ok || !response.log) {
          return;
        }

        const index = window.state.logs.findIndex(function (item) {
          return item.id === optimisticLog.id;
        });

        if (index >= 0) {
          window.state.logs[index] = response.log;
          localSaveToStorage(window.STORAGE_KEYS.logs, window.state.logs);
          if (hasFn(window.renderSecuritySection)) {
            window.renderSecuritySection();
          }
        }
      })
      .catch(function () {
        // keep optimistic log
      });
  };

  window.renderSecuritySection = function () {
    localRenderSecuritySection();

    const container = window.refs.sections && window.refs.sections.security;
    if (!container) {
      return;
    }

    const backendStatus = backendRuntime.available ? "Backend activo" : "Modo local";
    const syncStatus = backendRuntime.available
      ? (backendRuntime.syncInFlight
          ? "Sincronizando cambios con el servidor"
          : (backendRuntime.remoteLoaded
              ? "Datos conectados a la base central"
              : "Esperando autenticacion"))
      : "localStorage en el navegador";

    const expiresAt =
      window.state.session &&
      window.state.session.expiresAt &&
      hasFn(window.formatDateLong)
        ? window.formatDateLong(window.state.session.expiresAt)
        : "-";

    const escapeHtml = hasFn(window.escapeHtml) ? window.escapeHtml : function (value) {
      return String(value || "");
    };

    container.insertAdjacentHTML(
      "afterbegin",
      '<article class="glass-card backend-security-card">' +
        "<h3>Estado del backend</h3>" +
        '<div class="inline-metrics">' +
          '<span class="tag">' + escapeHtml(backendStatus) + "</span>" +
          '<span class="tag">' + escapeHtml(syncStatus) + "</span>" +
          '<span class="tag">Fuente: ' + escapeHtml(backendRuntime.snapshotSource) + "</span>" +
        "</div>" +
        '<p class="supporting-copy">Sesion del servidor: ' + escapeHtml(expiresAt) + "</p>" +
      "</article>"
    );
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
      console.error("initializeBackend:", error);
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
      window.state.session = null;
      localSaveToStorage(window.STORAGE_KEYS.session, null);

      if (hasFn(window.renderApp)) {
        window.renderApp();
      }

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

    window.state.data = hasFn(window.hydrateData) ? window.hydrateData(response.state) : response.state;
    window.state.logs = Array.isArray(response.logs) ? response.logs : [];
    window.state.session = {
      username: response.session.username,
      name: response.session.name,
      role: response.session.role,
      startedAt: response.session.startedAt,
      expiresAt: response.session.expiresAt,
      lastSeenAt: response.session.lastSeenAt
    };

    window.state.selectedStudentId =
      window.state.data &&
      Array.isArray(window.state.data.students) &&
      window.state.data.students[0]
        ? window.state.data.students[0].id
        : null;

    localSaveToStorage(window.STORAGE_KEYS.data, window.state.data);
    localSaveToStorage(window.STORAGE_KEYS.logs, window.state.logs);
    localSaveToStorage(window.STORAGE_KEYS.session, window.state.session);

    if (hasFn(window.renderApp)) {
      window.renderApp();
    }

    if (showAuthenticatedToast && hasFn(window.showToast)) {
      window.showToast("Sesion validada contra el servidor.");
    }

    return response;
  }

  function shouldImportLocalState(response) {
    if (!response || !response.authenticated) return false;
    if (!response.user || response.user.role !== "Administrador") return false;
    if (response.snapshotSource !== "default") return false;

    const localData = localLoadFromStorage(window.STORAGE_KEYS.data, null);
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
    const localData = localLoadFromStorage(window.STORAGE_KEYS.data, null);
    const localLogs = localLoadFromStorage(window.STORAGE_KEYS.logs, []);

    if (!localData) return;

    await apiFetch("/import-local", {
      method: "POST",
      body: {
        state: localData,
        logs: Array.isArray(localLogs) ? localLogs : []
      }
    });

    if (hasFn(window.showToast)) {
      window.showToast("Se migraron los datos locales del navegador a la base central.");
    }
  }

  function scheduleStateSync(action, scope) {
    backendRuntime.pendingAction = {
      action: action || "Actualizacion de datos centralizados",
      scope: scope || "ui-mutation"
    };

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
          state: window.state.data,
          action: backendRuntime.pendingAction.action,
          scope: backendRuntime.pendingAction.scope
        }
      });
    } catch (error) {
      const now = Date.now();
      if (now - backendRuntime.lastSyncErrorAt > 4000) {
        backendRuntime.lastSyncErrorAt = now;
        if (hasFn(window.showToast)) {
          window.showToast("No se pudo sincronizar con el servidor. Se mantiene una copia local temporal.");
        }
      }
    } finally {
      backendRuntime.syncInFlight = false;

      if (backendRuntime.pendingSync) {
        backendRuntime.pendingSync = false;
        scheduleStateSync();
      }

      if (hasFn(window.renderSecuritySection)) {
        window.renderSecuritySection();
      }
    }
  }

  async function apiFetch(path, options, allowAnonymous) {
    const opts = options || {};
    const anonymous = Boolean(allowAnonymous);

    const requestOptions = {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: Object.assign(
        {},
        opts.body ? { "content-type": "application/json" } : {},
        opts.headers || {}
      )
    };

    if (opts.body) {
      requestOptions.body = JSON.stringify(opts.body);
    }

    const response = await fetch("/api" + path, requestOptions);
    const payload = await readApiPayload(response);

    if (!response.ok && !anonymous) {
      throw new Error(payload.error || ("Error " + response.status));
    }

    if (!response.ok && anonymous) {
      throw new Error(payload.error || ("Error " + response.status));
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
        credentialsList.innerHTML =
          "<li>Backend detectado correctamente.</li>" +
          "<li>Falta ejecutar <code>db/schema.sql</code> y <code>npm run seed:users</code>.</li>" +
          "<li>Despues de eso el login quedara controlado por la base de datos.</li>";
      } else if (backendRuntime.available) {
        credentialsList.innerHTML =
          "<li>La autenticacion ya se valida desde el servidor.</li>" +
          "<li>Las credenciales viven en la base de datos centralizada.</li>" +
          "<li>Las sesiones usan cookies seguras y control del lado servidor.</li>";
      } else {
        credentialsList.innerHTML =
          "<li>Verificando acceso institucional...</li>" +
          "<li>Ingresa con tu usuario y contrasena asignados.</li>" +
          "<li>El acceso se muestra con informacion institucional.</li>";
      }
    }

    if (helperText) {
      helperText.textContent = backendRuntime.available
        ? "La sesion activa se valida desde el servidor y se registra en la bitacora centralizada."
        : "El ultimo usuario usado queda recordado en este navegador; la contrasena no se guarda en texto plano.";
    }
  }

  function rebindAuthControlsToBackend() {
    if (window.refs.loginForm) {
      window.refs.loginForm.removeEventListener("submit", localHandleLogin);
      window.refs.loginForm.removeEventListener("submit", window.handleLogin);

      if (!useNativeHostedAuth()) {
        window.refs.loginForm.addEventListener("submit", window.handleLogin);
      }
    }

    if (useNativeHostedAuth()) {
      return;
    }

    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) {
      logoutButton.removeEventListener("click", localHandleLogout);
      logoutButton.removeEventListener("click", window.handleLogout);
      logoutButton.addEventListener("click", window.handleLogout);
    }
  }

  function interceptAuthSubmit(event) {
    if (!event.target || event.target.id !== "loginForm") {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    window.handleLogin({
      preventDefault: function () {},
      currentTarget: event.target
    });
  }

  function interceptAuthClick(event) {
    const logoutButton = event.target && event.target.closest ? event.target.closest("#logoutBtn") : null;
    if (!logoutButton) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    window.handleLogout();
  }

  document.addEventListener("DOMContentLoaded", function () {
    rebindAuthControlsToBackend();

    if (!useNativeHostedAuth()) {
      document.addEventListener("submit", interceptAuthSubmit, true);
      document.addEventListener("click", interceptAuthClick, true);
    }

    renderLoginStatus();
    initializeBackend();
  });
})();
