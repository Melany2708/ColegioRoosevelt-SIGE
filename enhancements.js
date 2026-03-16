const originalCreateDefaultData = createDefaultData;
const originalLoadFromStorage = loadFromStorage;
const originalCacheDom = cacheDom;
const originalHandleDynamicSubmit = handleDynamicSubmit;
const originalHandleDynamicChange = handleDynamicChange;
const originalHandleDynamicClick = handleDynamicClick;
const SCHOOL_LOGO_IMAGE = "/assets/logo-roosevelt.svg";
const LOGIN_PREFERENCES_KEY = "sge_login_preferences_v1";
const ACCESS_MANAGER_ROLE = "Control de accesos";
const CREDENTIAL_ROLE_OPTIONS = ["Administrador", ACCESS_MANAGER_ROLE, "Direccion", "Secretaria", "Caja / tesoreria", "Docentes"];
const DEFAULT_ACCESS_USERNAMES_BY_NAME = {
  "Carlos Vega": "cvega",
  "Ana Torres": "atorres",
  "Paola Medina": "pmedina",
  "Elena Cruz": "ecruz",
  "Andrea Rojas": "secretaria",
  "Rosa Medina": "tesoreria",
  "Melanie Castro Jones": "admin"
};

if (!MODULES.some((moduleItem) => moduleItem.id === "credentials")) {
  MODULES.splice(MODULES.findIndex((moduleItem) => moduleItem.id === "security"), 0, {
    id: "credentials",
    label: "Accesos",
    hint: "Usuarios y contrasenas"
  });
}

if (!MODULES.some((moduleItem) => moduleItem.id === "settings")) {
  MODULES.push({ id: "settings", label: "Ajustes", hint: "Tema y colegio" });
}

USERS.admin.name = "Melanie Castro Jones";
USERS.direccion.name = "Valeria Stone";
USERS.tesoreria.name = "Rosa Medina";
USERS.secretaria.name = "Andrea Rojas";

ROLE_ACCESS.Administrador = MODULES.map((moduleItem) => moduleItem.id);
ROLE_ACCESS.Direccion = Array.from(new Set([...(ROLE_ACCESS.Direccion || []), "settings"]));
ROLE_ACCESS.Secretaria = Array.from(new Set([...(ROLE_ACCESS.Secretaria || []), "settings"]));
ROLE_ACCESS[ACCESS_MANAGER_ROLE] = ["credentials"];

state.documentStudentId = state.documentStudentId || null;
state.documentType = state.documentType || "Constancia de estudios";
state.selectedScheduleId = state.selectedScheduleId || null;
state.supplyStudentId = state.supplyStudentId || null;
state.credentialsDirectory = Array.isArray(state.credentialsDirectory) ? state.credentialsDirectory : [];
state.credentialsLoaded = Boolean(state.credentialsLoaded);
state.credentialsLoading = false;
state.credentialsNotice = state.credentialsNotice || null;

function getSavedLoginPreferences() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_PREFERENCES_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function saveLoginUsername(username) {
  const current = getSavedLoginPreferences();
  localStorage.setItem(LOGIN_PREFERENCES_KEY, JSON.stringify({
    ...current,
    lastUsername: String(username || "").trim()
  }));
}

function restoreLoginUsername() {
  const usernameInput = document.getElementById("usernameInput");
  if (!usernameInput) {
    return;
  }
  const saved = getSavedLoginPreferences();
  if (saved.lastUsername) {
    usernameInput.value = saved.lastUsername;
  }
}

window.sgeSaveLoginUsername = saveLoginUsername;
window.sgeRestoreLoginUsername = restoreLoginUsername;

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCredentialRole(role) {
  const raw = String(role || "").trim();
  if (raw === "Docente") {
    return "Docentes";
  }
  if (raw === "Tesoreria") {
    return "Caja / tesoreria";
  }
  return CREDENTIAL_ROLE_OPTIONS.includes(raw) ? raw : "Docentes";
}

function canManageCredentialAccounts() {
  return [ACCESS_MANAGER_ROLE, "Administrador"].includes(String(state.session?.role || ""));
}

function normalizeCredentialUsername(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function buildCredentialUsernameBase(fullName) {
  const parts = stripAccents(fullName)
    .toLowerCase()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "usuario";
  }

  if (parts.length === 1) {
    return normalizeCredentialUsername(parts[0]) || "usuario";
  }

  const initial = parts[0].slice(0, 1) || "u";
  const surname = parts.length === 2 ? parts[1] : parts[parts.length - 2];
  return normalizeCredentialUsername(`${initial}${surname}`) || "usuario";
}

function buildAvailableLocalUsername(fullName, preferredUsername = "") {
  const base = normalizeCredentialUsername(preferredUsername) || buildCredentialUsernameBase(fullName);
  let candidate = base || "usuario";
  let suffix = 1;
  while (USERS[candidate]) {
    const nextSuffix = String(suffix);
    candidate = `${base.slice(0, Math.max(1, 24 - nextSuffix.length))}${nextSuffix}`;
    suffix += 1;
  }
  return candidate;
}

function generateLocalTemporaryPassword() {
  return `Rsvt!${Math.random().toString(36).slice(2, 10)}`;
}

function toCredentialAccount(user, index = 0) {
  return {
    id: user.id || `LOCAL-${index + 1}-${user.username}`,
    username: user.username,
    name: user.username === "admin" ? state.data?.school?.adminName || user.name : user.name,
    role: normalizeCredentialRole(user.role),
    isActive: true,
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
}

function getLocalCredentialAccounts() {
  return Object.values(USERS)
    .map((user, index) => toCredentialAccount(user, index))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function upsertCredentialDirectory(account) {
  if (!account) {
    return;
  }
  const index = state.credentialsDirectory.findIndex((item) => item.id === account.id || item.username === account.username);
  if (index >= 0) {
    state.credentialsDirectory[index] = { ...state.credentialsDirectory[index], ...account };
  } else {
    state.credentialsDirectory.push(account);
  }
  state.credentialsDirectory.sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function rememberIssuedCredential(account, temporaryPassword, sourceLabel) {
  state.credentialsNotice = {
    username: account.username,
    password: temporaryPassword,
    name: account.name,
    role: account.role,
    sourceLabel: sourceLabel || "Acceso emitido"
  };
}

async function loadCredentialDirectory(force = false) {
  if (!canManageCredentialAccounts()) {
    state.credentialsDirectory = [];
    state.credentialsLoaded = false;
    return [];
  }
  if (state.credentialsLoading) {
    return state.credentialsDirectory;
  }
  if (state.credentialsLoaded && !force) {
    return state.credentialsDirectory;
  }

  state.credentialsLoading = true;
  try {
    if (typeof backendRuntime !== "undefined" && backendRuntime.available && !backendRuntime.setupRequired) {
      const response = await apiFetch("/users", { method: "GET" });
      state.credentialsDirectory = Array.isArray(response.accounts) ? response.accounts : [];
    } else {
      state.credentialsDirectory = getLocalCredentialAccounts();
    }
    state.credentialsLoaded = true;
    return state.credentialsDirectory;
  } catch (error) {
    if (typeof backendRuntime !== "undefined" && backendRuntime.available && !backendRuntime.setupRequired) {
      state.credentialsDirectory = [];
    } else {
      state.credentialsDirectory = getLocalCredentialAccounts();
    }
    state.credentialsLoaded = true;
    if (Date.now() - (state.credentialsLoadErrorAt || 0) > 3000) {
      state.credentialsLoadErrorAt = Date.now();
      showToast(error.message || "No se pudo cargar el directorio de accesos.");
    }
    return state.credentialsDirectory;
  } finally {
    state.credentialsLoading = false;
  }
}

function findStaffByCredential(account, previousUsername = "") {
  return state.data?.staff?.find((person) =>
    (previousUsername && person.loginUsername === previousUsername) ||
    (account?.username && person.loginUsername === account.username) ||
    normalizeText(person.name) === normalizeText(account?.name || "")
  ) || null;
}

function syncStaffCredentialReference(account, previousUsername = "") {
  const person = findStaffByCredential(account, previousUsername);
  if (!person || !account) {
    return null;
  }
  person.loginUsername = account.username;
  person.authRole = account.role;
  return person;
}

function getStaffCredentialUsername(person) {
  const account = state.credentialsDirectory.find((item) =>
    (person.loginUsername && item.username === person.loginUsername) ||
    normalizeText(item.name) === normalizeText(person.name)
  );
  return account?.username || person.loginUsername || "";
}

async function createCredentialAccount(payload) {
  const normalizedRole = normalizeCredentialRole(payload.role);
  if (typeof backendRuntime !== "undefined" && backendRuntime.available && !backendRuntime.setupRequired) {
    const response = await apiFetch("/users", {
      method: "POST",
      body: {
        action: "create",
        name: payload.name,
        role: normalizedRole,
        username: payload.username || "",
        password: payload.password || "",
        linkedStaffId: payload.linkedStaffId || ""
      }
    });
    upsertCredentialDirectory(response.account);
    syncStaffCredentialReference(response.account);
    rememberIssuedCredential(response.account, response.temporaryPassword, payload.sourceLabel || "Acceso emitido");
    return response;
  }

  const username = buildAvailableLocalUsername(payload.name, payload.username);
  const temporaryPassword = String(payload.password || "").trim() || generateLocalTemporaryPassword();
  const account = {
    username,
    password: temporaryPassword,
    name: payload.name,
    role: normalizedRole,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  USERS[username] = account;
  const publicAccount = toCredentialAccount({ ...account, id: `LOCAL-${username}` });
  upsertCredentialDirectory(publicAccount);
  syncStaffCredentialReference(publicAccount);
  rememberIssuedCredential(publicAccount, temporaryPassword, payload.sourceLabel || "Acceso emitido");
  return {
    ok: true,
    account: publicAccount,
    temporaryPassword
  };
}

async function updateCredentialAccount(payload) {
  if (typeof backendRuntime !== "undefined" && backendRuntime.available && !backendRuntime.setupRequired) {
    const response = await apiFetch("/users", {
      method: "POST",
      body: {
        action: "update",
        userId: payload.userId,
        username: payload.username,
        name: payload.name,
        role: normalizeCredentialRole(payload.role)
      }
    });
    upsertCredentialDirectory(response.account);
    syncStaffCredentialReference(response.account, payload.currentUsername);
    return response;
  }

  const currentUsername = payload.currentUsername;
  const current = USERS[currentUsername];
  if (!current) {
    throw new Error("La cuenta seleccionada ya no existe.");
  }
  const nextUsername = normalizeCredentialUsername(payload.username);
  if (!nextUsername) {
    throw new Error("Ingresa un nombre de usuario valido.");
  }
  if (nextUsername !== currentUsername && USERS[nextUsername]) {
    throw new Error("Ese nombre de usuario ya esta en uso.");
  }
  delete USERS[currentUsername];
  USERS[nextUsername] = {
    ...current,
    username: nextUsername,
    name: String(payload.name || current.name).trim() || current.name,
    role: normalizeCredentialRole(payload.role || current.role),
    updatedAt: new Date().toISOString()
  };
  const account = toCredentialAccount({ ...USERS[nextUsername], id: payload.userId || `LOCAL-${nextUsername}` });
  upsertCredentialDirectory(account);
  syncStaffCredentialReference(account, currentUsername);
  return { ok: true, account };
}

async function setCredentialPassword(payload) {
  if (typeof backendRuntime !== "undefined" && backendRuntime.available && !backendRuntime.setupRequired) {
    const response = await apiFetch("/users", {
      method: "POST",
      body: {
        action: payload.autoGenerate ? "reset-password" : "set-password",
        userId: payload.userId,
        password: payload.password || ""
      }
    });
    upsertCredentialDirectory(response.account);
    rememberIssuedCredential(response.account, response.temporaryPassword, payload.autoGenerate ? "Contrasena temporal restablecida" : "Contrasena actualizada");
    return response;
  }

  const current = USERS[payload.currentUsername];
  if (!current) {
    throw new Error("La cuenta seleccionada ya no existe.");
  }
  const nextPassword = payload.autoGenerate ? generateLocalTemporaryPassword() : String(payload.password || "").trim();
  if (nextPassword.length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }
  current.password = nextPassword;
  current.updatedAt = new Date().toISOString();
  const account = toCredentialAccount({ ...current, id: payload.userId || `LOCAL-${payload.currentUsername}` });
  upsertCredentialDirectory(account);
  rememberIssuedCredential(account, nextPassword, payload.autoGenerate ? "Contrasena temporal restablecida" : "Contrasena actualizada");
  return { ok: true, account, temporaryPassword: nextPassword };
}

createDefaultData = function createEnhancedDefaultData() {
  return getEnhancedDefaultData();
};

loadFromStorage = function loadFromStorageEnhanced(key, fallbackValue) {
  const value = originalLoadFromStorage(key, fallbackValue);
  if (key === STORAGE_KEYS.data) {
    return hydrateData(value);
  }
  return value;
};

cacheDom = function cacheDomEnhanced() {
  originalCacheDom();
  refs.sections.credentials = document.getElementById("credentialsSection");
  refs.sections.settings = document.getElementById("settingsSection");
};

renderApp = function renderAppEnhanced() {
  if (!state.session) {
    refs.loginView.classList.remove("hidden");
    refs.appShell.classList.add("hidden");
    refs.loginForm.reset();
    state.credentialsDirectory = [];
    state.credentialsLoaded = false;
    state.credentialsNotice = null;
    restoreLoginUsername();
    return;
  }

  refs.loginView.classList.add("hidden");
  refs.appShell.classList.remove("hidden");

  state.data = hydrateData(state.data);
  syncSessionIdentity();
  ensureSelectedStudent();
  ensureSelectedSchedule();
  ensureValidActiveSection();
  applyThemePreset();
  renderChrome();
  renderSections();
  applyRoleVisibility();
  refs.globalSearch.value = state.search;
};

renderChrome = function renderChromeEnhanced() {
  refs.schoolName.textContent = state.data.school.name;
  document.querySelectorAll(".brand-mark").forEach((element) => {
    element.setAttribute("aria-label", `Logo ${state.data.school.name}`);
    element.title = state.data.school.name;
  });
  const searchBox = refs.globalSearch?.closest(".search-box");
  if (searchBox) {
    searchBox.classList.toggle("hidden", state.session?.role === ACCESS_MANAGER_ROLE);
  }
  refs.sidebarRole.textContent = state.session.role;
  refs.sidebarUser.textContent = `${getSessionDisplayName()} (${state.session.username})`;
  refs.topbarDate.textContent = `Actualizado ${formatDateLong(new Date().toISOString())}`;
  renderSidebar();
};

renderSidebar = function renderSidebarEnhanced() {
  const allowed = getAllowedSections();
  const teacherModuleOrder = ["dashboard", "academic", "attendance", "profile", "planning", "schedule", "activities", "documents"];
  const teacherModuleLabels = {
    dashboard: { label: "Panel docente", hint: "Resumen diario" },
    academic: { label: "Notas", hint: "Trimestres y promedios" },
    attendance: { label: "Asistencia", hint: "Tus secciones" },
    profile: { label: "Mis alumnos", hint: "Matriculados por aula" },
    planning: { label: "Planificacion", hint: "Seguimiento propio" },
    schedule: { label: "Mis horarios", hint: "Aulas asignadas" },
    activities: { label: "Actividades", hint: "Agenda institucional" },
    documents: { label: "Constancias", hint: "Documentos" }
  };
  const sourceModules = state.session?.role === "Docentes"
    ? teacherModuleOrder
      .map((moduleId) => MODULES.find((moduleItem) => moduleItem.id === moduleId))
      .filter(Boolean)
      .filter((moduleItem) => allowed.includes(moduleItem.id))
    : MODULES.filter((moduleItem) => allowed.includes(moduleItem.id));

  refs.navMenu.innerHTML = sourceModules
    .map((moduleItem) => {
      const activeClass = state.activeSection === moduleItem.id ? "is-active" : "";
      const roleAwareCopy = state.session?.role === "Docentes" ? teacherModuleLabels[moduleItem.id] || {} : {};
      return `
        <button class="nav-link ${activeClass}" type="button" data-nav-target="${moduleItem.id}">
          <span>${escapeHtml(roleAwareCopy.label || moduleItem.label)}</span>
          <small>${escapeHtml(roleAwareCopy.hint || moduleItem.hint)}</small>
        </button>
      `;
    })
    .join("");
};

renderSections = function renderSectionsEnhanced() {
  renderDashboardSection();
  renderAdmissionsSection();
  renderProfileSection();
  renderAcademicSection();
  renderPlanningSection();
  renderStaffSection();
  renderScheduleSection();
  renderFinanceSection();
  renderAccountingSection();
  renderSuppliesSection();
  renderActivitiesSection();
  renderReportsSection();
  renderDocumentsSection();
  renderCredentialsSection();
  renderSecuritySection();
  renderSettingsSection();
};

applyRoleVisibility = function applyRoleVisibilityEnhanced() {
  const allowed = getAllowedSections();
  Object.entries(refs.sections).forEach(([sectionId, element]) => {
    if (!element) {
      return;
    }
    const isAllowed = allowed.includes(sectionId);
    const isActive = state.activeSection === sectionId;
    element.classList.toggle("hidden", !isAllowed);
    element.classList.toggle("is-visible", isAllowed && isActive);
  });
};

ensureValidActiveSection = function ensureValidActiveSectionEnhanced() {
  const allowed = getAllowedSections();
  if (!allowed.includes(state.activeSection)) {
    state.activeSection = allowed[0] || "dashboard";
  }
};

navigateTo = function navigateToEnhanced(sectionId) {
  const allowed = getAllowedSections();
  if (!allowed.includes(sectionId)) {
    showToast("Tu rol no tiene acceso a ese modulo.", "error");
    return;
  }
  state.activeSection = sectionId;
  renderSidebar();
  applyRoleVisibility();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

handleLogin = async function handleLoginEnhanced(event) {
  if (window.location.protocol !== "file:" && typeof window.__backendHandleLogin === "function") {
    return window.__backendHandleLogin(event);
  }

  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = normalizeText(formData.get("username"));
  const password = String(formData.get("password") || "");

  if (window.location.protocol !== "file:") {
    HTMLFormElement.prototype.submit.call(event.currentTarget);
    return;
  }

  const user = USERS[username];

  if (!user || user.password !== password) {
    showToast("Credenciales invalidas. Verifica tu usuario y contrasena institucional.", "error");
    return;
  }

  const displayName = username === "admin" ? state.data.school.adminName : user.name;
  state.session = {
    username: user.username,
    name: displayName,
    role: user.role,
    startedAt: new Date().toISOString()
  };
  state.activeSection = (ROLE_ACCESS[user.role] && ROLE_ACCESS[user.role][0]) || "dashboard";
  saveLoginUsername(user.username);
  saveToStorage(STORAGE_KEYS.session, state.session);
  recordLog({ ...user, name: displayName }, "Inicio de sesion");
  renderApp();
  showToast(`Bienvenido(a), ${displayName}.`);
};

handleDynamicClick = function handleDynamicClickEnhanced(event) {
  const clearTemplateButton = event.target.closest("[data-clear-document-template]");
  if (clearTemplateButton) {
    state.data.school.documentTemplate = "";
    persistData();
    renderDocumentsSection();
    renderSettingsSection();
    showToast("La plantilla de constancias fue retirada.");
    return;
  }

  const addScheduleRowButton = event.target.closest("[data-add-schedule-row]");
  if (addScheduleRowButton) {
    const schedule = getSelectedSchedule();
    if (!schedule) {
      showToast("Primero registra o selecciona un horario.");
      return;
    }
    schedule.rows.push(["", "", "", "", "", ""]);
    persistData();
    renderScheduleSection();
    showToast("Se agrego un bloque editable al horario.");
    return;
  }

  originalHandleDynamicClick(event);
};

handleDynamicChange = function handleDynamicChangeEnhanced(event) {
  if (event.target.id === "scheduleSelect") {
    state.selectedScheduleId = event.target.value;
    renderScheduleSection();
    return;
  }

  if (event.target.id === "supplyStudentSelect") {
    state.supplyStudentId = event.target.value;
    renderSuppliesSection();
    return;
  }

  if (event.target.id === "documentTemplateInput") {
    const [file] = Array.from(event.target.files || []);
    if (!file) {
      return;
    }
    readFileAsDataUrl(file).then((dataUrl) => {
      state.data.school.documentTemplate = dataUrl;
      persistData();
      renderDocumentsSection();
      renderSettingsSection();
      showToast("Plantilla de constancias cargada correctamente.");
    }).catch(() => {
      showToast("No se pudo leer la imagen seleccionada.");
    });
    return;
  }

  originalHandleDynamicChange(event);
};
handleDynamicSubmit = function handleDynamicSubmitEnhanced(event) {
  if (event.target.id === "studentForm") {
    originalHandleDynamicSubmit(event);
    const student = getStudentById(state.selectedStudentId);
    if (student) {
      const supply = getStudentSupply(student.id);
      supply.deliveredAt = supply.deliveredAt || "";
      supply.deliveryNotes = supply.deliveryNotes || "Pendiente de entrega.";
      state.supplyStudentId = student.id;
      persistData();
    }
    return;
  }

  if (event.target.id === "staffForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const role = String(formData.get("role") || "Administrativo");
    const name = String(formData.get("name") || "").trim();
    const assignmentLevel = String(formData.get("assignmentLevel") || "Secundaria").trim();
    const requestedAccessRole = String(formData.get("accessRole") || "automatic");
    const defaultAccessRole = getDefaultCredentialRoleForStaff(role);
    const credentialRole = ((role === "Docente" || role === ACCESS_MANAGER_ROLE) && requestedAccessRole === "none")
      ? defaultAccessRole
      : requestedAccessRole === "automatic"
      ? defaultAccessRole
      : requestedAccessRole === "none"
        ? ""
        : normalizeCredentialRole(requestedAccessRole);
    const person = {
      id: nextStaffId(role),
      name,
      role,
      area: String(formData.get("area") || "").trim(),
      courses: String(formData.get("courses") || "-").trim() || "-",
      grades: String(formData.get("grades") || "-").trim() || "-",
      assignmentLevel,
      schedule: String(formData.get("schedule") || "").trim(),
      tenure: String(formData.get("tenure") || "Ingreso reciente").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      loginUsername: "",
      authRole: ""
    };

    if (!person.name || !person.area || !person.email || !person.schedule) {
      showToast("Completa nombre, area, correo y horario para registrar al personal.");
      return;
    }

    if (role === "Docente" && (person.courses === "-" || person.grades === "-")) {
      showToast("Para registrar un docente indica sus cursos y las secciones asignadas.");
      return;
    }

    const finalizeStaffRegistration = (credentialResult = null) => {
      if (credentialResult?.account) {
        person.loginUsername = credentialResult.account.username;
        person.authRole = credentialResult.account.role;
      }

      state.data.staff.push(person);
      if (role === "Docente") {
        syncTeacherAssignmentsFromStaff(person, assignmentLevel);
        state.data.planning.push({
          teacherId: person.id,
          teacher: person.name,
          area: person.area,
          status: "Pendiente",
          deliveredAt: "-",
          compliance: 0
        });
      }

      persistData();
      recordLog(state.session, `Registro de personal ${person.name}`);
      renderStaffSection();
      if (canManageCredentialAccounts()) {
        loadCredentialDirectory(true).then(() => renderCredentialsSection());
      }
      showToast(credentialResult?.account
        ? `${role === "Docente" ? "Docente" : "Personal"} registrado con usuario y contrasena temporal generados.`
        : "Personal registrado correctamente.");
    };

    if (credentialRole) {
      if (!canManageCredentialAccounts()) {
        showToast("Para registrar personal con acceso al sistema, inicia sesion como Administracion o Control de accesos.");
        return;
      }

      createCredentialAccount({
        name: person.name,
        role: credentialRole,
        username: String(formData.get("preferredUsername") || "").trim(),
        linkedStaffId: person.id,
        sourceLabel: role === "Docente"
          ? "Credenciales generadas al registrar docente"
          : credentialRole === ACCESS_MANAGER_ROLE
            ? "Credenciales generadas al registrar responsable de accesos"
            : "Credenciales generadas al registrar personal"
      }).then((credentialResult) => {
        finalizeStaffRegistration(credentialResult);
      }).catch((error) => {
        showToast(error.message || "No se pudo generar el acceso del personal.");
      });
      return;
    }

    finalizeStaffRegistration();
    return;
  }

  if (event.target.id === "suppliesForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = String(formData.get("studentId") || "");
    const supply = getStudentSupply(studentId);
    supply.status = String(formData.get("status") || supply.status);
    supply.deliveredAt = String(formData.get("deliveredAt") || "");
    supply.delivered = splitList(String(formData.get("delivered") || ""));
    supply.missing = splitList(String(formData.get("missing") || ""));
    supply.deliveryNotes = String(formData.get("deliveryNotes") || "").trim();
    state.supplyStudentId = studentId;
    persistData();
    recordLog(state.session, `Actualizacion de utiles para ${getStudentById(studentId)?.fullName || studentId}`);
    renderSuppliesSection();
    renderProfileSection();
    showToast("Entrega de utiles actualizada.");
    return;
  }

  if (event.target.id === "scheduleCreateForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const schedule = {
      id: nextScheduleId(),
      sectionKey: String(formData.get("sectionKey") || "").trim(),
      room: String(formData.get("room") || "").trim(),
      days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
      rows: [
        ["7:30", "", "", "", "", ""],
        ["8:20", "", "", "", "", ""],
        ["9:10", "", "", "", "", ""]
      ]
    };
    state.data.schedules.push(schedule);
    state.selectedScheduleId = schedule.id;
    persistData();
    recordLog(state.session, `Registro de horario ${schedule.sectionKey}`);
    renderScheduleSection();
    showToast("Horario creado y listo para editar.");
    return;
  }

  if (event.target.id === "scheduleEditorForm") {
    event.preventDefault();
    const schedule = getSelectedSchedule();
    if (!schedule) {
      showToast("No hay horario seleccionado.");
      return;
    }

    const formData = new FormData(event.target);
    schedule.sectionKey = String(formData.get("sectionKey") || schedule.sectionKey).trim();
    schedule.room = String(formData.get("room") || schedule.room).trim();
    const rowCount = Number(formData.get("rowCount") || schedule.rows.length);
    const nextRows = [];
    for (let index = 0; index < rowCount; index += 1) {
      nextRows.push([
        String(formData.get(`row-${index}-0`) || "").trim(),
        String(formData.get(`row-${index}-1`) || "").trim(),
        String(formData.get(`row-${index}-2`) || "").trim(),
        String(formData.get(`row-${index}-3`) || "").trim(),
        String(formData.get(`row-${index}-4`) || "").trim(),
        String(formData.get(`row-${index}-5`) || "").trim()
      ]);
    }
    schedule.rows = nextRows;
    persistData();
    recordLog(state.session, `Edicion de horario ${schedule.sectionKey}`);
    renderScheduleSection();
    showToast("Horario guardado correctamente.");
    return;
  }

  if (event.target.id === "settingsForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.data.school.name = String(formData.get("schoolName") || state.data.school.name).trim();
    state.data.school.city = String(formData.get("city") || state.data.school.city).trim();
    state.data.school.logo = String(formData.get("logo") || state.data.school.logo).trim() || "CPR";
    state.data.school.adminName = String(formData.get("adminName") || state.data.school.adminName).trim();
    state.data.school.theme = String(formData.get("theme") || state.data.school.theme || "roosevelt");
    syncSessionIdentity();
    persistData();
    recordLog(state.session, "Actualizacion de ajustes generales");
    renderApp();
    navigateTo("settings", false);
    showToast("Ajustes guardados correctamente.");
    return;
  }

  originalHandleDynamicSubmit(event);
};

renderStaffSection = function renderStaffSectionEnhanced() {
  const totalTeachers = state.data.staff.filter((person) => person.role === "Docente").length;
  const totalAdministrative = state.data.staff.length - totalTeachers;

  refs.sections.staff.innerHTML = `
    ${renderSectionHeader("Docentes y personal", "Ahora incluye el formulario de registro para docentes y personal administrativo.")}

    <div class="inline-metrics">
      <span class="tag">${totalTeachers} docentes</span>
      <span class="tag">${totalAdministrative} administrativos</span>
      <span class="tag">${state.data.staff.length} registros activos</span>
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>Registrar personal</h3>
        <form id="staffForm" class="form-grid">
          <label class="field">
            <span>Tipo</span>
            <select name="role">
              <option value="Docente">Docente</option>
              <option value="Administrativo">Administrativo</option>
              <option value="Secretaria">Secretaria</option>
              <option value="Tesoreria">Tesoreria</option>
              <option value="Coordinacion academica">Coordinacion academica</option>
            </select>
          </label>
          <label class="field">
            <span>Nombre completo</span>
            <input name="name" type="text" required>
          </label>
          <label class="field">
            <span>Area o especialidad</span>
            <input name="area" type="text" required>
          </label>
          <label class="field">
            <span>Correo</span>
            <input name="email" type="email" required>
          </label>
          <label class="field">
            <span>Telefono</span>
            <input name="phone" type="text">
          </label>
          <label class="field">
            <span>Horario asignado</span>
            <input name="schedule" type="text" placeholder="Lun a Vie 7:30 - 13:30" required>
          </label>
          <label class="field">
            <span>Cursos asignados</span>
            <input name="courses" type="text" placeholder="Solo si aplica">
          </label>
          <label class="field">
            <span>Grados asignados</span>
            <input name="grades" type="text" placeholder="Solo si aplica">
          </label>
          <label class="field field-full">
            <span>Historial laboral</span>
            <input name="tenure" type="text" placeholder="2026 - actual">
          </label>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Registrar personal</button>
          </div>
        </form>
      </article>

      <article class="table-card">
        <h3>Listado de personal</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Area</th>
                <th>Cursos / grados</th>
                <th>Horario</th>
              </tr>
            </thead>
            <tbody>
              ${state.data.staff.map((person) => `
                <tr>
                  <td>${escapeHtml(person.id)}</td>
                  <td>${escapeHtml(person.name)}<br><small>${escapeHtml(person.email)}</small></td>
                  <td>${escapeHtml(person.role)}</td>
                  <td>${escapeHtml(person.area)}</td>
                  <td>${escapeHtml(`${person.courses} · ${person.grades}`)}</td>
                  <td>${escapeHtml(person.schedule)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};

renderScheduleSection = function renderScheduleSectionEnhanced() {
  ensureSelectedSchedule();
  const schedule = getSelectedSchedule();
  if (!schedule) {
    refs.sections.schedule.innerHTML = `<article class="empty-card"><h3>Sin horarios</h3><p>Registra el primer horario para empezar a editarlo.</p></article>`;
    return;
  }

  refs.sections.schedule.innerHTML = `
    ${renderSectionHeader("Horarios escolares", "Modulo independiente para crear, editar e imprimir horarios por seccion.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Crear horario</h3>
        <form id="scheduleCreateForm" class="form-grid">
          <label class="field">
            <span>Seccion</span>
            <input name="sectionKey" type="text" placeholder="Primaria 5° A" required>
          </label>
          <label class="field">
            <span>Aula</span>
            <input name="room" type="text" placeholder="Aula 205" required>
          </label>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Crear horario</button>
          </div>
        </form>

        <div class="divider"></div>

        <h3>Horarios registrados</h3>
        <div class="schedule-toolbar">
          <label class="field" style="flex:1;">
            <span>Editar horario</span>
            <select id="scheduleSelect">
              ${state.data.schedules.map((item) => `<option value="${item.id}" ${item.id === schedule.id ? "selected" : ""}>${escapeHtml(item.sectionKey)}</option>`).join("")}
            </select>
          </label>
          <button class="button button-secondary" type="button" data-print-report="horarios">Imprimir horario</button>
        </div>
      </article>

      <article class="table-card">
        <h3>${escapeHtml(schedule.sectionKey)}</h3>
        <p class="supporting-copy">${escapeHtml(schedule.room)}</p>
        <form id="scheduleEditorForm" class="form-stack">
          <div class="form-grid">
            <label class="field">
              <span>Seccion</span>
              <input name="sectionKey" type="text" value="${escapeHtml(schedule.sectionKey)}">
            </label>
            <label class="field">
              <span>Aula</span>
              <input name="room" type="text" value="${escapeHtml(schedule.room)}">
            </label>
          </div>
          <input type="hidden" name="rowCount" value="${schedule.rows.length}">
          <div class="table-wrap input-table">
            <table>
              <thead>
                <tr>
                  ${schedule.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${schedule.rows.map((row, rowIndex) => `
                  <tr>
                    ${row.map((cell, cellIndex) => `<td><input name="row-${rowIndex}-${cellIndex}" type="text" value="${escapeHtml(cell)}"></td>`).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="button-row">
            <button class="button button-secondary" type="button" data-add-schedule-row="true">Agregar bloque</button>
            <button class="button button-primary" type="submit">Guardar horario</button>
          </div>
        </form>
      </article>
    </div>
  `;
};

renderSuppliesSection = function renderSuppliesSectionEnhanced() {
  const selectedId = state.supplyStudentId || state.selectedStudentId || (state.data.students[0] && state.data.students[0].id);
  const selectedStudent = getStudentById(selectedId);
  const selectedSupply = selectedStudent ? getStudentSupply(selectedStudent.id) : null;

  refs.sections.supplies.innerHTML = `
    ${renderSectionHeader("Control de utiles escolares", "Ahora puedes registrar estado, fecha de entrega y observaciones por alumno.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Actualizar entrega</h3>
        ${selectedStudent ? `
          <form id="suppliesForm" class="form-stack">
            <label class="field">
              <span>Alumno</span>
              <select id="supplyStudentSelect" name="studentId">
                ${state.data.students.map((student) => `<option value="${student.id}" ${student.id === selectedStudent.id ? "selected" : ""}>${escapeHtml(student.fullName)}</option>`).join("")}
              </select>
            </label>
            <div class="form-grid">
              <label class="field">
                <span>Estado</span>
                <select name="status">
                  ${["Entregado", "Pendiente", "Incompleto"].map((status) => `<option value="${status}" ${selectedSupply.status === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>Fecha de entrega</span>
                <input name="deliveredAt" type="date" value="${selectedSupply.deliveredAt || ""}">
              </label>
            </div>
            <label class="field">
              <span>Utiles entregados</span>
              <textarea name="delivered" placeholder="Separados por coma">${escapeHtml(selectedSupply.delivered.join(", "))}</textarea>
            </label>
            <label class="field">
              <span>Utiles faltantes</span>
              <textarea name="missing" placeholder="Separados por coma">${escapeHtml(selectedSupply.missing.join(", "))}</textarea>
            </label>
            <label class="field">
              <span>Observaciones</span>
              <textarea name="deliveryNotes" placeholder="Detalle de la entrega">${escapeHtml(selectedSupply.deliveryNotes || "")}</textarea>
            </label>
            <button class="button button-primary" type="submit">Guardar entrega</button>
          </form>
        ` : `<p>No hay alumnos disponibles.</p>`}
      </article>

      <article class="table-card">
        <h3>Seguimiento general</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Entregado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${state.data.supplies.map((supply) => {
                const student = getStudentById(supply.studentId);
                return `
                  <tr>
                    <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                    <td>${renderStatusPill(supply.status)}</td>
                    <td>${formatDate(supply.deliveredAt)}</td>
                    <td>${escapeHtml(supply.delivered.join(", ") || "Sin items")}</td>
                    <td>${escapeHtml(supply.deliveryNotes || "Sin observaciones")}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};
renderDocumentsSection = function renderDocumentsSectionEnhanced() {
  const selectedStudentId = state.documentStudentId || state.selectedStudentId || (state.data.students[0] && state.data.students[0].id);
  const selectedType = state.documentType || "Constancia de estudios";
  const student = getStudentById(selectedStudentId);
  const preview = student ? buildDocumentHtml(student, selectedType) : "<p>Seleccione un alumno.</p>";
  const recentDocs = [...state.data.documents].slice(-5).reverse();
  const hasTemplate = Boolean(state.data.school.documentTemplate);

  refs.sections.documents.innerHTML = `
    ${renderSectionHeader("Constancias y documentos", "Las constancias ahora pueden salir sobre una plantilla de imagen cargada por ti.")}

    <div class="documents-grid">
      <article class="glass-card">
        <h3>Generar documento</h3>
        <div class="detail-grid">
          <label class="field">
            <span>Alumno</span>
            <select id="docStudentSelect">
              ${state.data.students.map((item) => `<option value="${item.id}" ${item.id === selectedStudentId ? "selected" : ""}>${escapeHtml(item.fullName)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Tipo</span>
            <select id="docTypeSelect">
              ${["Constancia de estudios", "Constancia de matricula", "Constancia de pago", "Constancia de no adeudo"].map((type) => `<option value="${type}" ${type === selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="file-input">
            <span>Plantilla de imagen</span>
            <input id="documentTemplateInput" type="file" accept="image/*">
            <span class="template-note">${hasTemplate ? "Hay una plantilla activa para las constancias." : "Carga tu imagen para usarla como fondo del documento."}</span>
          </label>
          <div class="button-row">
            <button class="button button-primary" type="button" data-print-document="true">Emitir e imprimir</button>
            <button class="button button-secondary" type="button" data-save-document="true">Registrar emision</button>
            ${hasTemplate ? '<button class="button button-secondary" type="button" data-clear-document-template="true">Quitar plantilla</button>' : ""}
          </div>
        </div>
        <div class="divider"></div>
        <h3>Ultimas constancias</h3>
        <div class="timeline-list">
          ${recentDocs.map((documentItem) => {
            const docStudent = getStudentById(documentItem.studentId);
            return `
              <div class="timeline-item">
                <strong>${escapeHtml(documentItem.type)}</strong>
                <p>${escapeHtml(docStudent ? docStudent.fullName : "Alumno")}</p>
                <p>${escapeHtml(documentItem.code)} · ${formatDate(documentItem.issuedAt)}</p>
              </div>
            `;
          }).join("")}
        </div>
      </article>

      <article class="document-sheet">
        <div class="document-preview">${preview}</div>
      </article>
    </div>
  `;
};

renderSettingsSection = function renderSettingsSectionEnhanced() {
  refs.sections.settings.innerHTML = `
    ${renderSectionHeader("Ajustes", "Configura el nombre del colegio, el nombre de la administradora, el logo corto y el tema visual.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Configuracion general</h3>
        <form id="settingsForm" class="settings-grid">
          <label class="field">
            <span>Nombre del colegio</span>
            <input name="schoolName" type="text" value="${escapeHtml(state.data.school.name)}" required>
          </label>
          <label class="field">
            <span>Ciudad</span>
            <input name="city" type="text" value="${escapeHtml(state.data.school.city)}" required>
          </label>
          <label class="field">
            <span>Nombre de la administradora</span>
            <input name="adminName" type="text" value="${escapeHtml(state.data.school.adminName)}" required>
          </label>
          <label class="field">
            <span>Siglas del logo</span>
            <input name="logo" type="text" value="${escapeHtml(state.data.school.logo)}" maxlength="4" required>
          </label>
          <label class="field field-full">
            <span>Tema visual</span>
            <select name="theme" id="themePresetSelect">
              <option value="roosevelt" ${state.data.school.theme === "roosevelt" ? "selected" : ""}>Roosevelt institucional</option>
              <option value="oceano" ${state.data.school.theme === "oceano" ? "selected" : ""}>Oceano</option>
              <option value="bosque" ${state.data.school.theme === "bosque" ? "selected" : ""}>Bosque</option>
              <option value="terracota" ${state.data.school.theme === "terracota" ? "selected" : ""}>Terracota</option>
            </select>
          </label>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Guardar ajustes</button>
          </div>
        </form>
      </article>

      <article class="glass-card">
        <h3>Resumen actual</h3>
        <div class="badge-grid">
          <span class="tag">${escapeHtml(state.data.school.name)}</span>
          <span class="tag">Administradora: ${escapeHtml(state.data.school.adminName)}</span>
          <span class="tag">Tema: ${escapeHtml(state.data.school.theme)}</span>
        </div>
        <div class="divider"></div>
        <div class="notice-card">
          <p><strong>Plantilla de constancias:</strong> ${state.data.school.documentTemplate ? "Cargada" : "Sin cargar"}</p>
          <p>La imagen de fondo para constancias se gestiona desde el modulo de constancias.</p>
          <div class="button-row">
            <button class="button button-secondary" type="button" data-open-section="documents">Ir a constancias</button>
          </div>
        </div>
      </article>
    </div>
  `;
};

buildDocumentHtml = function buildDocumentHtmlEnhanced(student, type) {
  const finance = getStudentFinancialSummary(student.id);
  const lastPayment = [...getStudentPayments(student.id)].filter((payment) => payment.paid > 0).slice(-1)[0];
  const issueDate = formatDate(isoDate(0));
  const templateStyle = state.data.school.documentTemplate ? ` style="background-image:url('${state.data.school.documentTemplate}')"` : "";
  let body = "";

  if (type === "Constancia de matricula") {
    body = `Se deja constancia que el estudiante <strong>${escapeHtml(student.fullName)}</strong>, identificado con DNI ${escapeHtml(student.dni)}, se encuentra matriculado en el nivel ${escapeHtml(student.level)}, grado ${escapeHtml(student.grade)} seccion ${escapeHtml(student.section)} del anio lectivo ${escapeHtml(student.year)}.`;
  } else if (type === "Constancia de pago") {
    body = lastPayment
      ? `Se certifica que la familia del estudiante <strong>${escapeHtml(student.fullName)}</strong> registro el pago de <strong>${escapeHtml(lastPayment.concept)}</strong> por ${formatCurrency(lastPayment.paid)} con comprobante ${escapeHtml(lastPayment.receipt)}.`
      : `No existen pagos registrados para el estudiante <strong>${escapeHtml(student.fullName)}</strong>.`;
  } else if (type === "Constancia de no adeudo") {
    body = finance.pending > 0
      ? `El estudiante <strong>${escapeHtml(student.fullName)}</strong> mantiene un saldo pendiente de ${formatCurrency(finance.pending)}. No corresponde emitir constancia de no adeudo.`
      : `Se deja constancia que el estudiante <strong>${escapeHtml(student.fullName)}</strong> no mantiene deuda pendiente con la institucion al ${issueDate}.`;
  } else {
    body = `Se deja constancia que el estudiante <strong>${escapeHtml(student.fullName)}</strong> cursa estudios en ${escapeHtml(state.data.school.name)} durante el anio lectivo ${escapeHtml(student.year)}.`;
  }

  return `
    <div class="document-canvas"${templateStyle}>
      <div class="document-overlay">
        <div class="document-header">
          <div class="document-logo" title="${escapeHtml(state.data.school.name)}">${escapeHtml(state.data.school.logo)}</div>
          <div>
            <p class="eyebrow" style="color:#5a6579;">Institucion educativa privada</p>
            <h3>${escapeHtml(state.data.school.name)}</h3>
            <p>${escapeHtml(state.data.school.city)} · ${issueDate}</p>
          </div>
        </div>
        <h4>${escapeHtml(type)}</h4>
        <p>${body}</p>
        <p>Codigo interno: ${escapeHtml(nextDocumentCode(type))}</p>
        <p>Emitido por: ${escapeHtml(getSessionDisplayName())}</p>
      </div>
    </div>
  `;
};

saveCurrentDocument = function saveCurrentDocumentEnhanced() {
  const studentId = state.documentStudentId || state.selectedStudentId;
  const type = state.documentType || "Constancia de estudios";
  const student = getStudentById(studentId);
  if (!student) {
    showToast("Seleccione un alumno antes de registrar la constancia.");
    return;
  }

  if (type === "Constancia de no adeudo" && getStudentFinancialSummary(student.id).pending > 0) {
    showToast("No es posible emitir constancia de no adeudo porque el alumno tiene saldo pendiente.");
    return;
  }

  const record = ensureDocumentRecord(student.id, type);
  recordLog(state.session, `Emision de ${type} para ${student.fullName}`);
  renderDocumentsSection();
  renderProfileSection();
  showToast(`Documento registrado con codigo ${record.code}.`);
};

printDocument = function printDocumentEnhanced() {
  const studentId = state.documentStudentId || state.selectedStudentId;
  const type = state.documentType || "Constancia de estudios";
  const student = getStudentById(studentId);
  if (!student) {
    showToast("Seleccione un alumno para imprimir el documento.");
    return;
  }

  if (type === "Constancia de no adeudo" && getStudentFinancialSummary(student.id).pending > 0) {
    showToast("No es posible imprimir constancia de no adeudo si existe deuda pendiente.");
    return;
  }

  ensureDocumentRecord(student.id, type);
  printHtml(type, buildDocumentHtml(student, type));
};

printHtml = function printHtmlEnhanced(title, content) {
  const popup = window.open("", "_blank", "width=980,height=820");
  if (!popup) {
    showToast("El navegador bloqueo la ventana emergente de impresion.");
    return;
  }

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h2, h3, h4 { margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
          p { line-height: 1.6; }
          .document-canvas { min-height: 1040px; padding: 48px 52px; background-size: cover; background-position: center; background-repeat: no-repeat; position: relative; }
          .document-canvas::before { content: ""; position: absolute; inset: 0; background: rgba(255,255,255,0.18); }
          .document-overlay { position: relative; z-index: 1; max-width: 78%; margin: 0 auto; padding-top: 32px; }
          .document-header { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; }
          .document-logo { width: 82px; height: 82px; background: url('${SCHOOL_LOGO_IMAGE}') center / contain no-repeat; color: transparent; user-select: none; }
          @page { size: A4 portrait; margin: 12mm; }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
};
function getEnhancedDefaultData() {
  const base = originalCreateDefaultData();
  base.school = {
    ...base.school,
    name: "Colegio Privado Roosevelt",
    city: "Lima",
    logo: "CPR",
    adminName: "Melanie Castro Jones",
    theme: "roosevelt",
    documentTemplate: ""
  };

  base.staff = base.staff.map((person) => ({
    ...person,
    email: String(person.email || "").replace("horizonte.edu", "roosevelt.edu"),
    phone: person.phone || "",
    loginUsername: person.loginUsername || DEFAULT_ACCESS_USERNAMES_BY_NAME[person.name] || "",
    authRole: person.authRole || (DEFAULT_ACCESS_USERNAMES_BY_NAME[person.name] ? normalizeCredentialRole(person.role) : "")
  }));

  base.schedules = base.schedules.map((schedule, index) => ({
    ...schedule,
    id: schedule.id || `SCH-${String(index + 1).padStart(3, "0")}`
  }));

  base.supplies = base.supplies.map((supply, index) => ({
    ...supply,
    deliveredAt: supply.status === "Entregado" ? isoDate(-16 + index) : "",
    deliveryNotes: supply.status === "Incompleto" ? "Entrega parcial registrada por almacen." : supply.status === "Entregado" ? "Entrega conforme registrada." : "Pendiente de entrega."
  }));

  return base;
}

function hydrateData(sourceData) {
  const base = getEnhancedDefaultData();
  const source = sourceData || {};
  const hydrated = {
    ...base,
    ...safeClone(source)
  };

  hydrated.school = {
    ...base.school,
    ...(source.school || {})
  };

  if (!hydrated.school.name || hydrated.school.name === "Colegio Privado Horizonte") {
    hydrated.school.name = "Colegio Privado Roosevelt";
  }
  if (!hydrated.school.logo || hydrated.school.logo === "SGE") {
    hydrated.school.logo = "CPR";
  }
  if (!hydrated.school.adminName || hydrated.school.adminName === "Karen Salas") {
    hydrated.school.adminName = "Melanie Castro Jones";
  }
  if (!hydrated.school.theme) {
    hydrated.school.theme = "roosevelt";
  }
  if (typeof hydrated.school.documentTemplate !== "string") {
    hydrated.school.documentTemplate = "";
  }

  hydrated.staff = Array.isArray(source.staff) && source.staff.length
    ? source.staff.map((person, index) => ({
      id: person.id || nextIndexedId(person.role === "Docente" ? "DOC" : "PER", index + 1),
      name: person.name || "Personal",
      role: person.role || "Administrativo",
      area: person.area || "Area general",
      courses: person.courses || "-",
      grades: person.grades || "-",
      schedule: person.schedule || "",
      tenure: person.tenure || "Ingreso reciente",
      email: person.email || `personal${index + 1}@roosevelt.edu`,
      phone: person.phone || "",
      loginUsername: String(person.loginUsername || DEFAULT_ACCESS_USERNAMES_BY_NAME[person.name] || ""),
      authRole: String(person.authRole || (person.loginUsername || DEFAULT_ACCESS_USERNAMES_BY_NAME[person.name] ? normalizeCredentialRole(person.role) : ""))
    }))
    : base.staff;

  hydrated.schedules = Array.isArray(source.schedules) && source.schedules.length
    ? source.schedules.map((schedule, index) => ({
      id: schedule.id || `SCH-${String(index + 1).padStart(3, "0")}`,
      sectionKey: schedule.sectionKey || `Seccion ${index + 1}`,
      room: schedule.room || "Aula pendiente",
      days: Array.isArray(schedule.days) && schedule.days.length ? schedule.days : ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
      rows: Array.isArray(schedule.rows) ? schedule.rows.map((row) => normalizeScheduleRow(row)) : [["7:30", "", "", "", "", ""]]
    }))
    : base.schedules;

  hydrated.supplies = Array.isArray(source.supplies) && source.supplies.length
    ? source.supplies.map((supply) => ({
      studentId: supply.studentId,
      status: supply.status || "Pendiente",
      delivered: Array.isArray(supply.delivered) ? supply.delivered : [],
      missing: Array.isArray(supply.missing) ? supply.missing : [],
      deliveredAt: supply.deliveredAt || "",
      deliveryNotes: supply.deliveryNotes || ""
    }))
    : base.supplies;

  return hydrated;
}

function applyThemePreset() {
  document.body.dataset.theme = state.data?.school?.theme || "roosevelt";
}

function syncSessionIdentity() {
  if (!state.session) {
    return;
  }
  state.session.name = getSessionDisplayName();
  saveToStorage(STORAGE_KEYS.session, state.session);
}

function getSessionDisplayName() {
  if (!state.session) {
    return state.data?.school?.adminName || "Usuario";
  }
  if (state.session.username === "admin") {
    return state.data.school.adminName;
  }
  return USERS[state.session.username]?.name || state.session.name || "Usuario";
}

function persistData() {
  syncSessionIdentity();
  applyThemePreset();
  saveToStorage(STORAGE_KEYS.data, state.data);
}

function ensureSelectedSchedule() {
  const schedules = state.data?.schedules || [];
  const exists = schedules.some((schedule) => schedule.id === state.selectedScheduleId);
  if (!exists) {
    state.selectedScheduleId = schedules[0] ? schedules[0].id : null;
  }
}

function getSelectedSchedule() {
  ensureSelectedSchedule();
  return state.data.schedules.find((schedule) => schedule.id === state.selectedScheduleId) || null;
}

function nextStaffId(role) {
  const prefix = role === "Docente" ? "DOC" : "PER";
  return nextIndexedId(prefix, state.data.staff.length + 1);
}

function nextScheduleId() {
  return `SCH-${String(state.data.schedules.length + 1).padStart(3, "0")}`;
}

function nextIndexedId(prefix, value) {
  return `${prefix}-${String(value).padStart(3, "0")}`;
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function safeClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeScheduleRow(row) {
  if (Array.isArray(row)) {
    const normalized = row.slice(0, 6);
    while (normalized.length < 6) {
      normalized.push("");
    }
    return normalized.map((cell) => String(cell || ""));
  }
  return ["", "", "", "", "", ""];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


Object.assign(USERS, {
  cvega: { username: "cvega", password: "gestion-servidor", name: "Carlos Vega", role: "Docentes" },
  atorres: { username: "atorres", password: "gestion-servidor", name: "Ana Torres", role: "Docentes" },
  pmedina: { username: "pmedina", password: "gestion-servidor", name: "Paola Medina", role: "Docentes" },
  ecruz: { username: "ecruz", password: "gestion-servidor", name: "Elena Cruz", role: "Docentes" },
  accesos: { username: "accesos", password: "gestion-servidor", name: "Responsable de accesos", role: ACCESS_MANAGER_ROLE }
});

const previousHydrateData = hydrateData;
hydrateData = function hydrateDataExtended(sourceData) {
  const data = previousHydrateData(sourceData);
  LEVELS_GRADES.Inicial = ["3 año", "4 año", "5 año"];

  data.capacities = Object.fromEntries(
    Object.entries(data.capacities || {}).map(([key, value]) => [key.replace(/anos/g, "año"), value])
  );

  data.students = data.students.map((student) => ({
    ...student,
    grade: String(student.grade || "").replace(/anos/g, "año"),
    submittedDocs: Array.isArray(student.submittedDocs) ? student.submittedDocs : ["DNI", "Partida", "Fotos"]
  }));

  data.schedules = data.schedules.map((schedule) => ({
    ...schedule,
    sectionKey: String(schedule.sectionKey || "").replace(/anos/g, "año"),
    level: schedule.level || inferScheduleLevel(schedule.sectionKey),
    rows: ensureBreakByLevel(schedule.level || inferScheduleLevel(schedule.sectionKey), schedule.rows)
  }));

  ensureUniformPayments(data);
  return data;
};

const previousRenderApp = renderApp;
renderApp = function renderAppWithTeacherData() {
  state.data = hydrateData(state.data);
  previousRenderApp();
};

exportReport = function exportReportAsExcel(reportId) {
  const report = buildReportDataset(reportId);
  const workbook = buildExcelWorkbook(report.title, report.headers, report.rows);
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${report.fileName}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Reporte ${report.title} exportado en formato Excel.`);
};

function buildExcelWorkbook(title, headers, rows) {
  const tableRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #9ca3af; padding: 8px; }
          th { background: #1f2a44; color: #ffffff; font-weight: bold; }
          .title { font-size: 18px; font-weight: bold; background: #c4b5fd; color: #111827; }
        </style>
      </head>
      <body>
        <table>
          <tr><th class="title" colspan="${headers.length}">${escapeHtml(title)}</th></tr>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          ${tableRows}
        </table>
      </body>
    </html>
  `;
}

function ensureUniformPayments(data) {
  data.students.forEach((student) => {
    const hasTracksuit = data.payments.some((payment) => payment.studentId === student.id && payment.concept === "Buso institucional");
    const hasUniform = data.payments.some((payment) => payment.studentId === student.id && payment.concept === "Uniforme institucional");
    if (!hasTracksuit) {
      data.payments.push({
        id: `PAY-U-${student.id}-1`,
        studentId: student.id,
        concept: "Buso institucional",
        dueDate: isoDate(20),
        amount: 120,
        paid: 0,
        status: "Pendiente",
        receipt: "-",
        date: "-",
        documentType: "Boleta"
      });
    }
    if (!hasUniform) {
      data.payments.push({
        id: `PAY-U-${student.id}-2`,
        studentId: student.id,
        concept: "Uniforme institucional",
        dueDate: isoDate(25),
        amount: 140,
        paid: 0,
        status: "Pendiente",
        receipt: "-",
        date: "-",
        documentType: "Boleta"
      });
    }
  });
}

function inferScheduleLevel(sectionKey) {
  const text = normalizeText(sectionKey);
  if (text.includes("secundaria")) {
    return "Secundaria";
  }
  if (text.includes("primaria")) {
    return "Primaria";
  }
  return "Primaria";
}

function buildScheduleTemplate(level) {
  if (level === "Secundaria") {
    return [
      ["7:20", "", "", "", "", ""],
      ["8:10", "", "", "", "", ""],
      ["9:00", "", "", "", "", ""],
      ["9:50", "", "", "", "", ""],
      ["11:00", "RECREO", "RECREO", "RECREO", "RECREO", "RECREO"],
      ["11:20", "", "", "", "", ""],
      ["12:10", "", "", "", "", ""],
      ["13:00", "", "", "", "", ""],
      ["13:50", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00"]
    ];
  }

  return [
    ["7:20", "", "", "", "", ""],
    ["8:10", "", "", "", "", ""],
    ["9:00", "", "", "", "", ""],
    ["10:00", "RECREO", "RECREO", "RECREO", "RECREO", "RECREO"],
    ["10:20", "", "", "", "", ""],
    ["11:10", "", "", "", "", ""],
    ["12:00", "", "", "", "", ""],
    ["12:50", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15"]
  ];
}

function ensureBreakByLevel(level, rows) {
  const baseRows = Array.isArray(rows) && rows.length ? rows.map((row) => normalizeScheduleRow(row)) : buildScheduleTemplate(level);
  const hasBreak = baseRows.some((row) => normalizeText(row[1]).includes("recreo"));
  if (hasBreak) {
    return baseRows;
  }
  return buildScheduleTemplate(level);
}

function getTeacherSections(teacherName) {
  return state.data.courses.filter((course) => course.teacher === teacherName).map((course) => course.section);
}

function getStudentsForTeacher(teacherName) {
  const sections = new Set(getTeacherSections(teacherName));
  return state.data.students.filter((student) => sections.has(`${student.grade} ${student.section}`) || sections.has(`${student.level} ${student.grade} ${student.section}`));
}

document.addEventListener("DOMContentLoaded", () => {
  restoreLoginUsername();
  const credentialsList = document.querySelector(".credentials");
  if (credentialsList) {
    credentialsList.innerHTML = `
      <li>Verificando acceso institucional...</li>
      <li>Ingresa con tus credenciales asignadas por la institucion.</li>
    `;
  }
});
const previousEnhancedHandleDynamicSubmit = handleDynamicSubmit;
handleDynamicSubmit = function handleDynamicSubmitTeacherAndSchedule(event) {
  if (event.target.id === "gradeForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = String(formData.get("studentId") || "");
    const course = String(formData.get("course") || "");
    const period = String(formData.get("period") || "Bimestre 1");
    const score = Number(formData.get("score") || 0);
    const teacher = state.session.role === "Docentes" ? getSessionDisplayName() : String(formData.get("teacher") || "");
    const existing = state.data.grades.find((grade) => grade.studentId === studentId && grade.course === course && grade.period === period);
    if (existing) {
      existing.score = score;
      existing.teacher = teacher;
    } else {
      state.data.grades.push({ studentId, course, teacher, period, score });
    }
    persistData();
    recordLog(state.session, `Registro de nota ${course} para ${getStudentById(studentId)?.fullName || studentId}`);
    renderAcademicSection();
    renderProfileSection();
    showToast("Nota guardada correctamente.");
    return;
  }

  if (event.target.id === "scheduleCreateForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const level = String(formData.get("level") || "Primaria");
    const sectionKey = String(formData.get("sectionKey") || "").trim();
    const schedule = {
      id: nextScheduleId(),
      level,
      sectionKey,
      room: String(formData.get("room") || "").trim(),
      days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
      rows: buildScheduleTemplate(level)
    };
    state.data.schedules.push(schedule);
    state.selectedScheduleId = schedule.id;
    persistData();
    recordLog(state.session, `Registro de horario ${schedule.sectionKey}`);
    renderScheduleSection();
    showToast("Horario creado con la estructura del nivel seleccionado.");
    return;
  }

  if (event.target.id === "studentForm") {
    previousEnhancedHandleDynamicSubmit(event);
    const student = getStudentById(state.selectedStudentId);
    if (student) {
      ensureUniformPayments(state.data);
      persistData();
      renderFinanceSection();
      renderProfileSection();
    }
    return;
  }

  previousEnhancedHandleDynamicSubmit(event);
};

renderAcademicSection = function renderAcademicSectionEnhanced() {
  const teacherView = state.session.role === "Docentes";
  const teacherName = getSessionDisplayName();
  const visibleCourses = teacherView ? state.data.courses.filter((course) => course.teacher === teacherName) : state.data.courses;
  const visibleStudents = teacherView ? getStudentsForTeacher(teacherName) : state.data.students;
  const visibleGrades = teacherView ? state.data.grades.filter((grade) => grade.teacher === teacherName) : state.data.grades;
  const teacherSections = teacherView ? getTeacherSections(teacherName) : [];

  refs.sections.academic.innerHTML = `
    ${renderSectionHeader("Gestion academica", teacherView ? "Portal docente para ver aulas, registrar notas y exportarlas en Excel." : "Registro de cursos, docentes, calificaciones, promedios y visualizacion por alumno y curso.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-export-report="academico">Exportar Excel</button>
      </div>
    `)}

    <div class="inline-metrics">
      ${teacherView ? `<span class="tag">Docente: ${escapeHtml(teacherName)}</span><span class="tag">Aulas: ${escapeHtml(teacherSections.join(", ") || "Sin asignacion")}</span>` : `<span class="tag">${state.data.courses.length} cursos registrados</span>`}
      <span class="tag">${visibleStudents.length} alumnos visibles</span>
      <span class="tag">${visibleGrades.length} notas registradas</span>
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>${teacherView ? "Registrar notas" : "Registro manual de notas"}</h3>
        <form id="gradeForm" class="form-stack">
          <label class="field">
            <span>Alumno</span>
            <select name="studentId">
              ${visibleStudents.map((student) => `<option value="${student.id}">${escapeHtml(student.fullName)} · ${escapeHtml(`${student.level} ${student.grade} ${student.section}`)}</option>`).join("")}
            </select>
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Curso</span>
              <select name="course">
                ${visibleCourses.map((course) => `<option value="${course.course}">${escapeHtml(course.course)} · ${escapeHtml(course.section)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Periodo</span>
              <select name="period">
                <option value="Bimestre 1">Bimestre 1</option>
                <option value="Bimestre 2">Bimestre 2</option>
                <option value="Bimestre 3">Bimestre 3</option>
                <option value="Bimestre 4">Bimestre 4</option>
              </select>
            </label>
          </div>
          ${teacherView ? `<input type="hidden" name="teacher" value="${escapeHtml(teacherName)}">` : `
            <label class="field">
              <span>Docente</span>
              <select name="teacher">
                ${state.data.staff.filter((person) => person.role === "Docente").map((person) => `<option value="${person.name}">${escapeHtml(person.name)}</option>`).join("")}
              </select>
            </label>
          `}
          <label class="field">
            <span>Nota</span>
            <input name="score" type="number" min="0" max="20" required>
          </label>
          <button class="button button-primary" type="submit">Guardar nota</button>
        </form>
      </article>

      <article class="table-card">
        <h3>${teacherView ? "Aulas y alumnos asignados" : "Resumen academico"}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Aula</th>
                <th>Promedio</th>
                <th>Pagos de uniforme</th>
              </tr>
            </thead>
            <tbody>
              ${visibleStudents.map((student) => {
                const uniformPayments = getStudentPayments(student.id).filter((payment) => payment.concept.includes("Uniforme") || payment.concept.includes("Buso"));
                return `
                  <tr>
                    <td>${escapeHtml(student.fullName)}</td>
                    <td>${escapeHtml(`${student.level} ${student.grade} ${student.section}`)}</td>
                    <td>${getStudentAverage(student.id).toFixed(1)}</td>
                    <td>${escapeHtml(uniformPayments.map((payment) => `${payment.concept}: ${payment.status}`).join(" · ") || "Sin registros")}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <article class="table-card">
      <h3>${teacherView ? "Notas del docente" : "Registro de calificaciones"}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Curso</th>
              <th>Docente</th>
              <th>Periodo</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            ${visibleGrades.map((grade) => {
              const student = getStudentById(grade.studentId);
              return `
                <tr>
                  <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                  <td>${escapeHtml(grade.course)}</td>
                  <td>${escapeHtml(grade.teacher)}</td>
                  <td>${escapeHtml(grade.period)}</td>
                  <td>${grade.score}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

renderPlanningSection = function renderPlanningSectionEnhanced() {
  refs.sections.planning.innerHTML = `
    ${renderSectionHeader("Seguimiento docente", "Vista completa del docente con estado de planificacion, correo, horario y especialidad.")}

    <div class="grid-two">
      ${state.data.planning.map((item) => {
        const staff = state.data.staff.find((person) => person.name === item.teacher);
        return `
          <article class="glass-card">
            <div class="chip-row">
              <span class="tag">${escapeHtml(item.area)}</span>
              ${renderStatusPill(item.status)}
            </div>
            <h3>${escapeHtml(item.teacher)}</h3>
            <p><strong>Correo:</strong> ${escapeHtml(staff?.email || "Sin correo")}</p>
            <p><strong>Horario:</strong> ${escapeHtml(staff?.schedule || "Sin horario")}</p>
            <p><strong>Cumplimiento:</strong> ${formatPercent(item.compliance)}</p>
            <p><strong>Ultima entrega:</strong> ${formatDate(item.deliveredAt)}</p>
          </article>
        `;
      }).join("")}
    </div>
  `;
};

renderCredentialsSection = function renderCredentialsSectionManaged() {
  if (!refs.sections.credentials) {
    return;
  }

  if (!canManageCredentialAccounts()) {
    refs.sections.credentials.innerHTML = `
      <article class="empty-card">
        <h3>Modulo restringido</h3>
        <p>La administracion de usuarios y contrasenas esta disponible solo para Administracion y Control de accesos.</p>
      </article>
    `;
    return;
  }

  if (!state.credentialsLoaded && !state.credentialsLoading) {
    loadCredentialDirectory(true).then(() => renderCredentialsSection());
  }

  const accounts = state.credentialsDirectory || [];
  const teacherAccounts = accounts.filter((item) => item.role === "Docentes");
  const accessManagers = accounts.filter((item) => item.role === ACCESS_MANAGER_ROLE);
  const credentialNotice = state.credentialsNotice
    ? `
      <article class="notice-card">
        <p><strong>${escapeHtml(state.credentialsNotice.sourceLabel || "Acceso emitido")}</strong></p>
        <p>${escapeHtml(state.credentialsNotice.name)} · ${escapeHtml(state.credentialsNotice.role)}</p>
        <p><strong>Usuario:</strong> <code>${escapeHtml(state.credentialsNotice.username)}</code></p>
        <p><strong>Contrasena temporal:</strong> <code>${escapeHtml(state.credentialsNotice.password)}</code></p>
        <div class="button-row">
          <button class="button button-secondary" type="button" data-copy-value="${encodeURIComponent(state.credentialsNotice.username)}">Copiar usuario</button>
          <button class="button button-primary" type="button" data-copy-value="${encodeURIComponent(state.credentialsNotice.password)}">Copiar contrasena</button>
          <button class="button button-soft" type="button" data-dismiss-credential-notice="true">Ocultar</button>
        </div>
      </article>
    `
    : "";

  refs.sections.credentials.innerHTML = `
    ${renderSectionHeader("Accesos institucionales", "Genera usuarios, actualiza nombres de acceso y restablece contrasenas desde un modulo separado y restringido.")}

    <div class="inline-metrics">
      <span class="tag">${accounts.length} cuentas activas</span>
      <span class="tag">${teacherAccounts.length} cuentas docentes</span>
      <span class="tag">${accessManagers.length} gestores de accesos</span>
      <span class="tag">${state.credentialsLoading ? "Sincronizando..." : "Directorio listo"}</span>
    </div>

    ${credentialNotice}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Crear acceso</h3>
        <form id="credentialCreateForm" class="form-grid">
          <label class="field">
            <span>Nombre completo</span>
            <input name="name" type="text" required>
          </label>
          <label class="field">
            <span>Rol de acceso</span>
            <select name="role">
              ${CREDENTIAL_ROLE_OPTIONS.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Usuario</span>
            <input name="username" type="text" placeholder="Opcional, se genera automaticamente">
          </label>
          <label class="field">
            <span>Contrasena temporal</span>
            <input name="password" type="text" placeholder="Opcional, se genera automaticamente">
          </label>
          <p class="helper-text field-full">Usa este formulario para crear tambien la cuenta exclusiva del rol <strong>${escapeHtml(ACCESS_MANAGER_ROLE)}</strong>.</p>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Crear acceso</button>
          </div>
        </form>
      </article>

      <article class="glass-card">
        <h3>Indicaciones</h3>
        <div class="notice-card">
          <p>Cuando registras personal desde el modulo de personal, puedes dejar el acceso en modo automatico para que el sistema genere su usuario y una contrasena temporal segun el puesto.</p>
          <p>Por seguridad, las contrasenas antiguas no se listan en pantalla. Solo se muestran al crear o restablecer una cuenta.</p>
          <p>Si necesitas una persona dedicada solo a accesos, crea una cuenta con el rol <strong>${escapeHtml(ACCESS_MANAGER_ROLE)}</strong>.</p>
        </div>
      </article>
    </div>

    <div class="stack-grid">
      ${accounts.map((account) => `
        <article class="glass-card credential-card">
          <div class="section-heading">
            <p class="eyebrow">${escapeHtml(account.role)}</p>
            <h3>${escapeHtml(account.name)}</h3>
            <p class="supporting-copy">Usuario actual: <strong>${escapeHtml(account.username)}</strong></p>
          </div>

          <div class="inline-metrics">
            <span class="tag">${account.isActive ? "Activo" : "Inactivo"}</span>
            <span class="tag">Actualizado ${escapeHtml(account.updatedAt ? formatDateLong(account.updatedAt) : "sin fecha")}</span>
          </div>

          <form class="form-grid" data-credential-update-form="true">
            <input type="hidden" name="userId" value="${escapeHtml(account.id)}">
            <input type="hidden" name="currentUsername" value="${escapeHtml(account.username)}">
            <label class="field">
              <span>Nombre</span>
              <input name="name" type="text" value="${escapeHtml(account.name)}" required>
            </label>
            <label class="field">
              <span>Usuario</span>
              <input name="username" type="text" value="${escapeHtml(account.username)}" required>
            </label>
            <label class="field">
              <span>Rol</span>
              <select name="role">
                ${CREDENTIAL_ROLE_OPTIONS.map((role) => `<option value="${escapeHtml(role)}" ${role === account.role ? "selected" : ""}>${escapeHtml(role)}</option>`).join("")}
              </select>
            </label>
            <div class="field">
              <span>Accion rapida</span>
              <div class="button-row">
                <button class="button button-secondary" type="button" data-copy-value="${encodeURIComponent(account.username)}">Copiar usuario</button>
                <button class="button button-primary" type="submit">Guardar acceso</button>
              </div>
            </div>
          </form>

          <form class="form-grid" data-credential-password-form="true">
            <input type="hidden" name="userId" value="${escapeHtml(account.id)}">
            <input type="hidden" name="currentUsername" value="${escapeHtml(account.username)}">
            <label class="field field-full">
              <span>Nueva contrasena manual</span>
              <input name="password" type="text" minlength="8" placeholder="Escribe una nueva contrasena o usa el restablecimiento automatico">
            </label>
            <div class="field field-full">
              <div class="button-row">
                <button class="button button-secondary" type="submit">Guardar contrasena</button>
                <button class="button button-primary" type="button" data-reset-credential-password="${escapeHtml(account.id)}" data-current-username="${escapeHtml(account.username)}">Restablecer temporal</button>
              </div>
            </div>
          </form>
        </article>
      `).join("") || '<article class="empty-card"><h3>Sin cuentas registradas</h3><p>Crea el primer acceso institucional desde este panel.</p></article>'}
    </div>
  `;
};

renderSecuritySection = function renderSecuritySectionEnhanced() {
  const recentLogs = [...state.logs].slice(-8).reverse();

  refs.sections.security.innerHTML = `
    ${renderSectionHeader("Seguridad y auditoria", "Consulta la bitacora reciente y manten la administracion de usuarios separada en el modulo de Accesos.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Buenas practicas aplicadas</h3>
        <div class="notice-card">
          <p>Las contrasenas ya no se muestran desde este modulo. Toda la gestion de usuarios y restablecimientos se realiza en <strong>Accesos</strong>.</p>
          <p>El login sigue validandose con el servidor y las sesiones continuan bajo control del backend.</p>
        </div>
      </article>

      <article class="table-card">
        <h3>Bitacora de accesos</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              ${recentLogs.map((logItem) => `
                <tr>
                  <td>${formatDate(logItem.timestamp.slice(0, 10))}</td>
                  <td>${escapeHtml(logItem.name)}<br><small>${escapeHtml(logItem.user)}</small></td>
                  <td>${escapeHtml(logItem.role)}</td>
                  <td>${escapeHtml(logItem.action)}</td>
                </tr>
              `).join("") || '<tr><td colspan="4">No hay eventos recientes.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};

renderScheduleSection = function renderScheduleSectionByLevel() {
  ensureSelectedSchedule();
  const schedule = getSelectedSchedule();
  if (!schedule) {
    refs.sections.schedule.innerHTML = `<article class="empty-card"><h3>Sin horarios</h3><p>Registra el primer horario para empezar a editarlo.</p></article>`;
    return;
  }
  const scheduleStudents = state.data.students.filter((student) => normalizeText(schedule.sectionKey).includes(normalizeText(student.grade)) && normalizeText(schedule.sectionKey).includes(normalizeText(student.section)));

  refs.sections.schedule.innerHTML = `
    ${renderSectionHeader("Horarios escolares", "Horarios editables por nivel con recreo automatico para primaria a las 10:00 y secundaria a las 11:00.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Crear horario</h3>
        <form id="scheduleCreateForm" class="form-grid">
          <label class="field">
            <span>Nivel</span>
            <select name="level">
              <option value="Primaria">Primaria</option>
              <option value="Secundaria">Secundaria</option>
            </select>
          </label>
          <label class="field">
            <span>Seccion</span>
            <input name="sectionKey" type="text" placeholder="Primaria 5° A" required>
          </label>
          <label class="field field-full">
            <span>Aula</span>
            <input name="room" type="text" placeholder="Aula 205" required>
          </label>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Crear horario</button>
          </div>
        </form>

        <div class="divider"></div>
        <label class="field">
          <span>Horario activo</span>
          <select id="scheduleSelect">
            ${state.data.schedules.map((item) => `<option value="${item.id}" ${item.id === schedule.id ? "selected" : ""}>${escapeHtml(`${item.level} · ${item.sectionKey}`)}</option>`).join("")}
          </select>
        </label>
        <p class="template-note">${schedule.level === "Secundaria" ? "Secundaria: 7:20 a 14:00, recreo 11:00" : "Primaria: 7:20 a 13:15, recreo 10:00"}</p>
      </article>

      <article class="table-card">
        <h3>${escapeHtml(schedule.sectionKey)}</h3>
        <p class="supporting-copy">${escapeHtml(schedule.level)} · ${escapeHtml(schedule.room)}</p>
        <form id="scheduleEditorForm" class="form-stack">
          <div class="form-grid">
            <label class="field">
              <span>Seccion</span>
              <input name="sectionKey" type="text" value="${escapeHtml(schedule.sectionKey)}">
            </label>
            <label class="field">
              <span>Aula</span>
              <input name="room" type="text" value="${escapeHtml(schedule.room)}">
            </label>
          </div>
          <input type="hidden" name="rowCount" value="${schedule.rows.length}">
          <div class="table-wrap input-table">
            <table>
              <thead>
                <tr>
                  ${schedule.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${schedule.rows.map((row, rowIndex) => `
                  <tr>
                    ${row.map((cell, cellIndex) => `<td><input name="row-${rowIndex}-${cellIndex}" type="text" value="${escapeHtml(cell)}"></td>`).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="button-row">
            <button class="button button-secondary" type="button" data-add-schedule-row="true">Agregar bloque</button>
            <button class="button button-primary" type="submit">Guardar horario</button>
          </div>
        </form>
      </article>
    </div>

    <article class="table-card">
      <h3>Alumnos por aula</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Nivel</th>
              <th>Grado</th>
              <th>Seccion</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleStudents.map((student) => `
              <tr>
                <td>${escapeHtml(student.fullName)}</td>
                <td>${escapeHtml(student.level)}</td>
                <td>${escapeHtml(student.grade)}</td>
                <td>${escapeHtml(student.section)}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">No hay alumnos asignados a esta aula todavia.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;
};
const previousHydrateDataExtended = hydrateData;
hydrateData = function hydrateDataNormalized(sourceData) {
  const data = previousHydrateDataExtended(sourceData);
  data.courses = data.courses.map((course) => ({
    ...course,
    section: String(course.section || "").replace(/anos/g, "año")
  }));
  return data;
};

getTeacherSections = function getTeacherSectionsNormalized(teacherName) {
  return state.data.courses
    .filter((course) => normalizeText(course.teacher) === normalizeText(teacherName))
    .map((course) => normalizeText(course.section));
};

getStudentsForTeacher = function getStudentsForTeacherNormalized(teacherName) {
  const sections = new Set(getTeacherSections(teacherName));
  return state.data.students.filter((student) => {
    const shortKey = normalizeText(`${student.grade} ${student.section}`);
    const fullKey = normalizeText(`${student.level} ${student.grade} ${student.section}`);
    return sections.has(shortKey) || sections.has(fullKey);
  });
};

function getTeacherSectionOptions(teacherName) {
  const sections = new Map();
  state.data.courses
    .filter((course) => normalizeText(course.teacher) === normalizeText(teacherName))
    .forEach((course) => {
      const section = String(course.section || "").trim();
      if (!section) {
        return;
      }
      const key = normalizeText(section);
      sections.set(key, {
        value: section,
        section,
        level: String(course.level || "").trim(),
        label: String(course.level || "").trim() ? `${course.level} ${section}` : section
      });
    });
  return Array.from(sections.values());
}

function studentMatchesSection(student, sectionValue) {
  const normalizedSection = normalizeText(sectionValue || "");
  if (!normalizedSection) {
    return true;
  }
  const shortKey = normalizeText(`${student.grade} ${student.section}`);
  const fullKey = normalizeText(`${student.level} ${student.grade} ${student.section}`);
  return shortKey === normalizedSection || fullKey === normalizedSection;
}

function getStudentsForTeacherSection(teacherName, sectionValue = "") {
  return getStudentsForTeacher(teacherName).filter((student) => studentMatchesSection(student, sectionValue));
}

function getDefaultCredentialRoleForStaff(staffRole) {
  const normalizedRole = String(staffRole || "").trim();
  if (normalizedRole === "Docente") {
    return "Docentes";
  }
  if (normalizedRole === ACCESS_MANAGER_ROLE) {
    return ACCESS_MANAGER_ROLE;
  }
  if (normalizedRole === "Secretaria") {
    return "Secretaria";
  }
  if (normalizedRole === "Tesoreria") {
    return "Caja / tesoreria";
  }
  return "";
}

function normalizeStaffSectionValue(value) {
  return String(value || "")
    .replace(/^(inicial|primaria|secundaria)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function syncTeacherAssignmentsFromStaff(person, assignmentLevel) {
  const courses = splitList(person.courses === "-" ? person.area : person.courses);
  const sections = splitList(person.grades)
    .map((item) => normalizeStaffSectionValue(item))
    .filter(Boolean);

  if (!courses.length || !sections.length) {
    return 0;
  }

  let created = 0;
  courses.forEach((courseName) => {
    sections.forEach((sectionName) => {
      const exists = state.data.courses.some((course) =>
        normalizeText(course.teacher) === normalizeText(person.name) &&
        normalizeText(course.course) === normalizeText(courseName) &&
        normalizeText(course.section) === normalizeText(sectionName)
      );

      if (exists) {
        return;
      }

      state.data.courses.push({
        course: courseName,
        teacher: person.name,
        section: sectionName,
        level: assignmentLevel || "Primaria"
      });
      upsertGradeTable({
        teacher: person.name,
        course: courseName,
        section: sectionName,
        assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES]
      });
      created += 1;
    });
  });

  return created;
}

const previousUltimateHandleDynamicClick = handleDynamicClick;
handleDynamicClick = function handleDynamicClickCrud(event) {
  const deleteStudentButton = event.target.closest("[data-delete-student]");
  if (deleteStudentButton) {
    const studentId = deleteStudentButton.dataset.deleteStudent;
    const student = getStudentById(studentId);
    if (!student) {
      showToast("El alumno ya no existe en la base actual.");
      return;
    }
    const confirmed = window.confirm(`Se eliminara al alumno ${student.fullName} con sus pagos, utiles, notas y documentos. Deseas continuar?`);
    if (!confirmed) {
      return;
    }
    deleteStudentCascade(studentId);
    recordLog(state.session, `Eliminacion de alumno ${student.fullName}`);
    renderApp();
    navigateTo("admissions", false);
    showToast("Alumno eliminado correctamente.");
    return;
  }

  const deleteStaffButton = event.target.closest("[data-delete-staff]");
  if (deleteStaffButton) {
    const staffId = deleteStaffButton.dataset.deleteStaff;
    const staff = state.data.staff.find((person) => person.id === staffId);
    if (!staff) {
      showToast("El personal seleccionado ya no existe.");
      return;
    }
    const confirmed = window.confirm(`Se eliminara a ${staff.name} del registro de personal. Deseas continuar?`);
    if (!confirmed) {
      return;
    }
    deleteStaffCascade(staffId);
    recordLog(state.session, `Eliminacion de personal ${staff.name}`);
    renderApp();
    navigateTo("staff", false);
    showToast("Personal eliminado correctamente.");
    return;
  }

  previousUltimateHandleDynamicClick(event);
};

const previousUltimateHandleDynamicSubmit = handleDynamicSubmit;
handleDynamicSubmit = function handleDynamicSubmitPayments(event) {
  if (event.target.id === "paymentForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = String(formData.get("studentId") || "");
    const conceptPreset = String(formData.get("conceptPreset") || "");
    const customConcept = String(formData.get("customConcept") || "").trim();
    const concept = conceptPreset === "Otro" ? customConcept : conceptPreset;
    const amount = Number(formData.get("amount") || 0);
    const paid = Number(formData.get("paid") || 0);
    const dueDate = String(formData.get("dueDate") || "");
    const paymentDate = String(formData.get("paymentDate") || "-");
    const documentType = String(formData.get("documentType") || "Boleta");
    const receipt = String(formData.get("receipt") || "-").trim() || "-";

    if (!studentId || !concept || amount <= 0 || !dueDate) {
      showToast("Completa alumno, concepto, monto y fecha de vencimiento para registrar el pago.");
      return;
    }

    const status = paid <= 0 ? "Pendiente" : paid >= amount ? "Pagado" : "Parcial";
    const payment = {
      id: nextPaymentId(),
      studentId,
      concept,
      dueDate,
      amount,
      paid,
      status,
      receipt: paid > 0 ? receipt : "-",
      date: paid > 0 && paymentDate ? paymentDate : "-",
      documentType
    };

    state.data.payments.push(payment);
    persistData();
    recordLog(state.session, `Registro de pago ${concept} para ${getStudentById(studentId)?.fullName || studentId}`);
    renderFinanceSection();
    renderProfileSection();
    showToast("Pago registrado correctamente.");
    return;
  }

  previousUltimateHandleDynamicSubmit(event);
};

renderAdmissionsSection = function renderAdmissionsSectionEnhancedCrud() {
  const filteredStudents = getFilteredStudents();
  const vacancy = getVacancy("Primaria", "5°", "A");
  const newStudents = state.data.students.filter((student) => student.admissionType === "Nuevo").length;
  const transferStudents = state.data.students.filter((student) => student.admissionType === "Trasladado").length;

  refs.sections.admissions.innerHTML = `
    ${renderSectionHeader("Matricula y admision", "Registro de alumnos nuevos, trasladados y reingresantes con control de vacantes y eliminacion directa.", `
      <span class="tag">${filteredStudents.length} registros visibles</span>
    `)}

    <div class="metric-grid">
      <article class="mini-card">
        <h3>Total matriculados</h3>
        <p class="metric-number">${state.data.students.length}</p>
      </article>
      <article class="mini-card">
        <h3>Alumnos nuevos</h3>
        <p class="metric-number">${newStudents}</p>
      </article>
      <article class="mini-card">
        <h3>Trasladados</h3>
        <p class="metric-number">${transferStudents}</p>
      </article>
      <article class="mini-card">
        <h3>Vacantes 5° A</h3>
        <p class="metric-number">${vacancy.available}</p>
      </article>
    </div>

    <div class="grid-two">
      <article class="glass-card">
        <h3>Registrar alumno</h3>
        <form id="studentForm" class="form-grid">
          <label class="field">
            <span>Codigo</span>
            <input id="studentCode" name="code" type="text" value="${escapeHtml(nextStudentCode())}" readonly>
          </label>
          <label class="field">
            <span>Tipo de ingreso</span>
            <select name="admissionType">
              <option value="Nuevo">Nuevo</option>
              <option value="Trasladado">Trasladado</option>
              <option value="Reingresante">Reingresante</option>
            </select>
          </label>
          <label class="field">
            <span>Nombres</span>
            <input name="names" type="text" required>
          </label>
          <label class="field">
            <span>Apellidos</span>
            <input name="lastNames" type="text" required>
          </label>
          <label class="field">
            <span>DNI</span>
            <input name="dni" type="text" minlength="8" maxlength="8" required>
          </label>
          <label class="field">
            <span>Fecha de nacimiento</span>
            <input name="birthDate" type="date" required>
          </label>
          <label class="field">
            <span>Sexo</span>
            <select name="sex">
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <label class="field">
            <span>Año lectivo</span>
            <input name="year" type="number" value="${state.data.school.academicYear}" required>
          </label>
          <label class="field field-full">
            <span>Direccion</span>
            <input name="address" type="text" required>
          </label>
          <label class="field">
            <span>Telefono</span>
            <input name="phone" type="text" required>
          </label>
          <label class="field">
            <span>Correo</span>
            <input name="email" type="email" required>
          </label>
          <label class="field">
            <span>Nivel</span>
            <select id="admissionLevel" name="level">
              <option value="Inicial">Inicial</option>
              <option value="Primaria" selected>Primaria</option>
              <option value="Secundaria">Secundaria</option>
            </select>
          </label>
          <label class="field">
            <span>Grado</span>
            <select id="admissionGrade" name="grade">${buildGradeOptions("Primaria", "5°")}</select>
          </label>
          <label class="field">
            <span>Seccion</span>
            <select id="admissionSection" name="section">
              ${SECTIONS.map((section) => `<option value="${section}">${section}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Apoderado</span>
            <input name="guardianName" type="text" required>
          </label>
          <label class="field">
            <span>Telefono del apoderado</span>
            <input name="guardianPhone" type="text" required>
          </label>
          <label class="field field-full">
            <span>Observaciones</span>
            <textarea name="observations" placeholder="Datos administrativos o academicos relevantes"></textarea>
          </label>
          <div class="field field-full">
            <span id="vacancyHint">Vacantes disponibles: ${vacancy.available} de ${vacancy.capacity}</span>
            <button class="button button-primary" type="submit">Guardar matricula</button>
          </div>
        </form>
      </article>

      <article class="table-card">
        <h3>Historial de matriculas</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Alumno</th>
                <th>Nivel / grado</th>
                <th>Apoderado</th>
                <th>Ingreso</th>
                <th>Año</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents.length ? filteredStudents.map((student) => `
                <tr>
                  <td>${escapeHtml(student.code)}</td>
                  <td>
                    <strong>${escapeHtml(student.fullName)}</strong><br>
                    <small>${escapeHtml(student.dni)}</small>
                  </td>
                  <td>${escapeHtml(`${student.level} ${student.grade} ${student.section}`)}</td>
                  <td>${escapeHtml(student.guardianName)}</td>
                  <td>${escapeHtml(student.admissionType)}</td>
                  <td>${escapeHtml(student.year)}</td>
                  <td>
                    <div class="button-row">
                      <button class="link-button" type="button" data-select-student="${student.id}">Ver perfil</button>
                      <button class="link-button" type="button" data-delete-student="${student.id}">Eliminar</button>
                    </div>
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="7">No hay alumnos que coincidan con la busqueda actual.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};

renderStaffSection = function renderStaffSectionEnhancedCrud() {
  const totalTeachers = state.data.staff.filter((person) => person.role === "Docente").length;
  const totalAdministrative = state.data.staff.length - totalTeachers;
  const canGenerateStaffAccess = canManageCredentialAccounts();
  const credentialNotice = state.credentialsNotice && state.credentialsNotice.sourceLabel
    ? `
      <article class="notice-card">
        <p><strong>${escapeHtml(state.credentialsNotice.sourceLabel)}</strong></p>
        <p>${escapeHtml(state.credentialsNotice.name)} · ${escapeHtml(state.credentialsNotice.role)}</p>
        <p><strong>Usuario:</strong> <code>${escapeHtml(state.credentialsNotice.username)}</code></p>
        <p><strong>Contrasena temporal:</strong> <code>${escapeHtml(state.credentialsNotice.password)}</code></p>
      </article>
    `
    : "";

  refs.sections.staff.innerHTML = `
    ${renderSectionHeader("Docentes y personal", "Registro, asignacion de secciones y generacion de accesos para docentes y personal administrativo.")}

    <div class="inline-metrics">
      <span class="tag">${totalTeachers} docentes</span>
      <span class="tag">${totalAdministrative} administrativos</span>
      <span class="tag">${state.data.staff.length} registros activos</span>
    </div>

    ${credentialNotice}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Registrar personal</h3>
        <form id="staffForm" class="form-grid">
          <label class="field">
            <span>Tipo</span>
            <select name="role">
              <option value="Docente">Docente</option>
              <option value="${escapeHtml(ACCESS_MANAGER_ROLE)}">${escapeHtml(ACCESS_MANAGER_ROLE)}</option>
              <option value="Administrativo">Administrativo</option>
              <option value="Secretaria">Secretaria</option>
              <option value="Tesoreria">Tesoreria</option>
              <option value="Coordinacion academica">Coordinacion academica</option>
            </select>
          </label>
          <label class="field">
            <span>Nombre completo</span>
            <input name="name" type="text" required>
          </label>
          <label class="field">
            <span>Area o especialidad</span>
            <input name="area" type="text" required>
          </label>
          <label class="field">
            <span>Correo</span>
            <input name="email" type="email" required>
          </label>
          <label class="field">
            <span>Telefono</span>
            <input name="phone" type="text">
          </label>
          <label class="field">
            <span>Horario asignado</span>
            <input name="schedule" type="text" placeholder="Lun a Vie 7:30 - 13:30" required>
          </label>
          <label class="field">
            <span>Nivel a cargo</span>
            <select name="assignmentLevel">
              <option value="Inicial">Inicial</option>
              <option value="Primaria">Primaria</option>
              <option value="Secundaria" selected>Secundaria</option>
            </select>
          </label>
          <label class="field">
            <span>Cursos asignados</span>
            <input name="courses" type="text" placeholder="Ejemplo: Matematica, Algebra">
          </label>
          <label class="field">
            <span>Secciones asignadas</span>
            <input name="grades" type="text" placeholder="Ejemplo: 5° A, 5° B">
          </label>
          <label class="field">
            <span>Rol de acceso institucional</span>
            <select name="accessRole">
              <option value="automatic">Automatico segun el puesto</option>
              <option value="none">Sin acceso por ahora</option>
              ${CREDENTIAL_ROLE_OPTIONS.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Usuario sugerido</span>
            <input name="preferredUsername" type="text" placeholder="Opcional, se genera automaticamente">
          </label>
          <label class="field field-full">
            <span>Historial laboral</span>
            <input name="tenure" type="text" placeholder="2026 - actual">
          </label>
          <p class="helper-text field-full">
            ${canGenerateStaffAccess
              ? "Administracion puede dejar asignados cursos, secciones y acceso institucional en un solo registro."
              : "Solo Administracion y Control de accesos pueden emitir usuarios y contrasenas desde este formulario."}
          </p>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Registrar personal</button>
          </div>
        </form>
      </article>

      <article class="table-card">
        <h3>Listado de personal</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Area</th>
                <th>Asignacion</th>
                <th>Horario</th>
                <th>Acceso</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              ${state.data.staff.map((person) => `
                <tr>
                  <td>${escapeHtml(person.id)}</td>
                  <td>${escapeHtml(person.name)}<br><small>${escapeHtml(person.email)}</small>${getStaffCredentialUsername(person) ? `<br><small>Usuario: ${escapeHtml(getStaffCredentialUsername(person))}</small>` : ""}</td>
                  <td>${escapeHtml(person.role)}</td>
                  <td>${escapeHtml(person.area)}</td>
                  <td>${escapeHtml(`${person.assignmentLevel || "-"} · ${person.courses} · ${person.grades}`)}</td>
                  <td>${escapeHtml(person.schedule)}</td>
                  <td>${escapeHtml(person.authRole || "Sin acceso")}</td>
                  <td><button class="link-button" type="button" data-delete-staff="${person.id}">Eliminar</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};

renderFinanceSection = function renderFinanceSectionEnhancedCrud() {
  const accountRows = state.data.students.map((student) => {
    const summary = getStudentFinancialSummary(student.id);
    return { student, summary };
  });

  refs.sections.finance.innerHTML = `
    ${renderSectionHeader("Pagos y finanzas", "Registro de matriculas, pensiones, uniformes y nuevos pagos manuales.")}

    <div class="metric-grid">
      <article class="mini-card">
        <h3>Total pagado</h3>
        <p class="metric-number">${formatCurrency(getTotalCollected())}</p>
      </article>
      <article class="mini-card">
        <h3>Total pendiente</h3>
        <p class="metric-number">${formatCurrency(getPendingAmount())}</p>
      </article>
      <article class="mini-card">
        <h3>Pagos del dia</h3>
        <p class="metric-number">${formatCurrency(getTodayPaymentsAmount())}</p>
      </article>
      <article class="mini-card">
        <h3>Morosidad</h3>
        <p class="metric-number">${getOverduePayments().length}</p>
      </article>
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>Registrar nuevo pago</h3>
        <form id="paymentForm" class="form-stack">
          <label class="field">
            <span>Alumno</span>
            <select name="studentId">
              ${state.data.students.map((student) => `<option value="${student.id}">${escapeHtml(student.fullName)} · ${escapeHtml(student.code)}</option>`).join("")}
            </select>
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Concepto</span>
              <select name="conceptPreset">
                <option value="Matricula">Matricula</option>
                <option value="Pension">Pension</option>
                <option value="Buso institucional">Buso institucional</option>
                <option value="Uniforme institucional">Uniforme institucional</option>
                <option value="Taller">Taller</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
            <label class="field">
              <span>Concepto personalizado</span>
              <input name="customConcept" type="text" placeholder="Usar solo si elegiste Otro">
            </label>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Monto total</span>
              <input name="amount" type="number" min="0" step="0.01" required>
            </label>
            <label class="field">
              <span>Monto pagado</span>
              <input name="paid" type="number" min="0" step="0.01" value="0">
            </label>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Vencimiento</span>
              <input name="dueDate" type="date" required>
            </label>
            <label class="field">
              <span>Fecha de pago</span>
              <input name="paymentDate" type="date">
            </label>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Comprobante</span>
              <select name="documentType">
                <option value="Boleta">Boleta</option>
                <option value="Factura">Factura</option>
              </select>
            </label>
            <label class="field">
              <span>Numero de comprobante</span>
              <input name="receipt" type="text" placeholder="B001-0100">
            </label>
          </div>
          <button class="button button-primary" type="submit">Agregar pago</button>
        </form>
      </article>

      <article class="table-card">
        <h3>Estado de cuenta por alumno</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Pendiente</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              ${accountRows.map(({ student, summary }) => `
                <tr>
                  <td>${escapeHtml(student.fullName)}</td>
                  <td>${formatCurrency(summary.total)}</td>
                  <td>${formatCurrency(summary.paid)}</td>
                  <td>${formatCurrency(summary.pending)}</td>
                  <td><button class="link-button" type="button" data-select-student="${student.id}">Ver alumno</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <article class="table-card">
      <h3>Historial de pagos</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Alumno</th>
              <th>Concepto</th>
              <th>Estado</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            ${state.data.payments.map((payment) => {
              const student = getStudentById(payment.studentId);
              return `
                <tr>
                  <td>${formatDate(payment.date)}</td>
                  <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                  <td>${escapeHtml(payment.concept)}<br><small>${formatCurrency(payment.amount)}</small></td>
                  <td>${renderStatusPill(payment.status)}</td>
                  <td>
                    ${escapeHtml(payment.documentType)} ${escapeHtml(payment.receipt)}<br>
                    ${payment.paid > 0 ? `<button class="link-button" type="button" data-print-receipt="${payment.id}">Imprimir</button>` : "Sin comprobante"}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

function deleteStudentCascade(studentId) {
  state.data.students = state.data.students.filter((student) => student.id !== studentId);
  state.data.grades = state.data.grades.filter((grade) => grade.studentId !== studentId);
  state.data.payments = state.data.payments.filter((payment) => payment.studentId !== studentId);
  state.data.supplies = state.data.supplies.filter((supply) => supply.studentId !== studentId);
  state.data.documents = state.data.documents.filter((documentItem) => documentItem.studentId !== studentId);
  if (state.selectedStudentId === studentId) {
    state.selectedStudentId = state.data.students[0] ? state.data.students[0].id : null;
  }
  if (state.documentStudentId === studentId) {
    state.documentStudentId = state.selectedStudentId;
  }
  if (state.supplyStudentId === studentId) {
    state.supplyStudentId = state.selectedStudentId;
  }
  persistData();
}

function deleteStaffCascade(staffId) {
  const person = state.data.staff.find((item) => item.id === staffId);
  if (!person) {
    return;
  }
  state.data.staff = state.data.staff.filter((item) => item.id !== staffId);
  state.data.planning = state.data.planning.filter((item) => item.teacherId !== staffId && item.teacher !== person.name);
  state.data.courses = state.data.courses.filter((course) => course.teacher !== person.name);
  state.data.gradeTables = state.data.gradeTables.filter((table) => normalizeText(table.teacher) !== normalizeText(person.name));
  state.credentialsDirectory = state.credentialsDirectory.filter((account) =>
    account.username !== person.loginUsername &&
    normalizeText(account.name) !== normalizeText(person.name)
  );
  Object.keys(USERS).forEach((username) => {
    if (USERS[username]?.name === person.name || username === person.loginUsername) {
      delete USERS[username];
    }
  });
  persistData();
}
nextStudentId = function nextStudentIdRobust() {
  const max = state.data.students.reduce((currentMax, student) => {
    const match = String(student.id || "").match(/ALU-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `ALU-${String(max + 1).padStart(3, "0")}`;
};

nextStudentCode = function nextStudentCodeRobust() {
  const max = state.data.students.reduce((currentMax, student) => {
    const parts = String(student.code || "").split("-");
    const value = Number(parts[parts.length - 1] || 0);
    return Math.max(currentMax, value);
  }, 0);
  return `${state.data.school.academicYear}-${String(max + 1).padStart(4, "0")}`;
};

nextPaymentId = function nextPaymentIdRobust() {
  const max = state.data.payments.reduce((currentMax, payment) => {
    const match = String(payment.id || "").match(/PAY-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `PAY-${String(max + 1).padStart(3, "0")}`;
};

nextStaffId = function nextStaffIdRobust(role) {
  const prefix = role === "Docente" ? "DOC" : "PER";
  const max = state.data.staff.reduce((currentMax, person) => {
    const match = String(person.id || "").match(new RegExp(`^${prefix}-(\\d+)$`));
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
};

nextScheduleId = function nextScheduleIdRobust() {
  const max = state.data.schedules.reduce((currentMax, schedule) => {
    const match = String(schedule.id || "").match(/SCH-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `SCH-${String(max + 1).padStart(3, "0")}`;
};

const TRIMESTER_OPTIONS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];
const DEFAULT_ASSESSMENT_TYPES = [
  "Tareas",
  "Examen de avance",
  "Examen trimestral",
  "Participacion",
  "Trabajos"
];
const SIMULATION_TYPES = ["Primer simulacro", "Segundo simulacro", "Tercer simulacro"];

if (!MODULES.some((moduleItem) => moduleItem.id === "direction")) {
  MODULES.splice(1, 0, { id: "direction", label: "Direccion", hint: "Notas, docentes y simulacros" });
}

if (!MODULES.some((moduleItem) => moduleItem.id === "attendance")) {
  MODULES.splice(2, 0, { id: "attendance", label: "Asistencias", hint: "Registro diario" });
}

if (!REPORT_DEFINITIONS.some((report) => report.id === "simulacros")) {
  REPORT_DEFINITIONS.push({
    id: "simulacros",
    label: "Reporte de simulacros",
    description: "Ranking de puntajes por simulacro con puestos, fecha y estudiante."
  });
}

if (!REPORT_DEFINITIONS.some((report) => report.id === "asistencias")) {
  REPORT_DEFINITIONS.push({
    id: "asistencias",
    label: "Reporte de asistencias",
    description: "Registro diario por alumno con estado presente, tarde, ausente o retirado."
  });
}

ROLE_ACCESS.Administrador = Array.from(new Set([...(ROLE_ACCESS.Administrador || []), "direction"]));
ROLE_ACCESS.Direccion = Array.from(new Set([...(ROLE_ACCESS.Direccion || []), "direction", "attendance", "settings"]));
ROLE_ACCESS.Secretaria = Array.from(new Set([...(ROLE_ACCESS.Secretaria || []), "attendance", "settings"]));
ROLE_ACCESS.Administrador = Array.from(new Set([...(ROLE_ACCESS.Administrador || []), "attendance", "direction", "settings"]));
ROLE_ACCESS.Docentes = ["dashboard", "academic", "attendance", "profile", "planning", "schedule", "activities", "documents"];

state.academicFilters = state.academicFilters || {
  assignmentKey: "",
  trimester: "Trimestre 1",
  assessmentType: "Examen de avance"
};
state.directionFilters = state.directionFilters || {
  simulationType: "Primer simulacro",
  position: "Todos",
  publicSimulationType: "Todas",
  publicLookupDni: "",
  publicResults: [],
  publicTopThree: [],
  publicResolvedSimulationType: ""
};
state.attendanceFilters = state.attendanceFilters || {
  date: isoDate(0),
  status: "Todos",
  section: ""
};
state.attendanceFilters.section = state.attendanceFilters.section || "";
state.teacherProfileSection = state.teacherProfileSection || "";

const previousCacheDomDirection = cacheDom;
cacheDom = function cacheDomDirection() {
  previousCacheDomDirection();
  refs.sections.direction = document.getElementById("directionSection");
  refs.sections.attendance = document.getElementById("attendanceSection");
  refs.publicSimulationView = document.getElementById("publicSimulacroView");
  refs.publicSimulationUrlText = document.getElementById("publicSimulationUrlText");
  refs.publicSimulationResults = document.getElementById("publicSimulationResults");
};

const previousHydrateDataDirection = hydrateData;
hydrateData = function hydrateDataDirection(sourceData) {
  const data = previousHydrateDataDirection(sourceData);
  ensureAcademicExtensions(data);
  return data;
};

const previousRenderSectionsDirection = renderSections;
renderSections = function renderSectionsDirection() {
  previousRenderSectionsDirection();
  renderAttendanceSection();
  renderDirectionSection();
  renderPublicSimulationView();
};

const previousRenderAppDirection = renderApp;
renderApp = function renderAppDirection() {
  previousRenderAppDirection();
  syncPublicSimulationRoute();
};

const previousBuildReportDataset = buildReportDataset;
buildReportDataset = function buildReportDatasetEnhanced(reportId) {
  if (reportId === "academico") {
    const teacherView = state.session?.role === "Docentes";
    const teacherName = getSessionDisplayName();
    const rows = getVisibleAcademicRecords(teacherView ? teacherName : "").map((record) => {
      const student = getStudentById(record.studentId);
      return [
        student ? student.fullName : "Alumno",
        record.sectionKey || (student ? `${student.grade} ${student.section}` : "-"),
        record.course,
        record.teacher,
        record.trimester || normalizeTrimester(record.period),
        record.assessmentType || "Examen de avance",
        String(record.score),
        formatAverageValue(getStudentTrimesterAverage(record.studentId, createAssignmentFromRecord(record), record.trimester || normalizeTrimester(record.period))),
        formatAverageValue(getStudentFinalAverage(record.studentId, createAssignmentFromRecord(record)))
      ];
    });
    return {
      title: teacherView ? `Reporte academico del docente ${teacherName}` : "Reporte academico",
      fileName: teacherView ? `reporte_academico_${slugifyValue(teacherName)}` : "reporte_academico",
      headers: ["Alumno", "Aula", "Curso", "Docente", "Trimestre", "Tipo de evaluacion", "Nota", "Promedio trimestral", "Promedio final"],
      rows
    };
  }

  if (reportId === "simulacros") {
    const ranking = getSimulationRanking(state.directionFilters.simulationType, state.directionFilters.position);
    return {
      title: `Ranking ${state.directionFilters.simulationType}`,
      fileName: `simulacro_${slugifyValue(state.directionFilters.simulationType)}`,
      headers: ["Puesto", "Alumno", "DNI", "Simulacro", "Fecha", "Puntaje"],
      rows: ranking.map((item) => [
        String(item.position),
        item.studentName,
        item.dni,
        item.simulationType,
        item.date,
        String(item.totalScore)
      ])
    };
  }

  if (reportId === "asistencias") {
    const rows = getFilteredAttendanceRows().map((entry) => {
      const student = getStudentById(entry.studentId);
      return [
        entry.date,
        student ? student.fullName : "Alumno",
        student ? student.dni : "-",
        student ? `${student.level} ${student.grade} ${student.section}` : "-",
        entry.status,
        entry.notes || "-"
      ];
    });
    return {
      title: `Reporte de asistencias ${state.attendanceFilters.date}`,
      fileName: `reporte_asistencias_${state.attendanceFilters.date}`,
      headers: ["Fecha", "Alumno", "DNI", "Aula", "Estado", "Observaciones"],
      rows
    };
  }

  return previousBuildReportDataset(reportId);
};

const previousGetStudentAverageEnhanced = getStudentAverage;
getStudentAverage = function getStudentAverageEnhanced(studentId) {
  const studentGrades = state.data.grades.filter((grade) => grade.studentId === studentId);
  if (!studentGrades.length) {
    return previousGetStudentAverageEnhanced(studentId);
  }

  const assignmentMap = new Map();
  studentGrades.forEach((grade) => {
    const assignment = createAssignmentFromRecord(grade);
    assignmentMap.set(buildAssignmentKey(assignment), assignment);
  });

  const averages = Array.from(assignmentMap.values())
    .map((assignment) => getStudentFinalAverage(studentId, assignment))
    .filter((value) => value > 0);

  if (!averages.length) {
    return previousGetStudentAverageEnhanced(studentId);
  }

  return averages.reduce((total, value) => total + value, 0) / averages.length;
};

function ensureAcademicExtensions(data) {
  data.gradeTables = normalizeGradeTables(data.gradeTables, data.courses);
  data.grades = (Array.isArray(data.grades) ? data.grades : []).map((grade, index) => normalizeGradeRecord(grade, data, index));
  data.simulations = normalizeSimulations(data.simulations, data.students);
  data.attendance = normalizeAttendance(data.attendance, data.students);
}

function normalizeGradeRecord(grade, data, index) {
  const record = {
    id: grade.id || `GRD-${String(index + 1).padStart(4, "0")}`,
    studentId: String(grade.studentId || ""),
    course: String(grade.course || ""),
    teacher: String(grade.teacher || ""),
    period: normalizeTrimester(grade.period || grade.trimester),
    trimester: normalizeTrimester(grade.trimester || grade.period),
    assessmentType: String(grade.assessmentType || DEFAULT_ASSESSMENT_TYPES[0]),
    sectionKey: String(grade.sectionKey || ""),
    score: Number(grade.score || 0),
    recordedAt: String(grade.recordedAt || isoDate(0))
  };

  if (!record.sectionKey) {
    record.sectionKey = inferGradeSectionKey(record, data);
  }

  return record;
}

function normalizeGradeTables(tables, courses) {
  const fallbackTables = buildDefaultGradeTables(courses);
  if (!Array.isArray(tables) || !tables.length) {
    return fallbackTables;
  }

  const normalized = tables.map((table, index) => ({
    id: String(table.id || `GTB-${String(index + 1).padStart(3, "0")}`),
    teacher: String(table.teacher || ""),
    course: String(table.course || ""),
    section: String(table.section || ""),
    assessmentTypes: Array.isArray(table.assessmentTypes) && table.assessmentTypes.length
      ? table.assessmentTypes.map((item) => String(item || "").trim()).filter(Boolean)
      : [...DEFAULT_ASSESSMENT_TYPES],
    updatedAt: String(table.updatedAt || isoDate(0))
  }));

  buildDefaultGradeTables(courses).forEach((fallback) => {
    if (!normalized.some((item) => buildGradeTableKey(item) === buildGradeTableKey(fallback))) {
      normalized.push(fallback);
    }
  });

  return normalized;
}

function buildDefaultGradeTables(courses) {
  const unique = new Map();
  (Array.isArray(courses) ? courses : []).forEach((course, index) => {
    const table = {
      id: `GTB-${String(index + 1).padStart(3, "0")}`,
      teacher: String(course.teacher || ""),
      course: String(course.course || ""),
      section: String(course.section || ""),
      assessmentTypes: [...DEFAULT_ASSESSMENT_TYPES],
      updatedAt: isoDate(0)
    };
    unique.set(buildGradeTableKey(table), table);
  });
  return Array.from(unique.values());
}

function normalizeSimulations(simulations, students) {
  if (!Array.isArray(simulations) || !simulations.length) {
    const baseStudents = Array.isArray(students) ? students.slice(0, 4) : [];
    return baseStudents.map((student, index) => ({
      id: `SIM-${String(index + 1).padStart(3, "0")}`,
      simulationType: "Primer simulacro",
      studentId: student.id,
      studentName: student.fullName,
      dni: student.dni,
      totalScore: 1750 - (index * 80),
      date: isoDate(-14)
    }));
  }

  return simulations.map((item, index) => {
    const student = Array.isArray(students) ? students.find((entry) => entry.id === item.studentId || entry.dni === item.dni) : null;
    return {
      id: String(item.id || `SIM-${String(index + 1).padStart(3, "0")}`),
      simulationType: normalizeSimulationType(item.simulationType),
      studentId: String(item.studentId || student?.id || ""),
      studentName: String(item.studentName || student?.fullName || "Alumno"),
      dni: String(item.dni || student?.dni || ""),
      totalScore: Number(item.totalScore || 0),
      date: String(item.date || isoDate(0))
    };
  });
}

function normalizeAttendance(attendance, students) {
  if (!Array.isArray(attendance) || !attendance.length) {
    return (Array.isArray(students) ? students : []).map((student, index) => ({
      id: `ATT-${String(index + 1).padStart(4, "0")}`,
      studentId: student.id,
      date: isoDate(0),
      status: index % 4 === 0 ? "Llego tarde" : "Presente",
      notes: ""
    }));
  }

  return attendance.map((item, index) => ({
    id: String(item.id || `ATT-${String(index + 1).padStart(4, "0")}`),
    studentId: String(item.studentId || ""),
    date: String(item.date || isoDate(0)),
    status: String(item.status || "Presente"),
    notes: String(item.notes || "")
  }));
}

function normalizeTrimester(value) {
  const text = normalizeText(value || "Trimestre 1");
  if (text.includes("3")) {
    return "Trimestre 3";
  }
  if (text.includes("2")) {
    return "Trimestre 2";
  }
  return "Trimestre 1";
}

function normalizeSimulationType(value) {
  const text = normalizeText(value || "Primer simulacro");
  if (text.includes("tercer") || text.includes("3")) {
    return "Tercer simulacro";
  }
  if (text.includes("segundo") || text.includes("2")) {
    return "Segundo simulacro";
  }
  return "Primer simulacro";
}

function buildAssignmentKey(assignment) {
  return [assignment.teacher, assignment.course, assignment.section].map((item) => normalizeText(item)).join("|");
}

function buildGradeTableKey(table) {
  return [table.teacher, table.course, table.section].map((item) => normalizeText(item)).join("|");
}

function parseAssignmentKey(key) {
  const assignments = getVisibleAcademicAssignments();
  return assignments.find((assignment) => buildAssignmentKey(assignment) === String(key || "")) || assignments[0] || null;
}

function createAssignmentFromRecord(record) {
  return {
    teacher: record.teacher,
    course: record.course,
    section: record.sectionKey || inferGradeSectionKey(record, state.data)
  };
}

function getVisibleAcademicAssignments(teacherName = "") {
  const source = teacherName
    ? state.data.courses.filter((course) => normalizeText(course.teacher) === normalizeText(teacherName))
    : state.data.courses;
  const unique = new Map();
  source.forEach((course) => {
    const assignment = {
      teacher: course.teacher,
      course: course.course,
      section: course.section,
      level: course.level
    };
    unique.set(buildAssignmentKey(assignment), assignment);
  });
  return Array.from(unique.values());
}

function syncAcademicFilterState(assignments = getVisibleAcademicAssignments(state.session?.role === "Docentes" ? getSessionDisplayName() : "")) {
  if (!assignments.length) {
    state.academicFilters.assignmentKey = "";
    return;
  }

  const exists = assignments.some((assignment) => buildAssignmentKey(assignment) === state.academicFilters.assignmentKey);
  if (!exists) {
    state.academicFilters.assignmentKey = buildAssignmentKey(assignments[0]);
  }

  const currentAssignment = parseAssignmentKey(state.academicFilters.assignmentKey);
  const assessmentTypes = currentAssignment ? getAssessmentTypesForAssignment(currentAssignment) : [...DEFAULT_ASSESSMENT_TYPES];
  if (!assessmentTypes.includes(state.academicFilters.assessmentType)) {
    state.academicFilters.assessmentType = assessmentTypes[0];
  }
  state.academicFilters.trimester = normalizeTrimester(state.academicFilters.trimester);
}

function getAssessmentTypesForAssignment(assignment) {
  if (!assignment) {
    return [...DEFAULT_ASSESSMENT_TYPES];
  }
  const table = state.data.gradeTables.find((item) => buildGradeTableKey(item) === buildGradeTableKey(assignment));
  return table?.assessmentTypes?.length ? table.assessmentTypes : [...DEFAULT_ASSESSMENT_TYPES];
}

function upsertGradeTable(table) {
  const existing = state.data.gradeTables.find((item) => buildGradeTableKey(item) === buildGradeTableKey(table));
  if (existing) {
    existing.assessmentTypes = [...table.assessmentTypes];
    existing.updatedAt = isoDate(0);
    return existing;
  }
  const created = {
    id: `GTB-${String(state.data.gradeTables.length + 1).padStart(3, "0")}`,
    teacher: table.teacher,
    course: table.course,
    section: table.section,
    assessmentTypes: [...table.assessmentTypes],
    updatedAt: isoDate(0)
  };
  state.data.gradeTables.push(created);
  return created;
}

function inferGradeSectionKey(grade, data) {
  const student = data.students.find((item) => item.id === grade.studentId);
  const directMatch = data.courses.find((course) =>
    normalizeText(course.course) === normalizeText(grade.course) &&
    (!grade.teacher || normalizeText(course.teacher) === normalizeText(grade.teacher)) &&
    student &&
    normalizeText(course.section) === normalizeText(`${student.grade} ${student.section}`)
  );
  if (directMatch) {
    return directMatch.section;
  }
  if (student) {
    return `${student.grade} ${student.section}`;
  }
  return "";
}

function getStudentsForAssignment(assignment) {
  if (!assignment) {
    return [];
  }
  return state.data.students.filter((student) => normalizeText(`${student.grade} ${student.section}`) === normalizeText(assignment.section));
}

function getGradesForAssignment(assignment) {
  if (!assignment) {
    return [];
  }
  return state.data.grades
    .filter((grade) =>
      normalizeText(grade.course) === normalizeText(assignment.course) &&
      normalizeText(grade.teacher) === normalizeText(assignment.teacher) &&
      normalizeText(grade.sectionKey || inferGradeSectionKey(grade, state.data)) === normalizeText(assignment.section)
    )
    .sort((left, right) => String(right.recordedAt || "").localeCompare(String(left.recordedAt || "")));
}

function getStudentTrimesterAverage(studentId, assignment, trimester) {
  const grades = getGradesForAssignment(assignment).filter((grade) => grade.studentId === studentId && normalizeTrimester(grade.trimester || grade.period) === normalizeTrimester(trimester));
  if (!grades.length) {
    return 0;
  }
  return grades.reduce((total, grade) => total + Number(grade.score || 0), 0) / grades.length;
}

function getStudentFinalAverage(studentId, assignment) {
  const trimesterAverages = TRIMESTER_OPTIONS
    .map((trimester) => getStudentTrimesterAverage(studentId, assignment, trimester))
    .filter((value) => value > 0);
  if (!trimesterAverages.length) {
    return 0;
  }
  return trimesterAverages.reduce((total, value) => total + value, 0) / trimesterAverages.length;
}

function getCombinedAssignmentAverage(studentId, assignments = []) {
  const averages = assignments
    .map((assignment) => getStudentFinalAverage(studentId, assignment))
    .filter((value) => value > 0);
  if (!averages.length) {
    return 0;
  }
  return averages.reduce((total, value) => total + value, 0) / averages.length;
}

function getSchedulesForTeacher(teacherName) {
  const sections = new Set(getTeacherSections(teacherName));
  return state.data.schedules.filter((schedule) => {
    const shortKey = normalizeText(String(schedule.sectionKey || "").replace(/^(primaria|secundaria|inicial)\s+/i, ""));
    const fullKey = normalizeText(schedule.sectionKey);
    return sections.has(shortKey) || sections.has(fullKey);
  });
}

function getSchedulesForAssignment(assignment) {
  return state.data.schedules.filter((schedule) =>
    normalizeText(String(schedule.sectionKey || "").replace(/^(primaria|secundaria|inicial)\s+/i, "")) === normalizeText(assignment.section) ||
    normalizeText(schedule.sectionKey) === normalizeText(assignment.section)
  );
}

function getVisibleAcademicRecords(teacherName = "") {
  const records = teacherName
    ? state.data.grades.filter((grade) => normalizeText(grade.teacher) === normalizeText(teacherName))
    : state.data.grades;
  return records.map((grade, index) => normalizeGradeRecord(grade, state.data, index));
}

function getGlobalAcademicSummaryRows() {
  const assignmentMap = new Map();
  state.data.grades.forEach((grade) => {
    const assignment = createAssignmentFromRecord(grade);
    assignmentMap.set(`${grade.studentId}|${buildAssignmentKey(assignment)}`, { studentId: grade.studentId, assignment });
  });

  return Array.from(assignmentMap.values()).map((item) => {
    const student = getStudentById(item.studentId);
    return {
      studentName: student?.fullName || "Alumno",
      course: item.assignment.course,
      section: item.assignment.section,
      trimester1: getStudentTrimesterAverage(item.studentId, item.assignment, "Trimestre 1"),
      trimester2: getStudentTrimesterAverage(item.studentId, item.assignment, "Trimestre 2"),
      trimester3: getStudentTrimesterAverage(item.studentId, item.assignment, "Trimestre 3"),
      finalAverage: getStudentFinalAverage(item.studentId, item.assignment)
    };
  }).sort((left, right) => left.studentName.localeCompare(right.studentName));
}

function getSimulationRanking(simulationType, positionFilter = "Todos") {
  const normalizedSimulation = normalizeSimulationType(simulationType);
  const ranked = state.data.simulations
    .filter((item) => normalizeSimulationType(item.simulationType) === normalizedSimulation)
    .sort((left, right) => Number(right.totalScore || 0) - Number(left.totalScore || 0))
    .map((item, index) => ({
      ...item,
      position: index + 1
    }));

  if (positionFilter === "Todos") {
    return ranked;
  }
  return ranked.filter((item) => String(item.position) === String(positionFilter));
}

async function fetchPublicSimulationResults(dni, simulationType) {
  try {
    if (typeof backendRuntime !== "undefined" && backendRuntime.available) {
      const response = await apiFetch(`/simulacros-public?dni=${encodeURIComponent(dni)}&simulationType=${encodeURIComponent(simulationType)}`, { method: "GET" }, true);
      if (response.ok && Array.isArray(response.results)) {
        return {
          results: response.results,
          topThree: Array.isArray(response.topThree) ? response.topThree : [],
          simulationTypeApplied: String(response.simulationTypeApplied || "")
        };
      }
    }
  } catch (error) {
    // Fall back to local lookup when the endpoint is unavailable.
  }

  const requestedType = simulationType === "Todas" ? "Todas" : normalizeSimulationType(simulationType);
  const grouped = SIMULATION_TYPES.flatMap((type) => getSimulationRanking(type).map((item) => ({ ...item, simulationType: type })));
  const results = grouped
    .filter((item) => item.dni === dni && (requestedType === "Todas" || normalizeSimulationType(item.simulationType) === requestedType))
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  const simulationTypeApplied = requestedType === "Todas"
    ? (results[0]?.simulationType || "")
    : requestedType;
  return {
    results,
    topThree: simulationTypeApplied ? getSimulationRanking(simulationTypeApplied).slice(0, 3) : [],
    simulationTypeApplied
  };
}

function renderScheduleMiniCard(schedule) {
  return `
    <div class="schedule-mini-card">
      <div class="chip-row">
        <span class="tag">${escapeHtml(schedule.level)}</span>
        <span class="tag">${escapeHtml(schedule.room)}</span>
      </div>
      <h3>${escapeHtml(schedule.sectionKey)}</h3>
      <div class="table-wrap">
        <table class="schedule-grid-table">
          <thead>
            <tr>${schedule.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${schedule.rows.map((row) => `<tr>${row.map((cell) => renderReadonlyScheduleCell(cell)).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function scheduleCellClass(cell) {
  const text = normalizeText(cell);
  if (!text) {
    return "schedule-empty";
  }
  if (text.includes("recreo")) {
    return "schedule-break";
  }
  if (text.includes("salida")) {
    return "schedule-dismissal";
  }
  const hash = text.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return `schedule-tone-${(hash % 5) + 1}`;
}

function renderReadonlyScheduleCell(cell) {
  return `<td class="schedule-cell ${scheduleCellClass(cell)}">${escapeHtml(cell || "-")}</td>`;
}

function renderEditableScheduleCell(cell, rowIndex, cellIndex) {
  return `<td class="schedule-cell ${scheduleCellClass(cell)}"><input name="row-${rowIndex}-${cellIndex}" type="text" value="${escapeHtml(cell)}"></td>`;
}

function formatAverageValue(value) {
  return Number(value || 0) > 0 ? Number(value).toFixed(1) : "-";
}

function nextGradeId() {
  const max = state.data.grades.reduce((currentMax, grade) => {
    const match = String(grade.id || "").match(/GRD-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `GRD-${String(max + 1).padStart(4, "0")}`;
}

function nextSimulationId() {
  const max = state.data.simulations.reduce((currentMax, item) => {
    const match = String(item.id || "").match(/SIM-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `SIM-${String(max + 1).padStart(3, "0")}`;
}

function slugifyValue(value) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function copyPublicSimulationLink() {
  const url = getPublicSimulationUrl();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("Enlace de consulta publica copiado.");
    }).catch(() => {
      window.prompt("Copia este enlace:", url);
    });
    return;
  }
  window.prompt("Copia este enlace:", url);
}

function getPublicSimulationUrl() {
  return `${window.location.origin}/simulacros-consulta`;
}

function syncPublicSimulationRoute() {
  const publicMode = window.location.pathname.replace(/\/+$/, "") === "/simulacros-consulta" || window.location.hash === "#simulacros-consulta";
  if (!refs.publicSimulationView) {
    return;
  }

  refs.publicSimulationView.classList.toggle("hidden", !publicMode);

  if (publicMode) {
    refs.loginView.classList.add("hidden");
    refs.appShell.classList.add("hidden");
    renderPublicSimulationView();
    return;
  }

  if (state.session) {
    refs.loginView.classList.add("hidden");
    refs.appShell.classList.remove("hidden");
  } else {
    refs.loginView.classList.remove("hidden");
    refs.appShell.classList.add("hidden");
  }
}

function openPublicSimulationRoute() {
  const url = "/simulacros-consulta";
  if (window.location.pathname !== url) {
    window.history.pushState({}, "", url);
  }
  syncPublicSimulationRoute();
}

function closePublicSimulationRoute() {
  if (window.location.pathname !== "/") {
    window.history.pushState({}, "", "/");
  } else if (window.location.hash) {
    window.history.pushState({}, "", "/");
  }
  syncPublicSimulationRoute();
}

window.addEventListener("popstate", () => {
  syncPublicSimulationRoute();
});

window.addEventListener("hashchange", () => {
  syncPublicSimulationRoute();
});

const previousHandleDynamicChangeDirection = handleDynamicChange;
handleDynamicChange = function handleDynamicChangeDirection(event) {
  if (event.target.id === "teacherProfileSectionFilter") {
    state.teacherProfileSection = String(event.target.value || "");
    renderProfileSection();
    return;
  }

  if (event.target.id === "attendanceSectionFilter") {
    state.attendanceFilters.section = String(event.target.value || "");
    renderAttendanceSection();
    return;
  }

  if (event.target.id === "attendanceDateFilter") {
    state.attendanceFilters.date = String(event.target.value || isoDate(0));
    renderAttendanceSection();
    return;
  }

  if (event.target.id === "attendanceStatusFilter") {
    state.attendanceFilters.status = String(event.target.value || "Todos");
    renderAttendanceSection();
    return;
  }

  if (event.target.id === "academicAssignmentSelect") {
    state.academicFilters.assignmentKey = String(event.target.value || "");
    syncAcademicFilterState();
    renderAcademicSection();
    return;
  }

  if (event.target.id === "academicTrimesterSelect") {
    state.academicFilters.trimester = normalizeTrimester(event.target.value);
    renderAcademicSection();
    return;
  }

  if (event.target.id === "academicAssessmentSelect") {
    state.academicFilters.assessmentType = String(event.target.value || DEFAULT_ASSESSMENT_TYPES[0]);
    renderAcademicSection();
    return;
  }

  if (event.target.id === "directionSimulationType") {
    state.directionFilters.simulationType = normalizeSimulationType(event.target.value);
    renderDirectionSection();
    return;
  }

  if (event.target.id === "directionPositionFilter") {
    state.directionFilters.position = String(event.target.value || "Todos");
    renderDirectionSection();
    return;
  }

  if (event.target.id === "publicSimulationType") {
    state.directionFilters.publicSimulationType = String(event.target.value || "Todas");
    return;
  }

  previousHandleDynamicChangeDirection(event);
};

const previousHandleDynamicSubmitDirection = handleDynamicSubmit;
handleDynamicSubmit = async function handleDynamicSubmitDirection(event) {
  if (event.target.id === "credentialCreateForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = String(formData.get("name") || "").trim();
    const role = String(formData.get("role") || "Docentes");

    if (!name) {
      showToast("Ingresa el nombre completo para crear la cuenta.");
      return;
    }

    try {
      await createCredentialAccount({
        name,
        role,
        username: String(formData.get("username") || "").trim(),
        password: String(formData.get("password") || "").trim(),
        sourceLabel: "Acceso creado manualmente"
      });
      if (state.session?.role === "Administrador") {
        persistData();
      }
      event.target.reset();
      await loadCredentialDirectory(true);
      renderCredentialsSection();
      showToast("Acceso creado correctamente.");
    } catch (error) {
      showToast(error.message || "No se pudo crear la cuenta.");
    }
    return;
  }

  if (event.target.matches("[data-credential-update-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      await updateCredentialAccount({
        userId: String(formData.get("userId") || ""),
        currentUsername: String(formData.get("currentUsername") || ""),
        username: String(formData.get("username") || "").trim(),
        name: String(formData.get("name") || "").trim(),
        role: String(formData.get("role") || "Docentes")
      });
      if (state.session?.role === "Administrador") {
        persistData();
      }
      await loadCredentialDirectory(true);
      renderCredentialsSection();
      showToast("Datos de acceso actualizados.");
    } catch (error) {
      showToast(error.message || "No se pudo actualizar la cuenta.");
    }
    return;
  }

  if (event.target.matches("[data-credential-password-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const password = String(formData.get("password") || "").trim();
    if (password.length < 8) {
      showToast("La contrasena manual debe tener al menos 8 caracteres.");
      return;
    }

    try {
      await setCredentialPassword({
        userId: String(formData.get("userId") || ""),
        currentUsername: String(formData.get("currentUsername") || ""),
        password,
        autoGenerate: false
      });
      event.target.reset();
      await loadCredentialDirectory(true);
      renderCredentialsSection();
      showToast("Contrasena actualizada correctamente.");
    } catch (error) {
      showToast(error.message || "No se pudo actualizar la contrasena.");
    }
    return;
  }

  if (event.target.id === "attendanceForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = String(formData.get("studentId") || "");
    const date = String(formData.get("date") || isoDate(0));
    const status = String(formData.get("status") || "Presente");
    const notes = String(formData.get("notes") || "").trim();

    if (!studentId || !date) {
      showToast("Selecciona alumno y fecha para registrar la asistencia.");
      return;
    }

    const existing = state.data.attendance.find((entry) => entry.studentId === studentId && entry.date === date);
    const nextEntry = {
      id: existing?.id || nextAttendanceId(),
      studentId,
      date,
      status,
      notes
    };

    if (existing) {
      Object.assign(existing, nextEntry);
    } else {
      state.data.attendance.push(nextEntry);
    }

    state.attendanceFilters.date = date;
    persistData();
    recordLog(state.session, `Registro de asistencia ${status.toLowerCase()} para ${getStudentById(studentId)?.fullName || studentId}`);
    renderAttendanceSection();
    showToast("Asistencia guardada correctamente.");
    return;
  }

  if (event.target.id === "gradeSchemaForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const assignment = parseAssignmentKey(String(formData.get("assignmentKey") || state.academicFilters.assignmentKey));
    const assessmentTypes = splitList(String(formData.get("assessmentTypes") || ""))
      .map((item) => item.trim())
      .filter(Boolean);

    if (!assignment || !assessmentTypes.length) {
      showToast("Define al menos un tipo de evaluacion para guardar la tabla del curso.");
      return;
    }

    upsertGradeTable({
      teacher: assignment.teacher,
      course: assignment.course,
      section: assignment.section,
      assessmentTypes
    });
    state.academicFilters.assessmentType = assessmentTypes[0];
    persistData();
    recordLog(state.session, `Actualizacion de tabla de evaluacion ${assignment.course} ${assignment.section}`);
    renderAcademicSection();
    showToast("Tabla de evaluacion actualizada correctamente.");
    return;
  }

  if (event.target.id === "gradeForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const assignment = parseAssignmentKey(String(formData.get("assignmentKey") || state.academicFilters.assignmentKey));
    const studentId = String(formData.get("studentId") || "");
    const trimester = normalizeTrimester(formData.get("trimester"));
    const assessmentType = String(formData.get("assessmentType") || DEFAULT_ASSESSMENT_TYPES[0]).trim();
    const score = Number(formData.get("score") || 0);

    if (!assignment || !studentId || !assessmentType || Number.isNaN(score)) {
      showToast("Completa alumno, curso, trimestre, tipo de evaluacion y nota.");
      return;
    }

    const existing = state.data.grades.find((grade) =>
      grade.studentId === studentId &&
      normalizeText(grade.course) === normalizeText(assignment.course) &&
      normalizeText(grade.teacher) === normalizeText(assignment.teacher) &&
      normalizeText(grade.sectionKey || inferGradeSectionKey(grade, state.data)) === normalizeText(assignment.section) &&
      normalizeTrimester(grade.trimester || grade.period) === trimester &&
      normalizeText(grade.assessmentType || "") === normalizeText(assessmentType)
    );

    const nextRecord = {
      id: existing?.id || nextGradeId(),
      studentId,
      course: assignment.course,
      teacher: assignment.teacher,
      sectionKey: assignment.section,
      trimester,
      period: trimester,
      assessmentType,
      score,
      recordedAt: isoDate(0)
    };

    if (existing) {
      Object.assign(existing, nextRecord);
    } else {
      state.data.grades.push(nextRecord);
    }

    persistData();
    recordLog(state.session, `Registro de nota ${assignment.course} ${trimester} para ${getStudentById(studentId)?.fullName || studentId}`);
    renderAcademicSection();
    renderProfileSection();
    showToast("Nota guardada correctamente.");
    return;
  }

  if (event.target.id === "simulationForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = String(formData.get("studentId") || "");
    const simulationType = normalizeSimulationType(formData.get("simulationType"));
    const date = String(formData.get("date") || isoDate(0));
    const totalScore = Number(formData.get("totalScore") || 0);
    const student = getStudentById(studentId);

    if (!student || totalScore < 0) {
      showToast("Selecciona un alumno valido e ingresa un puntaje correcto.");
      return;
    }

    const existing = state.data.simulations.find((item) =>
      item.studentId === studentId &&
      normalizeSimulationType(item.simulationType) === simulationType
    );

    const record = {
      id: existing?.id || nextSimulationId(),
      simulationType,
      studentId,
      studentName: student.fullName,
      dni: student.dni,
      totalScore,
      date
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      state.data.simulations.push(record);
    }

    state.directionFilters.simulationType = simulationType;
    persistData();
    recordLog(state.session, `Registro de ${simulationType.toLowerCase()} para ${student.fullName}`);
    renderDirectionSection();
    showToast("Simulacro guardado correctamente.");
    return;
  }

  if (event.target.id === "publicSimulationLookupForm") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const dni = String(formData.get("dni") || "").trim();
    const simulationType = String(formData.get("simulationType") || "Todas");

    if (!dni) {
      showToast("Ingresa el DNI del estudiante para realizar la consulta.");
      return;
    }

    state.directionFilters.publicLookupDni = dni;
    state.directionFilters.publicSimulationType = simulationType;
    const lookup = await fetchPublicSimulationResults(dni, simulationType);
    state.directionFilters.publicResults = lookup.results || [];
    state.directionFilters.publicTopThree = lookup.topThree || [];
    state.directionFilters.publicResolvedSimulationType = lookup.simulationTypeApplied || "";
    renderPublicSimulationView();
    return;
  }

  await previousHandleDynamicSubmitDirection(event);
};

const previousHandleDynamicClickDirection = handleDynamicClick;
handleDynamicClick = function handleDynamicClickDirection(event) {
  const dismissCredentialNoticeButton = event.target.closest("[data-dismiss-credential-notice]");
  if (dismissCredentialNoticeButton) {
    state.credentialsNotice = null;
    renderCredentialsSection();
    return;
  }

  const copyValueButton = event.target.closest("[data-copy-value]");
  if (copyValueButton) {
    const value = decodeURIComponent(copyValueButton.dataset.copyValue || "");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(() => {
        showToast("Dato copiado al portapapeles.");
      }).catch(() => {
        showToast("No se pudo copiar automaticamente. Intenta otra vez.");
      });
    } else {
      window.prompt("Copia el valor:", value);
    }
    return;
  }

  const resetCredentialPasswordButton = event.target.closest("[data-reset-credential-password]");
  if (resetCredentialPasswordButton) {
    const userId = resetCredentialPasswordButton.dataset.resetCredentialPassword || "";
    const currentUsername = resetCredentialPasswordButton.dataset.currentUsername || "";
    if (!window.confirm(`Se generara una nueva contrasena temporal para ${currentUsername}. Deseas continuar?`)) {
      return;
    }
    setCredentialPassword({
      userId,
      currentUsername,
      password: "",
      autoGenerate: true
    }).then(async () => {
      await loadCredentialDirectory(true);
      renderCredentialsSection();
      showToast("Contrasena temporal restablecida.");
    }).catch((error) => {
      showToast(error.message || "No se pudo restablecer la contrasena.");
    });
    return;
  }

  const openPublicButton = event.target.closest("[data-open-public-simulations]");
  if (openPublicButton) {
    openPublicSimulationRoute();
    return;
  }

  const closePublicButton = event.target.closest("[data-close-public-simulations]");
  if (closePublicButton) {
    closePublicSimulationRoute();
    return;
  }

  const copyPublicLinkButton = event.target.closest("[data-copy-public-simulations-link]");
  if (copyPublicLinkButton) {
    copyPublicSimulationLink();
    return;
  }

  const deleteSimulationButton = event.target.closest("[data-delete-simulation]");
  if (deleteSimulationButton) {
    const simulationId = deleteSimulationButton.dataset.deleteSimulation;
    const current = state.data.simulations.find((item) => item.id === simulationId);
    if (!current) {
      showToast("El registro de simulacro ya no existe.");
      return;
    }
    if (!window.confirm(`Se eliminara ${current.simulationType} de ${current.studentName}. Deseas continuar?`)) {
      return;
    }
    state.data.simulations = state.data.simulations.filter((item) => item.id !== simulationId);
    persistData();
    recordLog(state.session, `Eliminacion de ${current.simulationType.toLowerCase()} para ${current.studentName}`);
    renderDirectionSection();
    showToast("Registro de simulacro eliminado.");
    return;
  }

  previousHandleDynamicClickDirection(event);
};

renderAcademicSection = function renderAcademicSectionComprehensive() {
  const teacherView = state.session?.role === "Docentes";
  const teacherName = getSessionDisplayName();
  const assignments = getVisibleAcademicAssignments(teacherView ? teacherName : "");

  if (!assignments.length) {
    refs.sections.academic.innerHTML = `
      ${renderSectionHeader("Gestion academica", "No hay cursos asignados para mostrar el panel de evaluacion.")}
      <article class="empty-card"><h3>Sin cursos disponibles</h3><p>Registra cursos y asignaciones para habilitar el modulo academico.</p></article>
    `;
    return;
  }

  syncAcademicFilterState(assignments);
  const assignment = parseAssignmentKey(state.academicFilters.assignmentKey) || assignments[0];
  const assignmentStudents = getStudentsForAssignment(assignment);
  const assessmentTypes = getAssessmentTypesForAssignment(assignment);
  const filteredGrades = getGradesForAssignment(assignment);
  const summaryRows = assignmentStudents.map((student) => ({
    student,
    trimester1: getStudentTrimesterAverage(student.id, assignment, "Trimestre 1"),
    trimester2: getStudentTrimesterAverage(student.id, assignment, "Trimestre 2"),
    trimester3: getStudentTrimesterAverage(student.id, assignment, "Trimestre 3"),
    finalAverage: getStudentFinalAverage(student.id, assignment)
  }));
  const teacherSchedules = teacherView ? getSchedulesForTeacher(teacherName) : getSchedulesForAssignment(assignment);

  refs.sections.academic.innerHTML = `
    ${renderSectionHeader("Gestion academica", teacherView ? "Portal docente para revisar horarios, alumnos por aula y registrar evaluaciones por trimestre." : "Gestion integral de cursos, tablas de evaluacion, notas por trimestre y promedios finales.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-export-report="academico">Exportar Excel</button>
      </div>
    `)}

    <div class="inline-metrics">
      <span class="tag">Curso activo: ${escapeHtml(assignment.course)}</span>
      <span class="tag">Aula: ${escapeHtml(assignment.section)}</span>
      <span class="tag">Docente: ${escapeHtml(assignment.teacher)}</span>
      <span class="tag">${assignmentStudents.length} alumnos</span>
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>Tabla de evaluacion</h3>
        <form id="gradeSchemaForm" class="form-stack">
          <label class="field">
            <span>Curso y aula activos</span>
            <select id="academicAssignmentSelect" name="assignmentKey">
              ${assignments.map((item) => `<option value="${escapeHtml(buildAssignmentKey(item))}" ${buildAssignmentKey(item) === buildAssignmentKey(assignment) ? "selected" : ""}>${escapeHtml(`${item.course} · ${item.section} · ${item.teacher}`)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Tipos de evaluacion</span>
            <textarea name="assessmentTypes" placeholder="Separados por coma">${escapeHtml(assessmentTypes.join(", "))}</textarea>
          </label>
          <p class="score-note">Los tipos se usaran para los tres trimestres y podras elegirlos al registrar notas.</p>
          <button class="button button-secondary" type="submit">Guardar tabla</button>
        </form>
      </article>

      <article class="glass-card">
        <h3>Registrar notas</h3>
        <form id="gradeForm" class="form-stack">
          <input type="hidden" name="assignmentKey" value="${escapeHtml(buildAssignmentKey(assignment))}">
          <label class="field">
            <span>Alumno</span>
            <select name="studentId">
              ${assignmentStudents.map((student) => `<option value="${student.id}">${escapeHtml(student.fullName)} · ${escapeHtml(student.dni)}</option>`).join("")}
            </select>
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Trimestre</span>
              <select id="academicTrimesterSelect" name="trimester">
                ${TRIMESTER_OPTIONS.map((trimester) => `<option value="${trimester}" ${trimester === state.academicFilters.trimester ? "selected" : ""}>${trimester}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Tipo de evaluacion</span>
              <select id="academicAssessmentSelect" name="assessmentType">
                ${assessmentTypes.map((item) => `<option value="${escapeHtml(item)}" ${item === state.academicFilters.assessmentType ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="field">
            <span>Nota</span>
            <input name="score" type="number" min="0" max="20" step="0.1" required>
          </label>
          <p class="score-note">El promedio trimestral y el promedio final se calculan automaticamente.</p>
          <button class="button button-primary" type="submit">Guardar nota</button>
        </form>
      </article>
    </div>

    <div class="split-panel">
      <article class="table-card">
        <h3>${teacherView ? "Horarios del docente" : "Horario del aula activa"}</h3>
        <div class="schedule-card-grid">
          ${teacherSchedules.map((schedule) => renderScheduleMiniCard(schedule)).join("") || '<div class="lookup-empty-card">No hay horarios vinculados todavia.</div>'}
        </div>
      </article>

      <article class="table-card">
        <h3>Alumnos por aula</h3>
        <div class="table-summary">
          <span class="tag">${escapeHtml(assignment.section)}</span>
          <span class="tag">${escapeHtml(assignment.teacher)}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>DNI</th>
                <th>Aula</th>
                <th>Promedio del curso</th>
                ${teacherView ? "" : "<th>Uniforme / buso</th>"}
              </tr>
            </thead>
            <tbody>
              ${assignmentStudents.map((student) => {
                const uniformPayments = getStudentPayments(student.id).filter((payment) => payment.concept.includes("Uniforme") || payment.concept.includes("Buso"));
                return `
                  <tr>
                    <td>${escapeHtml(student.fullName)}</td>
                    <td>${escapeHtml(student.dni)}</td>
                    <td>${escapeHtml(`${student.level} ${student.grade} ${student.section}`)}</td>
                    <td>${formatAverageValue(getStudentFinalAverage(student.id, assignment))}</td>
                    ${teacherView ? "" : `<td>${escapeHtml(uniformPayments.map((payment) => `${payment.concept}: ${payment.status}`).join(" · ") || "Sin registros")}</td>`}
                  </tr>
                `;
              }).join("") || `<tr><td colspan="${teacherView ? 4 : 5}">No hay alumnos asignados a este curso.</td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <article class="table-card">
      <h3>Promedios por trimestre</h3>
      <p class="table-meta">Tabla consolidada de ${escapeHtml(assignment.course)} para ${escapeHtml(assignment.section)}.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Trimestre 1</th>
              <th>Trimestre 2</th>
              <th>Trimestre 3</th>
              <th>Promedio final</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.student.fullName)}</td>
                <td>${formatAverageValue(row.trimester1)}</td>
                <td>${formatAverageValue(row.trimester2)}</td>
                <td>${formatAverageValue(row.trimester3)}</td>
                <td><strong>${formatAverageValue(row.finalAverage)}</strong></td>
              </tr>
            `).join("") || '<tr><td colspan="5">Todavia no hay notas registradas.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>

    <article class="table-card">
      <h3>Detalle de evaluaciones</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Alumno</th>
              <th>Trimestre</th>
              <th>Tipo</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            ${filteredGrades.map((grade) => {
              const student = getStudentById(grade.studentId);
              return `
                <tr>
                  <td>${formatDate(grade.recordedAt || isoDate(0))}</td>
                  <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                  <td>${escapeHtml(grade.trimester || normalizeTrimester(grade.period))}</td>
                  <td>${escapeHtml(grade.assessmentType || "Examen de avance")}</td>
                  <td>${grade.score}</td>
                </tr>
              `;
            }).join("") || '<tr><td colspan="5">Aun no hay evaluaciones registradas para este curso.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

const previousRenderDashboardSectionRoleAware = renderDashboardSection;
renderDashboardSection = function renderDashboardSectionRoleAware() {
  if (state.session?.role !== "Docentes") {
    previousRenderDashboardSectionRoleAware();
    return;
  }

  const teacherName = getSessionDisplayName();
  const assignments = getVisibleAcademicAssignments(teacherName);
  const assignedStudents = getStudentsForTeacher(teacherName);
  const planningItem = state.data.planning.find((item) => normalizeText(item.teacher) === normalizeText(teacherName));
  const teacherSchedules = getSchedulesForTeacher(teacherName);
  const upcomingActivities = [...state.data.activities].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 4);
  const todayAttendance = state.data.attendance.filter((entry) =>
    entry.date === isoDate(0) &&
    assignedStudents.some((student) => student.id === entry.studentId)
  );

  refs.sections.dashboard.innerHTML = `
    ${renderSectionHeader("Panel docente", "Vista de trabajo diaria con tus cursos, aulas, horarios y actividades institucionales.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-open-section="academic">Ir a notas</button>
        <button class="button button-soft" type="button" data-open-section="attendance">Tomar asistencia</button>
        <button class="button button-secondary" type="button" data-open-section="profile">Ver mis alumnos</button>
        <button class="button button-secondary" type="button" data-open-section="schedule">Ver horarios</button>
      </div>
    `)}

    <div class="metric-grid">
      <article class="metric-card">
        <h3>Cursos asignados</h3>
        <p class="metric-number">${assignments.length}</p>
        <p class="supporting-copy">Solo tus cursos habilitados</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Aulas asignadas</h3>
        <p class="metric-number">${new Set(assignments.map((item) => item.section)).size}</p>
        <p class="supporting-copy">Secciones visibles para tu usuario</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Alumnos asignados</h3>
        <p class="metric-number">${assignedStudents.length}</p>
        <p class="supporting-copy">Matriculados de tus aulas</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Horarios visibles</h3>
        <p class="metric-number">${teacherSchedules.length}</p>
        <p class="supporting-copy">Bloques ya asignados por administracion</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Asistencias hoy</h3>
        <p class="metric-number">${todayAttendance.length}</p>
        <p class="supporting-copy">Registros del ${formatDate(isoDate(0))}</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Planificacion</h3>
        <p class="metric-number">${planningItem ? formatPercent(planningItem.compliance) : "0%"}</p>
        <p class="supporting-copy">${planningItem ? planningItem.status : "Sin registro"}</p>
        <div class="accent-line"></div>
      </article>
    </div>

    <div class="stack-grid">
      <article class="glass-card">
        <div class="chip-row">
          <span class="tag">Notas</span>
          <span class="tag">${TRIMESTER_OPTIONS.length} trimestres</span>
        </div>
        <h3>Registro academico del docente</h3>
        <p>Ingresa tareas, examenes de avance, examenes trimestrales, participacion y trabajos solo para tus cursos asignados.</p>
        <button class="button button-primary" type="button" data-open-section="academic">Abrir notas</button>
      </article>

      <article class="glass-card">
        <div class="chip-row">
          <span class="tag">Asistencia</span>
          <span class="tag">${new Set(assignments.map((item) => item.section)).size} secciones</span>
        </div>
        <h3>Control diario por aula</h3>
        <p>Marca presentes, tardanzas, ausencias o retiros solo para los estudiantes vinculados a tus secciones.</p>
        <button class="button button-primary" type="button" data-open-section="attendance">Abrir asistencia</button>
      </article>

      <article class="glass-card">
        <div class="chip-row">
          <span class="tag">Matriculados</span>
          <span class="tag">${assignedStudents.length} alumnos</span>
        </div>
        <h3>Alumnos por seccion</h3>
        <p>Revisa el listado de estudiantes matriculados en las aulas que administracion te asigno.</p>
        <button class="button button-primary" type="button" data-open-section="profile">Abrir mis alumnos</button>
      </article>

      <article class="glass-card">
        <div class="chip-row">
          <span class="tag">Horario</span>
          <span class="tag">${teacherSchedules.length} visibles</span>
        </div>
        <h3>Bloques ya programados</h3>
        <p>Consulta solo los horarios de las aulas que ya quedaron asignadas a tu usuario.</p>
        <button class="button button-primary" type="button" data-open-section="schedule">Abrir horario</button>
      </article>
    </div>

    <div class="grid-two">
      <article class="glass-card">
        <h3>Tus cursos y aulas</h3>
        <div class="timeline-list">
          ${assignments.map((assignment) => `
            <div class="timeline-item">
              <strong>${escapeHtml(assignment.course)}</strong>
              <p>${escapeHtml(assignment.section)}</p>
            </div>
          `).join("") || '<div class="lookup-empty-card">No tienes cursos asignados todavia.</div>'}
        </div>
      </article>

      <article class="glass-card">
        <h3>Actividades institucionales</h3>
        <div class="activity-list">
          ${upcomingActivities.map((activity) => `
            <div class="activity-item">
              <div class="chip-row">
                <span class="tag">${formatDate(activity.date)}</span>
                <span class="tag">${escapeHtml(activity.responsible)}</span>
              </div>
              <h4>${escapeHtml(activity.title)}</h4>
              <p>${escapeHtml(activity.description)}</p>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
};

const previousRenderPlanningSectionRoleAware = renderPlanningSection;
renderPlanningSection = function renderPlanningSectionRoleAware() {
  if (state.session?.role !== "Docentes") {
    previousRenderPlanningSectionRoleAware();
    return;
  }

  const teacherName = getSessionDisplayName();
  const item = state.data.planning.find((planning) => normalizeText(planning.teacher) === normalizeText(teacherName));
  const staff = state.data.staff.find((person) => normalizeText(person.name) === normalizeText(teacherName));

  refs.sections.planning.innerHTML = `
    ${renderSectionHeader("Mi planificacion", "Seguimiento solo de tu estado de planificacion docente.")}
    ${item ? `
      <article class="glass-card">
        <div class="chip-row">
          <span class="tag">${escapeHtml(item.area)}</span>
          ${renderStatusPill(item.status)}
        </div>
        <h3>${escapeHtml(item.teacher)}</h3>
        <p><strong>Correo:</strong> ${escapeHtml(staff?.email || "Sin correo")}</p>
        <p><strong>Horario:</strong> ${escapeHtml(staff?.schedule || "Sin horario")}</p>
        <p><strong>Cumplimiento:</strong> ${formatPercent(item.compliance)}</p>
        <p><strong>Ultima entrega:</strong> ${formatDate(item.deliveredAt)}</p>
      </article>
    ` : `<article class="empty-card"><h3>Sin planificacion registrada</h3><p>Aun no hay una planificacion cargada para tu usuario.</p></article>`}
  `;
};

function renderDirectionSection() {
  if (!refs.sections.direction) {
    return;
  }

  const simulationType = normalizeSimulationType(state.directionFilters.simulationType);
  const position = state.directionFilters.position || "Todos";
  const ranking = getSimulationRanking(simulationType, position);
  const academicSummary = getGlobalAcademicSummaryRows();

  refs.sections.direction.innerHTML = `
    ${renderSectionHeader("Panel de direccion", "Supervisa notas, docentes, horarios y administra los simulacros institucionales.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-export-report="simulacros">Exportar ranking</button>
        <button class="button button-secondary" type="button" data-print-report="simulacros">Imprimir A4</button>
      </div>
    `)}

    <div class="metric-grid">
      <article class="mini-card">
        <h3>Notas registradas</h3>
        <p class="metric-number">${state.data.grades.length}</p>
      </article>
      <article class="mini-card">
        <h3>Docentes activos</h3>
        <p class="metric-number">${state.data.staff.filter((person) => person.role === "Docente").length}</p>
      </article>
      <article class="mini-card">
        <h3>Horarios activos</h3>
        <p class="metric-number">${state.data.schedules.length}</p>
      </article>
      <article class="mini-card">
        <h3>Simulacros registrados</h3>
        <p class="metric-number">${state.data.simulations.length}</p>
      </article>
    </div>

    <div class="director-grid">
      <div class="split-panel">
        <article class="glass-card">
          <h3>Registrar o actualizar simulacro</h3>
          <form id="simulationForm" class="form-stack">
            <div class="form-grid">
              <label class="field">
                <span>Simulacro</span>
                <select name="simulationType">
                  ${SIMULATION_TYPES.map((item) => `<option value="${item}" ${item === simulationType ? "selected" : ""}>${item}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>Fecha</span>
                <input name="date" type="date" value="${isoDate(0)}" required>
              </label>
            </div>
            <label class="field">
              <span>Alumno</span>
              <select name="studentId">
                ${state.data.students.map((student) => `<option value="${student.id}">${escapeHtml(student.fullName)} · ${escapeHtml(student.dni)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Puntaje total</span>
              <input name="totalScore" type="number" min="0" step="1" required>
            </label>
            <p class="score-note">Si el alumno ya tiene un registro en ese simulacro, este formulario lo actualiza.</p>
            <button class="button button-primary" type="submit">Guardar simulacro</button>
          </form>
        </article>

        <article class="table-card">
          <h3>Acceso para estudiantes</h3>
          <div class="notice-card">
            <p>Comparte este enlace para que el alumno consulte por DNI su resultado del simulacro.</p>
            <p id="directionPublicLinkText" class="supporting-copy">${escapeHtml(getPublicSimulationUrl())}</p>
            <div class="button-row">
              <button class="button button-primary" type="button" data-copy-public-simulations-link="true">Copiar enlace</button>
              <button class="button button-secondary" type="button" data-open-public-simulations="true">Abrir consulta publica</button>
            </div>
          </div>
          <div class="divider"></div>
          <h3>Filtros del ranking</h3>
          <div class="compact-form-grid">
            <label class="field">
              <span>Simulacro</span>
              <select id="directionSimulationType">
                ${SIMULATION_TYPES.map((item) => `<option value="${item}" ${item === simulationType ? "selected" : ""}>${item}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Puesto</span>
              <select id="directionPositionFilter">
                ${["Todos", "1", "2", "3"].map((item) => `<option value="${item}" ${item === position ? "selected" : ""}>${item === "Todos" ? "Todos" : `Puesto ${item}`}</option>`).join("")}
              </select>
            </label>
          </div>
        </article>
      </div>

      <div class="split-panel">
        <article class="table-card">
          <h3>Resumen global de notas</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Curso</th>
                  <th>Aula</th>
                  <th>Trimestre 1</th>
                  <th>Trimestre 2</th>
                  <th>Trimestre 3</th>
                  <th>Final</th>
                </tr>
              </thead>
              <tbody>
                ${academicSummary.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.studentName)}</td>
                    <td>${escapeHtml(row.course)}</td>
                    <td>${escapeHtml(row.section)}</td>
                    <td>${formatAverageValue(row.trimester1)}</td>
                    <td>${formatAverageValue(row.trimester2)}</td>
                    <td>${formatAverageValue(row.trimester3)}</td>
                    <td><strong>${formatAverageValue(row.finalAverage)}</strong></td>
                  </tr>
                `).join("") || '<tr><td colspan="7">No hay registros academicos todavia.</td></tr>'}
              </tbody>
            </table>
          </div>
        </article>

        <article class="table-card">
          <h3>Docentes y horarios</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Area</th>
                  <th>Cursos</th>
                  <th>Horario</th>
                </tr>
              </thead>
              <tbody>
                ${state.data.staff.filter((person) => person.role === "Docente").map((person) => `
                  <tr>
                    <td>${escapeHtml(person.name)}</td>
                    <td>${escapeHtml(person.area)}</td>
                    <td>${escapeHtml(person.courses)}</td>
                    <td>${escapeHtml(person.schedule)}</td>
                  </tr>
                `).join("") || '<tr><td colspan="4">No hay docentes registrados.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="divider"></div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nivel</th>
                  <th>Seccion</th>
                  <th>Aula</th>
                </tr>
              </thead>
              <tbody>
                ${state.data.schedules.map((schedule) => `
                  <tr>
                    <td>${escapeHtml(schedule.level)}</td>
                    <td>${escapeHtml(schedule.sectionKey)}</td>
                    <td>${escapeHtml(schedule.room)}</td>
                  </tr>
                `).join("") || '<tr><td colspan="3">No hay horarios disponibles.</td></tr>'}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article class="table-card">
        <h3>Ranking del simulacro</h3>
        <p class="table-meta">${escapeHtml(simulationType)}${position !== "Todos" ? ` · filtrado por puesto ${position}` : ""}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Puesto</th>
                <th>Alumno</th>
                <th>DNI</th>
                <th>Fecha</th>
                <th>Puntaje</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              ${ranking.map((item) => `
                <tr>
                  <td><span class="rank-badge">${item.position}</span></td>
                  <td>${escapeHtml(item.studentName)}</td>
                  <td>${escapeHtml(item.dni)}</td>
                  <td>${formatDate(item.date)}</td>
                  <td>${item.totalScore}</td>
                  <td><button class="link-button" type="button" data-delete-simulation="${item.id}">Eliminar</button></td>
                </tr>
              `).join("") || '<tr><td colspan="6">No hay registros para el filtro seleccionado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
};

function renderPublicSimulationView() {
  if (!refs.publicSimulationView || !refs.publicSimulationResults) {
    return;
  }

  const results = Array.isArray(state.directionFilters.publicResults) ? state.directionFilters.publicResults : [];
  const topThree = Array.isArray(state.directionFilters.publicTopThree) ? state.directionFilters.publicTopThree : [];
  const resolvedSimulationType = state.directionFilters.publicResolvedSimulationType || "";
  const dniValue = state.directionFilters.publicLookupDni || "";
  const simulationType = state.directionFilters.publicSimulationType || "Todas";
  if (refs.publicSimulationUrlText) {
    refs.publicSimulationUrlText.textContent = getPublicSimulationUrl();
  }

  const studentResultsMarkup = results.length ? `
    <div class="lookup-result-grid">
      ${results.map((item) => `
        <article class="simulation-result-card">
          <div class="chip-row">
            <span class="tag">${escapeHtml(item.simulationType)}</span>
            <span class="rank-badge">${item.position}</span>
          </div>
          <h3>${escapeHtml(item.studentName)}</h3>
          <p>${escapeHtml(item.dni)} · ${formatDate(item.date)}</p>
          <p class="simulation-score">${item.totalScore}</p>
          <p class="supporting-copy">Tu puntaje y tu puesto en ${escapeHtml(state.data.school.name)}.</p>
        </article>
      `).join("")}
    </div>
  ` : `
    <div class="lookup-empty-card">
      ${dniValue ? `No se encontraron resultados para el DNI ${escapeHtml(dniValue)}${simulationType !== "Todas" ? ` en ${escapeHtml(simulationType)}` : ""}.` : "Ingresa el DNI del estudiante para consultar su simulacro."}
    </div>
  `;

  const topThreeMarkup = topThree.length ? `
    <div class="divider"></div>
    <div class="section-heading">
      <p class="eyebrow">Ranking destacado</p>
      <h2>3 primeros puestos${resolvedSimulationType ? ` · ${escapeHtml(resolvedSimulationType)}` : ""}</h2>
    </div>
    <div class="lookup-result-grid">
      ${topThree.map((item) => `
        <article class="simulation-result-card">
          <div class="chip-row">
            <span class="rank-badge">${item.position}</span>
            <span class="tag">${escapeHtml(item.simulationType)}</span>
          </div>
          <h3>${escapeHtml(item.studentName)}</h3>
          <p>DNI ${escapeHtml(item.dni)}</p>
          <p class="simulation-score">${item.totalScore}</p>
          <p class="supporting-copy">Puntaje del ${item.position}° puesto.</p>
        </article>
      `).join("")}
    </div>
  ` : "";

  refs.publicSimulationResults.innerHTML = `${studentResultsMarkup}${topThreeMarkup}`;

  const input = document.getElementById("publicSimulationDni");
  if (input) {
    input.value = dniValue;
  }
  const select = document.getElementById("publicSimulationType");
  if (select) {
    select.value = simulationType;
  }
}

const previousRenderProfileSectionRoleAware = renderProfileSection;
renderProfileSection = function renderProfileSectionRoleAware() {
  if (state.session?.role !== "Docentes") {
    previousRenderProfileSectionRoleAware();
    return;
  }

  const teacherName = getSessionDisplayName();
  const visibleStudents = getStudentsForTeacher(teacherName);
  const sectionOptions = getTeacherSectionOptions(teacherName);
  const hasStoredSection = sectionOptions.some((sectionItem) => normalizeText(sectionItem.value) === normalizeText(state.teacherProfileSection));
  state.teacherProfileSection = hasStoredSection ? state.teacherProfileSection : sectionOptions[0]?.value || "";
  const rosterStudents = getStudentsForTeacherSection(teacherName, state.teacherProfileSection);
  const selectedStudent = rosterStudents.find((student) => student.id === state.selectedStudentId) || rosterStudents[0];

  if (!visibleStudents.length) {
    refs.sections.profile.innerHTML = `<article class="empty-card"><h3>Sin alumnos asignados</h3><p>No hay alumnos vinculados a tus aulas en este momento.</p></article>`;
    return;
  }

  if (!selectedStudent) {
    refs.sections.profile.innerHTML = `
      ${renderSectionHeader("Mis alumnos por seccion", "La seccion activa aun no tiene estudiantes matriculados.")}
      <article class="glass-card">
        <label class="field">
          <span>Aula asignada</span>
          <select id="teacherProfileSectionFilter">
            ${sectionOptions.map((sectionItem) => `<option value="${escapeHtml(sectionItem.value)}" ${sectionItem.value === state.teacherProfileSection ? "selected" : ""}>${escapeHtml(sectionItem.label)}</option>`).join("")}
          </select>
        </label>
      </article>
      <article class="empty-card"><h3>Sin matriculados en esta aula</h3><p>Cambia de seccion para revisar otro grupo o espera a que administracion termine la matricula.</p></article>
    `;
    return;
  }

  state.selectedStudentId = selectedStudent.id;
  const grades = state.data.grades.filter((grade) =>
    grade.studentId === selectedStudent.id &&
    normalizeText(grade.teacher) === normalizeText(teacherName)
  );
  const selectedSection = sectionOptions.find((sectionItem) => normalizeText(sectionItem.value) === normalizeText(state.teacherProfileSection));
  const sectionAssignments = getVisibleAcademicAssignments(teacherName)
    .filter((assignment) => normalizeText(assignment.section) === normalizeText(state.teacherProfileSection));
  const studentAttendance = state.data.attendance.filter((entry) => entry.studentId === selectedStudent.id);
  const attendanceSummary = studentAttendance.length
    ? `${studentAttendance.filter((entry) => entry.status === "Presente").length} presentes de ${studentAttendance.length} registros`
    : "Sin asistencias registradas";

  refs.sections.profile.innerHTML = `
    ${renderSectionHeader("Mis alumnos por seccion", "Consulta solo los estudiantes matriculados en las aulas que administracion te asigno y revisa su historial del area.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-open-section="academic">Registrar notas</button>
        <button class="button button-secondary" type="button" data-open-section="attendance">Registrar asistencia</button>
      </div>
    `)}

    <div class="inline-metrics">
      <span class="tag">${sectionOptions.length} secciones asignadas</span>
      <span class="tag">${visibleStudents.length} alumnos visibles</span>
      <span class="tag">${sectionAssignments.length} cursos en el aula activa</span>
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>Seccion activa</h3>
        <label class="field">
          <span>Aula asignada</span>
          <select id="teacherProfileSectionFilter">
            ${sectionOptions.map((sectionItem) => `<option value="${escapeHtml(sectionItem.value)}" ${sectionItem.value === state.teacherProfileSection ? "selected" : ""}>${escapeHtml(sectionItem.label)}</option>`).join("")}
          </select>
        </label>
        <div class="timeline-list">
          ${rosterStudents.map((student) => `
            <div class="timeline-item">
              <strong>${escapeHtml(student.fullName)}</strong>
              <p>${escapeHtml(student.dni)} · ${escapeHtml(`${student.grade} ${student.section}`)}</p>
              <button class="link-button" type="button" data-select-student="${student.id}">Ver ficha</button>
            </div>
          `).join("") || '<div class="lookup-empty-card">No hay alumnos matriculados en esta seccion.</div>'}
        </div>
      </article>

      <article class="profile-card">
        <div class="profile-avatar">${initials(selectedStudent.fullName)}</div>
        <h3>${escapeHtml(selectedStudent.fullName)}</h3>
        <p class="supporting-copy">DNI ${escapeHtml(selectedStudent.dni)} · ${escapeHtml(`${selectedStudent.level} ${selectedStudent.grade} ${selectedStudent.section}`)}</p>
        <div class="chip-row">
          <span class="tag">${escapeHtml(selectedSection?.label || `${selectedStudent.level} ${selectedStudent.grade} ${selectedStudent.section}`)}</span>
          <span class="tag">${escapeHtml(sectionAssignments.map((assignment) => assignment.course).join(", ") || "Sin curso asignado")}</span>
        </div>
        <p><strong>Apoderado:</strong> ${escapeHtml(selectedStudent.guardianName)}</p>
        <p><strong>Telefono:</strong> ${escapeHtml(selectedStudent.guardianPhone)}</p>
        <p><strong>Asistencia:</strong> ${escapeHtml(attendanceSummary)}</p>
      </article>
    </div>

    <article class="table-card">
      <h3>Matriculados de ${escapeHtml(selectedSection?.label || "tu aula")}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>DNI</th>
              <th>Apoderado</th>
              <th>Promedio del area</th>
            </tr>
          </thead>
          <tbody>
            ${rosterStudents.map((student) => `
              <tr>
                <td>${escapeHtml(student.fullName)}</td>
                <td>${escapeHtml(student.dni)}</td>
                <td>${escapeHtml(student.guardianName)}</td>
                <td>${formatAverageValue(getCombinedAssignmentAverage(student.id, sectionAssignments))}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">No hay alumnos matriculados en esta seccion.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>

    <article class="profile-card">
      <h3>Historial del area</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Curso</th>
              <th>Trimestre</th>
              <th>Tipo</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            ${grades.map((grade) => `
              <tr>
                <td>${escapeHtml(grade.course)}</td>
                <td>${escapeHtml(grade.trimester || normalizeTrimester(grade.period))}</td>
                <td>${escapeHtml(grade.assessmentType || "Examen de avance")}</td>
                <td>${grade.score}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">No hay notas registradas para este alumno en tu area.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

renderScheduleSection = function renderScheduleSectionRoleAware() {
  const teacherView = state.session?.role === "Docentes";

  if (teacherView) {
    const teacherName = getSessionDisplayName();
    const teacherSchedules = getSchedulesForTeacher(teacherName);
    const selected = teacherSchedules.find((item) => item.id === state.selectedScheduleId) || teacherSchedules[0];
    state.selectedScheduleId = selected?.id || null;

    refs.sections.schedule.innerHTML = `
      ${renderSectionHeader("Mis horarios", "Consulta solo los horarios que ya fueron asignados a tu usuario desde administracion.")}
      ${selected ? `
        <div class="split-panel">
          <article class="glass-card">
            <h3>Busqueda de horario</h3>
            <label class="field">
              <span>Horario asignado</span>
              <select id="scheduleSelect">
                ${teacherSchedules.map((item) => `<option value="${item.id}" ${item.id === selected.id ? "selected" : ""}>${escapeHtml(`${item.level} · ${item.sectionKey}`)}</option>`).join("")}
              </select>
            </label>
            <div class="badge-grid">
              <span class="tag">${escapeHtml(selected.level)}</span>
              <span class="tag">${escapeHtml(selected.room)}</span>
              <span class="tag">${escapeHtml(selected.sectionKey)}</span>
            </div>
          </article>

          <article class="table-card">
            <h3>${escapeHtml(selected.sectionKey)}</h3>
            <p class="supporting-copy">${escapeHtml(selected.level)} · ${escapeHtml(selected.room)}</p>
            <div class="table-wrap">
              <table class="schedule-grid-table">
                <thead>
                  <tr>${selected.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${selected.rows.map((row) => `<tr>${row.map((cell) => renderReadonlyScheduleCell(cell)).join("")}</tr>`).join("")}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ` : `<article class="empty-card"><h3>Sin horarios asignados</h3><p>Administracion aun no ha vinculado horarios a tu usuario.</p></article>`}
    `;
    return;
  }

  ensureSelectedSchedule();
  const schedule = getSelectedSchedule();
  if (!schedule) {
    refs.sections.schedule.innerHTML = `<article class="empty-card"><h3>Sin horarios</h3><p>Registra el primer horario para empezar a editarlo.</p></article>`;
    return;
  }
  const scheduleStudents = state.data.students.filter((student) => normalizeText(schedule.sectionKey).includes(normalizeText(student.grade)) && normalizeText(schedule.sectionKey).includes(normalizeText(student.section)));

  refs.sections.schedule.innerHTML = `
    ${renderSectionHeader("Horarios escolares", "Horarios editables por nivel con recreo automatico y visualizacion por colores para identificar cada bloque.")}

    <div class="split-panel">
      <article class="glass-card">
        <h3>Crear horario</h3>
        <form id="scheduleCreateForm" class="form-grid">
          <label class="field">
            <span>Nivel</span>
            <select name="level">
              <option value="Primaria">Primaria</option>
              <option value="Secundaria">Secundaria</option>
            </select>
          </label>
          <label class="field">
            <span>Seccion</span>
            <input name="sectionKey" type="text" placeholder="Primaria 5° A" required>
          </label>
          <label class="field field-full">
            <span>Aula</span>
            <input name="room" type="text" placeholder="Aula 205" required>
          </label>
          <div class="field field-full">
            <button class="button button-primary" type="submit">Crear horario</button>
          </div>
        </form>

        <div class="divider"></div>
        <label class="field">
          <span>Horario activo</span>
          <select id="scheduleSelect">
            ${state.data.schedules.map((item) => `<option value="${item.id}" ${item.id === schedule.id ? "selected" : ""}>${escapeHtml(`${item.level} · ${item.sectionKey}`)}</option>`).join("")}
          </select>
        </label>
      </article>

      <article class="table-card">
        <h3>${escapeHtml(schedule.sectionKey)}</h3>
        <p class="supporting-copy">${escapeHtml(schedule.level)} · ${escapeHtml(schedule.room)}</p>
        <form id="scheduleEditorForm" class="form-stack">
          <div class="form-grid">
            <label class="field">
              <span>Seccion</span>
              <input name="sectionKey" type="text" value="${escapeHtml(schedule.sectionKey)}">
            </label>
            <label class="field">
              <span>Aula</span>
              <input name="room" type="text" value="${escapeHtml(schedule.room)}">
            </label>
          </div>
          <input type="hidden" name="rowCount" value="${schedule.rows.length}">
          <div class="table-wrap input-table">
            <table class="schedule-grid-table input-table">
              <thead>
                <tr>${schedule.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${schedule.rows.map((row, rowIndex) => `
                  <tr>${row.map((cell, cellIndex) => renderEditableScheduleCell(cell, rowIndex, cellIndex)).join("")}</tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="button-row">
            <button class="button button-secondary" type="button" data-add-schedule-row="true">Agregar bloque</button>
            <button class="button button-primary" type="submit">Guardar horario</button>
          </div>
        </form>
      </article>
    </div>

    <article class="table-card">
      <h3>Alumnos por aula</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Nivel</th>
              <th>Grado</th>
              <th>Seccion</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleStudents.map((student) => `
              <tr>
                <td>${escapeHtml(student.fullName)}</td>
                <td>${escapeHtml(student.level)}</td>
                <td>${escapeHtml(student.grade)}</td>
                <td>${escapeHtml(student.section)}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">No hay alumnos asignados a esta aula todavia.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;
};

function getAttendanceEntriesByDate(date) {
  return state.data.attendance.filter((entry) => entry.date === date);
}

function getFilteredAttendanceRows() {
  const filteredRows = getAttendanceEntriesByDate(state.attendanceFilters.date).filter((entry) => {
    return state.attendanceFilters.status === "Todos" || entry.status === state.attendanceFilters.status;
  });

  if (state.session?.role !== "Docentes") {
    return filteredRows;
  }

  const teacherStudents = new Set(
    getStudentsForTeacherSection(getSessionDisplayName(), state.attendanceFilters.section).map((student) => student.id)
  );
  return filteredRows.filter((entry) => teacherStudents.has(entry.studentId));
}

function nextAttendanceId() {
  const max = state.data.attendance.reduce((currentMax, entry) => {
    const match = String(entry.id || "").match(/ATT-(\d+)/);
    return Math.max(currentMax, match ? Number(match[1]) : 0);
  }, 0);
  return `ATT-${String(max + 1).padStart(4, "0")}`;
}

function renderAttendanceSection() {
  if (!refs.sections.attendance) {
    return;
  }

  const teacherView = state.session?.role === "Docentes";
  const teacherName = getSessionDisplayName();
  const teacherSections = teacherView ? getTeacherSectionOptions(teacherName) : [];
  if (teacherView) {
    const currentSectionExists = teacherSections.some((sectionItem) => normalizeText(sectionItem.value) === normalizeText(state.attendanceFilters.section));
    state.attendanceFilters.section = currentSectionExists
      ? state.attendanceFilters.section
      : teacherSections[0]?.value || "";
  }

  const allowed = ["Administrador", "Direccion", "Secretaria", "Docentes"];
  if (!allowed.includes(state.session?.role)) {
    refs.sections.attendance.innerHTML = `<article class="empty-card"><h3>Modulo no disponible</h3><p>El registro de asistencias esta habilitado solo para roles administrativos.</p></article>`;
    return;
  }

  if (teacherView && !teacherSections.length) {
    refs.sections.attendance.innerHTML = `<article class="empty-card"><h3>Sin secciones asignadas</h3><p>Administracion aun no te vincula a un aula para controlar la asistencia.</p></article>`;
    return;
  }

  const rows = getFilteredAttendanceRows();
  const attendanceStudents = teacherView
    ? getStudentsForTeacherSection(teacherName, state.attendanceFilters.section)
    : state.data.students;
  const stats = {
    presente: rows.filter((entry) => entry.status === "Presente").length,
    tarde: rows.filter((entry) => entry.status === "Llego tarde").length,
    ausente: rows.filter((entry) => entry.status === "Ausente").length,
    retirado: rows.filter((entry) => entry.status === "Retirado").length
  };

  refs.sections.attendance.innerHTML = `
    ${renderSectionHeader(teacherView ? "Asistencia por seccion" : "Registro de asistencias", teacherView ? "Registra y revisa solo la asistencia de las aulas que administracion te asigno." : "Control diario de estudiantes con los estados presente, llego tarde, ausente y retirado.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-export-report="asistencias">Exportar Excel</button>
        ${teacherView ? `<button class="button button-secondary" type="button" data-open-section="profile">Ver mis alumnos</button>` : `<button class="button button-secondary" type="button" data-print-report="asistencias">Imprimir A4</button>`}
      </div>
    `)}

    <div class="metric-grid">
      <article class="mini-card">
        <h3>Presentes</h3>
        <p class="metric-number">${stats.presente}</p>
      </article>
      <article class="mini-card">
        <h3>Llegaron tarde</h3>
        <p class="metric-number">${stats.tarde}</p>
      </article>
      <article class="mini-card">
        <h3>Ausentes</h3>
        <p class="metric-number">${stats.ausente}</p>
      </article>
      <article class="mini-card">
        <h3>Retirados</h3>
        <p class="metric-number">${stats.retirado}</p>
      </article>
      ${teacherView ? `
        <article class="mini-card">
          <h3>Aula activa</h3>
          <p class="metric-number">${attendanceStudents.length}</p>
          <p>${escapeHtml(teacherSections.find((sectionItem) => sectionItem.value === state.attendanceFilters.section)?.label || state.attendanceFilters.section)}</p>
        </article>
      ` : ""}
    </div>

    <div class="split-panel">
      <article class="glass-card">
        <h3>Registrar asistencia</h3>
        <form id="attendanceForm" class="form-stack">
          <div class="form-grid">
            ${teacherView ? `
              <label class="field">
                <span>Seccion activa</span>
                <input type="text" value="${escapeHtml(teacherSections.find((sectionItem) => sectionItem.value === state.attendanceFilters.section)?.label || state.attendanceFilters.section)}" readonly>
              </label>
            ` : ""}
            <label class="field">
              <span>Fecha</span>
              <input name="date" type="date" value="${escapeHtml(state.attendanceFilters.date)}" required>
            </label>
            <label class="field">
              <span>Estado</span>
              <select name="status">
                ${["Presente", "Llego tarde", "Ausente", "Retirado"].map((item) => `<option value="${item}">${item}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="field">
            <span>Alumno</span>
            <select name="studentId">
              ${attendanceStudents.map((student) => `<option value="${student.id}">${escapeHtml(student.fullName)} · ${escapeHtml(`${student.grade} ${student.section}`)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Observaciones</span>
            <textarea name="notes" placeholder="Detalle opcional del registro"></textarea>
          </label>
          <button class="button button-primary" type="submit">Guardar asistencia</button>
        </form>
      </article>

      <article class="table-card">
        <h3>${teacherView ? "Control diario del aula" : "Filtro diario"}</h3>
        <div class="compact-form-grid">
          ${teacherView ? `
            <label class="field">
              <span>Seccion</span>
              <select id="attendanceSectionFilter">
                ${teacherSections.map((sectionItem) => `<option value="${escapeHtml(sectionItem.value)}" ${sectionItem.value === state.attendanceFilters.section ? "selected" : ""}>${escapeHtml(sectionItem.label)}</option>`).join("")}
              </select>
            </label>
          ` : ""}
          <label class="field">
            <span>Fecha</span>
            <input id="attendanceDateFilter" type="date" value="${escapeHtml(state.attendanceFilters.date)}">
          </label>
          <label class="field">
            <span>Estado</span>
            <select id="attendanceStatusFilter">
              ${["Todos", "Presente", "Llego tarde", "Ausente", "Retirado"].map((item) => `<option value="${item}" ${item === state.attendanceFilters.status ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>DNI</th>
                <th>Aula</th>
                <th>Estado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${(teacherView
                ? attendanceStudents.map((student) => {
                  const entry = rows.find((attendanceItem) => attendanceItem.studentId === student.id);
                  return `
                    <tr>
                      <td>${escapeHtml(student.fullName)}</td>
                      <td>${escapeHtml(student.dni)}</td>
                      <td>${escapeHtml(`${student.level} ${student.grade} ${student.section}`)}</td>
                      <td>${entry ? renderStatusPill(entry.status) : '<span class="tag">Sin marcar</span>'}</td>
                      <td>${escapeHtml(entry?.notes || "-")}</td>
                    </tr>
                  `;
                }).join("")
                : rows.map((entry) => {
                  const student = getStudentById(entry.studentId);
                  return `
                    <tr>
                      <td>${escapeHtml(student?.fullName || "Alumno")}</td>
                      <td>${escapeHtml(student?.dni || "-")}</td>
                      <td>${escapeHtml(student ? `${student.level} ${student.grade} ${student.section}` : "-")}</td>
                      <td>${renderStatusPill(entry.status)}</td>
                      <td>${escapeHtml(entry.notes || "-")}</td>
                    </tr>
                  `;
                }).join("")) || '<tr><td colspan="5">No hay asistencias para el filtro actual.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}
