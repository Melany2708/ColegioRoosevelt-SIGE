const STORAGE_KEYS = {
  data: "sge_demo_data_v1",
  logs: "sge_demo_logs_v1",
  session: "sge_demo_session_v1"
};

const MODULES = [
  { id: "dashboard", label: "Dashboard", hint: "Indicadores" },
  { id: "admissions", label: "Matriculas", hint: "Admision y vacantes" },
  { id: "profile", label: "Alumno", hint: "Perfil integral" },
  { id: "academic", label: "Academico", hint: "Notas y cursos" },
  { id: "planning", label: "Planificacion", hint: "Seguimiento docente" },
  { id: "staff", label: "Personal", hint: "Docentes y administrativos" },
  { id: "schedule", label: "Horarios", hint: "Aulas y secciones" },
  { id: "finance", label: "Pagos", hint: "Caja y pensiones" },
  { id: "accounting", label: "Contabilidad", hint: "Ingresos y recaudacion" },
  { id: "supplies", label: "Utiles", hint: "Control de entrega" },
  { id: "activities", label: "Actividades", hint: "Eventos institucionales" },
  { id: "reports", label: "Reportes", hint: "Excel y PDF" },
  { id: "documents", label: "Constancias", hint: "Impresion institucional" },
  { id: "security", label: "Seguridad", hint: "Auditoria y accesos" }
];

const USERS = {
  admin: { username: "admin", password: "gestion-servidor", name: "Karen Salas", role: "Administrador" },
  direccion: { username: "direccion", password: "gestion-servidor", name: "Luis Paredes", role: "Direccion" },
  docente: { username: "docente", password: "gestion-servidor", name: "Carlos Vega", role: "Docentes" },
  tesoreria: { username: "tesoreria", password: "gestion-servidor", name: "Rosa Medina", role: "Caja / tesoreria" },
  secretaria: { username: "secretaria", password: "gestion-servidor", name: "Andrea Rojas", role: "Secretaria" }
};

const ROLE_ACCESS = {
  Administrador: MODULES.map((moduleItem) => moduleItem.id),
  Direccion: ["dashboard", "profile", "academic", "planning", "staff", "schedule", "reports", "documents", "activities", "security"],
  "Caja / tesoreria": ["dashboard", "finance", "accounting", "reports", "documents", "security", "profile"],
  Docentes: ["dashboard", "academic", "planning", "schedule", "activities", "documents", "profile"],
  Secretaria: ["dashboard", "admissions", "profile", "documents", "reports", "security"]
};

const LEVELS_GRADES = {
  Inicial: ["3 anos", "4 anos", "5 anos"],
  Primaria: ["1°", "2°", "3°", "4°", "5°", "6°"],
  Secundaria: ["1°", "2°", "3°", "4°", "5°"]
};

const SECTIONS = ["A", "B", "C"];

const REPORT_DEFINITIONS = [
  { id: "matriculas", label: "Reporte de matriculas", description: "Altas por anio, nivel, grado y apoderado." },
  { id: "academico", label: "Reporte academico", description: "Calificaciones por alumno, curso y periodo." },
  { id: "pagos", label: "Reporte de pagos", description: "Pagos parciales o completos con comprobante." },
  { id: "morosidad", label: "Reporte de morosidad", description: "Cuotas pendientes y montos vencidos." },
  { id: "docentes", label: "Reporte de docentes", description: "Personal, especialidades, cursos y horarios." },
  { id: "horarios", label: "Reporte de horarios", description: "Vista por grado, seccion y aula." },
  { id: "financiero", label: "Reporte financiero", description: "Ingresos por concepto y recaudacion mensual." }
];

const state = {
  data: null,
  logs: null,
  session: null,
  selectedStudentId: null,
  activeSection: "dashboard",
  search: ""
};

const refs = {};
let hostedLoginInFlight = false;

document.addEventListener("DOMContentLoaded", init);

function isHostedRuntime() {
  return window.location.protocol !== "file:";
}

function init() {
  cacheDom();
  bindStaticEvents();
  configureHostedAuthForm();
  state.data = loadFromStorage(STORAGE_KEYS.data, createDefaultData());
  state.logs = loadFromStorage(STORAGE_KEYS.logs, createDefaultLogs());
  state.session = loadFromStorage(STORAGE_KEYS.session, null);
  state.search = "";

  if (state.session && !USERS[state.session.username]) {
    state.session = null;
    saveToStorage(STORAGE_KEYS.session, null);
  }

  state.selectedStudentId = state.data.students[0] ? state.data.students[0].id : null;
  renderApp();
  consumeAuthFlashFromUrl();
}

function cacheDom() {
  refs.loginView = document.getElementById("loginView");
  refs.loginForm = document.getElementById("loginForm");
  refs.appShell = document.getElementById("appShell");
  refs.toast = document.getElementById("toast");
  refs.schoolName = document.getElementById("schoolName");
  refs.sidebarRole = document.getElementById("sidebarRole");
  refs.sidebarUser = document.getElementById("sidebarUser");
  refs.navMenu = document.getElementById("navMenu");
  refs.topbarDate = document.getElementById("topbarDate");
  refs.globalSearch = document.getElementById("globalSearch");
  refs.sections = {
    dashboard: document.getElementById("dashboardSection"),
    admissions: document.getElementById("admissionsSection"),
    profile: document.getElementById("profileSection"),
    academic: document.getElementById("academicSection"),
    planning: document.getElementById("planningSection"),
    staff: document.getElementById("staffSection"),
    schedule: document.getElementById("scheduleSection"),
    finance: document.getElementById("financeSection"),
    accounting: document.getElementById("accountingSection"),
    supplies: document.getElementById("suppliesSection"),
    activities: document.getElementById("activitiesSection"),
    reports: document.getElementById("reportsSection"),
    documents: document.getElementById("documentsSection"),
    security: document.getElementById("securitySection")
  };
}

function bindStaticEvents() {
  refs.loginForm.addEventListener("submit", isHostedRuntime() ? handleHostedLoginSubmit : handleLogin);
  document.getElementById("recoverPasswordBtn").addEventListener("click", () => {
    showToast("Solicita el restablecimiento de contrasena al administrador del sistema.");
  });
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("printPageBtn").addEventListener("click", () => window.print());
  refs.globalSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    if (state.session) {
      renderAdmissionsSection();
      renderProfileSection();
    }
  });
  document.addEventListener("click", handleDynamicClick);
  document.addEventListener("submit", handleDynamicSubmit);
  document.addEventListener("change", handleDynamicChange);
}

function configureHostedAuthForm() {
  if (!refs.loginForm || !isHostedRuntime()) {
    return;
  }

  refs.loginForm.setAttribute("method", "post");
  refs.loginForm.setAttribute("action", "/api/login-web");
}

function consumeAuthFlashFromUrl() {
  if (!isHostedRuntime()) {
    return;
  }

  const url = new URL(window.location.href);
  const loginError = url.searchParams.get("login_error");
  const loggedOut = url.searchParams.get("logout");
  const authOk = url.searchParams.get("auth_ok");

  if (!loginError && !loggedOut && !authOk) {
    return;
  }

  if (loginError) {
    showToast(loginError, "error");
  } else if (loggedOut === "1") {
    showToast("La sesion fue cerrada correctamente.");
  } else if (authOk === "1" && state.session) {
    showToast(`Bienvenido(a), ${state.session.name}.`, "success");
  }

  url.searchParams.delete("login_error");
  url.searchParams.delete("logout");
  url.searchParams.delete("auth_ok");
  url.searchParams.delete("t");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl || "/");
}

async function handleHostedLoginSubmit(event) {
  event.preventDefault();

  if (hostedLoginInFlight) {
    return;
  }

  hostedLoginInFlight = true;
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Validando...";
  }

  try {
    const formData = new FormData(form);
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        username: normalizeText(formData.get("username")),
        password: String(formData.get("password") || "")
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Credenciales invalidas.");
    }

    if (typeof window.__sgeHydrateFromBackend === "function") {
      await window.__sgeHydrateFromBackend(true);
    } else {
      window.location.reload();
      return;
    }

    if (!state.session) {
      throw new Error("El inicio fue aceptado, pero este navegador no consolido la sesion. Revisa cookies y vuelve a intentar.");
    }
  } catch (error) {
    showToast(error.message || "No se pudo iniciar sesion.", "error");
  } finally {
    hostedLoginInFlight = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel || "Ingresar al sistema";
    }
  }
}

function createDefaultData() {
  const year = new Date().getFullYear();
  const today = isoDate(0);
  const lastWeek = isoDate(-7);
  const nextWeek = isoDate(7);
  const nextFortnight = isoDate(15);
  const nextMonth = isoDate(30);

  return {
    school: {
      name: "Colegio Privado Horizonte",
      academicYear: year,
      city: "Lima",
      logo: "SGE"
    },
    capacities: {
      "Inicial|5 anos|A": 20,
      "Primaria|5°|A": 30,
      "Primaria|5°|B": 30,
      "Secundaria|2°|B": 28,
      "Secundaria|3°|A": 28,
      "Primaria|2°|C": 26
    },
    students: [
      {
        id: "ALU-001",
        code: `${year}-0001`,
        names: "Lucia Fernanda",
        lastNames: "Martinez Rojas",
        fullName: "Lucia Fernanda Martinez Rojas",
        dni: "74561238",
        birthDate: "2014-05-18",
        sex: "F",
        address: "Av. Los Laureles 120 - Surco",
        phone: "987654321",
        email: "lucia.martinez@familia.pe",
        level: "Primaria",
        grade: "5°",
        section: "A",
        guardianName: "Mariela Rojas",
        guardianPhone: "989100200",
        guardianRelation: "Madre",
        admissionType: "Nuevo",
        year,
        observations: "Seguimiento por alergia alimentaria leve.",
        attendance: 96,
        photoTone: "cool"
      },
      {
        id: "ALU-002",
        code: `${year}-0002`,
        names: "Mateo Andres",
        lastNames: "Salazar Paredes",
        fullName: "Mateo Andres Salazar Paredes",
        dni: "73245120",
        birthDate: "2014-09-10",
        sex: "M",
        address: "Jr. Los Nogales 455 - Pueblo Libre",
        phone: "986111333",
        email: "mateo.salazar@familia.pe",
        level: "Primaria",
        grade: "5°",
        section: "A",
        guardianName: "Eduardo Salazar",
        guardianPhone: "981222444",
        guardianRelation: "Padre",
        admissionType: "Trasladado",
        year,
        observations: "Buen desempeno en ciencias.",
        attendance: 92,
        photoTone: "warm"
      },
      {
        id: "ALU-003",
        code: `${year}-0003`,
        names: "Valeria Sofia",
        lastNames: "Quispe Leon",
        fullName: "Valeria Sofia Quispe Leon",
        dni: "76893452",
        birthDate: "2011-11-02",
        sex: "F",
        address: "Mz. F Lote 8 - Chorrillos",
        phone: "980555777",
        email: "valeria.quispe@familia.pe",
        level: "Secundaria",
        grade: "2°",
        section: "B",
        guardianName: "Ruth Leon",
        guardianPhone: "984500600",
        guardianRelation: "Madre",
        admissionType: "Reingresante",
        year,
        observations: "Participa en taller de debate.",
        attendance: 97,
        photoTone: "sun"
      },
      {
        id: "ALU-004",
        code: `${year}-0004`,
        names: "Diego Sebastian",
        lastNames: "Huaman Torres",
        fullName: "Diego Sebastian Huaman Torres",
        dni: "70234891",
        birthDate: "2020-02-14",
        sex: "M",
        address: "Av. Santa Rosa 880 - Ate",
        phone: "987111888",
        email: "diego.huaman@familia.pe",
        level: "Inicial",
        grade: "5 anos",
        section: "A",
        guardianName: "Patricia Torres",
        guardianPhone: "982900400",
        guardianRelation: "Madre",
        admissionType: "Nuevo",
        year,
        observations: "Requiere acompanamiento en adaptacion.",
        attendance: 89,
        photoTone: "fresh"
      }
    ],
    grades: [
      { studentId: "ALU-001", course: "Matematica", teacher: "Carlos Vega", period: "Bimestre 1", score: 18 },
      { studentId: "ALU-001", course: "Comunicacion", teacher: "Ana Torres", period: "Bimestre 1", score: 17 },
      { studentId: "ALU-001", course: "Ciencia y tecnologia", teacher: "Paola Medina", period: "Bimestre 1", score: 19 },
      { studentId: "ALU-002", course: "Matematica", teacher: "Carlos Vega", period: "Bimestre 1", score: 15 },
      { studentId: "ALU-002", course: "Comunicacion", teacher: "Ana Torres", period: "Bimestre 1", score: 16 },
      { studentId: "ALU-002", course: "Ciencia y tecnologia", teacher: "Paola Medina", period: "Bimestre 1", score: 17 },
      { studentId: "ALU-003", course: "Historia", teacher: "Javier Rojas", period: "Bimestre 1", score: 18 },
      { studentId: "ALU-003", course: "Matematica", teacher: "Carlos Vega", period: "Bimestre 1", score: 16 },
      { studentId: "ALU-003", course: "Ingles", teacher: "Martha Diaz", period: "Bimestre 1", score: 19 },
      { studentId: "ALU-004", course: "Psicomotricidad", teacher: "Elena Cruz", period: "Bimestre 1", score: 18 },
      { studentId: "ALU-004", course: "Comunicacion inicial", teacher: "Elena Cruz", period: "Bimestre 1", score: 17 },
      { studentId: "ALU-004", course: "Descubrimiento del mundo", teacher: "Elena Cruz", period: "Bimestre 1", score: 18 }
    ],
    staff: [
      { id: "DOC-01", name: "Carlos Vega", role: "Docente", area: "Matematica", courses: "Matematica, Algebra", grades: "5° A, 2° B", schedule: "Lun a Vie 7:30 - 13:30", tenure: "2019 - actual", email: "c.vega@horizonte.edu" },
      { id: "DOC-02", name: "Ana Torres", role: "Docente", area: "Comunicacion", courses: "Comunicacion", grades: "5° A, 5° B", schedule: "Lun a Vie 7:30 - 13:30", tenure: "2021 - actual", email: "a.torres@horizonte.edu" },
      { id: "DOC-03", name: "Paola Medina", role: "Docente", area: "Ciencia y tecnologia", courses: "Ciencia y tecnologia", grades: "5° A, 6° A", schedule: "Lun a Vie 8:00 - 14:00", tenure: "2020 - actual", email: "p.medina@horizonte.edu" },
      { id: "DOC-04", name: "Elena Cruz", role: "Docente", area: "Inicial", courses: "Comunicacion inicial, Psicomotricidad", grades: "5 anos A", schedule: "Lun a Vie 8:00 - 12:30", tenure: "2018 - actual", email: "e.cruz@horizonte.edu" },
      { id: "ADM-01", name: "Andrea Rojas", role: "Secretaria", area: "Secretaria academica", courses: "-", grades: "-", schedule: "Lun a Sab 8:00 - 16:00", tenure: "2022 - actual", email: "secretaria@horizonte.edu" },
      { id: "ADM-02", name: "Rosa Medina", role: "Tesoreria", area: "Caja", courses: "-", grades: "-", schedule: "Lun a Vie 8:00 - 17:00", tenure: "2023 - actual", email: "tesoreria@horizonte.edu" }
    ],
    planning: [
      { teacherId: "DOC-01", teacher: "Carlos Vega", area: "Matematica", status: "Aprobada", deliveredAt: lastWeek, compliance: 100 },
      { teacherId: "DOC-02", teacher: "Ana Torres", area: "Comunicacion", status: "En revision", deliveredAt: today, compliance: 82 },
      { teacherId: "DOC-03", teacher: "Paola Medina", area: "Ciencia y tecnologia", status: "Pendiente", deliveredAt: "-", compliance: 35 },
      { teacherId: "DOC-04", teacher: "Elena Cruz", area: "Inicial", status: "Observada", deliveredAt: lastWeek, compliance: 60 },
      { teacherId: "DOC-05", teacher: "Martha Diaz", area: "Ingles", status: "Aprobada", deliveredAt: today, compliance: 100 }
    ],
    courses: [
      { course: "Matematica", teacher: "Carlos Vega", section: "5° A", level: "Primaria" },
      { course: "Comunicacion", teacher: "Ana Torres", section: "5° A", level: "Primaria" },
      { course: "Ciencia y tecnologia", teacher: "Paola Medina", section: "5° A", level: "Primaria" },
      { course: "Historia", teacher: "Javier Rojas", section: "2° B", level: "Secundaria" },
      { course: "Ingles", teacher: "Martha Diaz", section: "2° B", level: "Secundaria" },
      { course: "Psicomotricidad", teacher: "Elena Cruz", section: "5 anos A", level: "Inicial" }
    ],
    schedules: [
      {
        sectionKey: "Primaria 5° A",
        room: "Aula 205",
        days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
        rows: [
          ["7:30", "Formacion", "Matematica", "Comunicacion", "Matematica", "Tutoria"],
          ["8:20", "Matematica", "Comunicacion", "Ciencia", "Comunicacion", "Arte"],
          ["9:10", "Comunicacion", "Ciencia", "Matematica", "Ciencia", "Ingles"],
          ["10:20", "Recreo", "Recreo", "Recreo", "Recreo", "Recreo"],
          ["10:50", "Historia", "Computacion", "Historia", "Ingles", "Deporte"],
          ["11:40", "Ingles", "Arte", "Deporte", "Historia", "Proyecto" ]
        ]
      },
      {
        sectionKey: "Inicial 5 anos A",
        room: "Aula Inicial 2",
        days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
        rows: [
          ["8:00", "Bienvenida", "Psicomotricidad", "Comunicacion", "Psicomotricidad", "Juego guiado"],
          ["8:50", "Comunicacion", "Arte", "Descubrimiento", "Comunicacion", "Descubrimiento"],
          ["9:40", "Refrigerio", "Refrigerio", "Refrigerio", "Refrigerio", "Refrigerio"],
          ["10:10", "Juego libre", "Musica", "Psicomotricidad", "Arte", "Taller"],
          ["11:00", "Cierre", "Cierre", "Cierre", "Cierre", "Cierre"]
        ]
      }
    ],
    payments: [
      { id: "PAY-001", studentId: "ALU-001", concept: "Matricula", dueDate: lastWeek, amount: 550, paid: 550, status: "Pagado", receipt: "B001-0001", date: lastWeek, documentType: "Boleta" },
      { id: "PAY-002", studentId: "ALU-001", concept: "Pension marzo", dueDate: today, amount: 380, paid: 380, status: "Pagado", receipt: "B001-0002", date: today, documentType: "Boleta" },
      { id: "PAY-003", studentId: "ALU-001", concept: "Taller de robotica", dueDate: nextWeek, amount: 120, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" },
      { id: "PAY-004", studentId: "ALU-002", concept: "Matricula", dueDate: lastWeek, amount: 550, paid: 550, status: "Pagado", receipt: "F001-0003", date: lastWeek, documentType: "Factura" },
      { id: "PAY-005", studentId: "ALU-002", concept: "Pension marzo", dueDate: today, amount: 380, paid: 200, status: "Parcial", receipt: "B001-0004", date: today, documentType: "Boleta" },
      { id: "PAY-006", studentId: "ALU-003", concept: "Pension marzo", dueDate: lastWeek, amount: 420, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" },
      { id: "PAY-007", studentId: "ALU-003", concept: "Academia deportiva", dueDate: nextFortnight, amount: 150, paid: 150, status: "Pagado", receipt: "B001-0005", date: today, documentType: "Boleta" },
      { id: "PAY-008", studentId: "ALU-004", concept: "Matricula", dueDate: lastWeek, amount: 480, paid: 480, status: "Pagado", receipt: "B001-0006", date: lastWeek, documentType: "Boleta" },
      { id: "PAY-009", studentId: "ALU-004", concept: "Pension marzo", dueDate: nextWeek, amount: 320, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" },
      { id: "PAY-010", studentId: "ALU-001", concept: "Pension abril", dueDate: nextMonth, amount: 380, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" }
    ],
    supplies: [
      { studentId: "ALU-001", status: "Entregado", delivered: ["Cuaderno A4", "Lapices", "Colores", "Folder"], missing: [] },
      { studentId: "ALU-002", status: "Incompleto", delivered: ["Cuaderno A4", "Lapices"], missing: ["Colores", "Folder"] },
      { studentId: "ALU-003", status: "Pendiente", delivered: [], missing: ["Cuaderno cuadriculado", "Compas", "Regla"] },
      { studentId: "ALU-004", status: "Entregado", delivered: ["Cartuchera", "Temperas", "Cuaderno inicial"], missing: [] }
    ],
    activities: [
      { title: "Feria de ciencias", date: nextWeek, responsible: "Coordinacion academica", description: "Presentacion de proyectos interdisciplinarios.", participants: "Primaria y secundaria" },
      { title: "Jornada deportiva", date: nextFortnight, responsible: "Area de tutoria", description: "Encuentro interno por casas.", participants: "Todo el colegio" },
      { title: "Escuela para padres", date: nextMonth, responsible: "Direccion", description: "Taller sobre acompanamiento socioemocional.", participants: "Familias de primaria" },
      { title: "Festival cultural", date: isoDate(45), responsible: "Comite cultural", description: "Muestras artisticas y gastronomicas.", participants: "Inicial, primaria y secundaria" }
    ],
    documents: [
      { id: "DOCS-001", studentId: "ALU-001", type: "Constancia de estudios", issuedAt: lastWeek, code: `CE-${year}-0001` },
      { id: "DOCS-002", studentId: "ALU-002", type: "Constancia de matricula", issuedAt: today, code: `CM-${year}-0001` },
      { id: "DOCS-003", studentId: "ALU-004", type: "Constancia de pago", issuedAt: today, code: `CP-${year}-0001` }
    ]
  };
}

function createDefaultLogs() {
  return [
    {
      id: `LOG-${Date.now()}`,
      user: "sistema",
      name: "Provision inicial",
      role: "Administrador",
      action: "Base institucional preparada",
      timestamp: new Date().toISOString()
    }
  ];
}

function loadFromStorage(key, fallbackValue) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallbackValue;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallbackValue;
  }
}

function saveToStorage(key, value) {
  if (value === null) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

function renderApp() {
  if (!state.session) {
    refs.loginView.classList.remove("hidden");
    refs.appShell.classList.add("hidden");
    refs.loginForm.reset();
    return;
  }

  refs.loginView.classList.add("hidden");
  refs.appShell.classList.remove("hidden");

  ensureSelectedStudent();
  ensureValidActiveSection();
  renderChrome();
  renderSections();
  applyRoleVisibility();
  refs.globalSearch.value = state.search;
}

function renderChrome() {
  refs.schoolName.textContent = state.data.school.name;
  refs.sidebarRole.textContent = state.session.role;
  refs.sidebarUser.textContent = `${state.session.name} (${state.session.username})`;
  refs.topbarDate.textContent = `Actualizado ${formatDateLong(new Date().toISOString())}`;
  renderSidebar();
}

function renderSidebar() {
  const allowed = getAllowedSections();
  refs.navMenu.innerHTML = MODULES.filter((moduleItem) => allowed.includes(moduleItem.id)).map((moduleItem) => {
    const activeClass = state.activeSection === moduleItem.id ? "is-active" : "";
    return `
      <button class="nav-link ${activeClass}" type="button" data-nav-target="${moduleItem.id}">
        <span>${moduleItem.label}</span>
        <small>${moduleItem.hint}</small>
      </button>
    `;
  }).join("");
}

function renderSections() {
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
  renderSecuritySection();
}

function applyRoleVisibility() {
  const allowed = getAllowedSections();
  Object.entries(refs.sections).forEach(([sectionId, element]) => {
    element.classList.toggle("hidden", !allowed.includes(sectionId));
  });
}

function getAllowedSections() {
  return ROLE_ACCESS[state.session.role] || [];
}

function ensureValidActiveSection() {
  const allowed = getAllowedSections();
  if (!allowed.includes(state.activeSection)) {
    state.activeSection = allowed[0] || "dashboard";
  }
}

function ensureSelectedStudent() {
  const exists = state.data.students.some((student) => student.id === state.selectedStudentId);
  if (!exists) {
    state.selectedStudentId = state.data.students[0] ? state.data.students[0].id : null;
  }
}

function navigateTo(sectionId, shouldScroll) {
  state.activeSection = sectionId;
  renderSidebar();

  if (shouldScroll !== false) {
    const target = refs.sections[sectionId];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function isoDate(daysOffset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value || value === "-") {
    return "-";
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateLong(value) {
  return new Date(value).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function statusClass(status) {
  const normalized = normalizeText(status);
  if (["aprobada", "pagado", "entregado"].includes(normalized)) {
    return "success";
  }
  if (["pendiente", "parcial"].includes(normalized)) {
    return "warning";
  }
  if (["observada", "incompleto"].includes(normalized)) {
    return "danger";
  }
  return "info";
}

function initials(fullName) {
  return String(fullName || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function sumBy(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

function getStudentById(studentId) {
  return state.data.students.find((student) => student.id === studentId) || null;
}

function getFilteredStudents() {
  if (!state.search) {
    return state.data.students;
  }

  const query = normalizeText(state.search);
  return state.data.students.filter((student) => {
    return [student.fullName, student.dni, student.code, student.guardianName].some((value) => normalizeText(value).includes(query));
  });
}

function getStudentGrades(studentId) {
  return state.data.grades.filter((grade) => grade.studentId === studentId);
}

function getStudentPayments(studentId) {
  return state.data.payments.filter((payment) => payment.studentId === studentId);
}

function getStudentSupply(studentId) {
  return state.data.supplies.find((supply) => supply.studentId === studentId) || { status: "Pendiente", delivered: [], missing: [] };
}

function getStudentDocuments(studentId) {
  return state.data.documents.filter((documentItem) => documentItem.studentId === studentId);
}

function getStudentAverage(studentId) {
  const grades = getStudentGrades(studentId);
  if (!grades.length) {
    return 0;
  }

  return sumBy(grades, (grade) => grade.score) / grades.length;
}

function getStudentFinancialSummary(studentId) {
  const payments = getStudentPayments(studentId);
  const total = sumBy(payments, (payment) => payment.amount);
  const paid = sumBy(payments, (payment) => payment.paid);
  return {
    total,
    paid,
    pending: total - paid
  };
}

function getVacancy(level, grade, section) {
  const key = `${level}|${grade}|${section}`;
  const capacity = Number(state.data.capacities[key] || 30);
  const used = state.data.students.filter((student) => student.level === level && student.grade === grade && student.section === section).length;
  return {
    capacity,
    used,
    available: Math.max(capacity - used, 0)
  };
}

function getTodayPaymentsAmount() {
  const today = isoDate(0);
  return sumBy(state.data.payments.filter((payment) => payment.date === today), (payment) => payment.paid);
}

function getTotalCollected() {
  return sumBy(state.data.payments, (payment) => payment.paid);
}

function getPendingAmount() {
  return sumBy(state.data.payments, (payment) => payment.amount - payment.paid);
}

function getOverduePayments() {
  const today = isoDate(0);
  return state.data.payments.filter((payment) => payment.status !== "Pagado" && payment.dueDate < today);
}

function getPlanningMetrics() {
  const approved = state.data.planning.filter((item) => item.status === "Aprobada").length;
  const pending = state.data.planning.filter((item) => item.status === "Pendiente").length;
  const compliance = state.data.planning.length ? sumBy(state.data.planning, (item) => item.compliance) / state.data.planning.length : 0;
  return { approved, pending, compliance };
}

function getCourseAverages() {
  const grouped = new Map();
  state.data.grades.forEach((grade) => {
    if (!grouped.has(grade.course)) {
      grouped.set(grade.course, []);
    }
    grouped.get(grade.course).push(grade.score);
  });

  return Array.from(grouped.entries()).map(([course, scores]) => ({
    course,
    average: scores.reduce((total, score) => total + score, 0) / scores.length
  })).sort((left, right) => right.average - left.average);
}

function getIncomeByConcept() {
  const grouped = new Map();
  state.data.payments.filter((payment) => payment.paid > 0).forEach((payment) => {
    const current = grouped.get(payment.concept) || 0;
    grouped.set(payment.concept, current + payment.paid);
  });

  return Array.from(grouped.entries()).map(([concept, total]) => ({ concept, total })).sort((left, right) => right.total - left.total);
}

function getIncomeByMonth() {
  const grouped = new Map();
  state.data.payments.filter((payment) => payment.paid > 0 && payment.date !== "-").forEach((payment) => {
    const monthLabel = new Date(`${payment.date}T12:00:00`).toLocaleDateString("es-PE", { month: "short", year: "numeric" });
    const current = grouped.get(monthLabel) || 0;
    grouped.set(monthLabel, current + payment.paid);
  });

  return Array.from(grouped.entries()).map(([month, total]) => ({ month, total }));
}
function renderStatusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function renderSectionHeader(title, copy, actionsMarkup) {
  return `
    <div class="section-title">
      <div>
        <p class="eyebrow">Modulo operativo</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="supporting-copy">${escapeHtml(copy)}</p>
      </div>
      ${actionsMarkup || ""}
    </div>
  `;
}

function buildGradeOptions(level, selectedGrade) {
  const grades = LEVELS_GRADES[level] || [];
  return grades.map((grade) => `<option value="${grade}" ${grade === selectedGrade ? "selected" : ""}>${grade}</option>`).join("");
}

function renderDashboardSection() {
  const planning = getPlanningMetrics();
  const upcomingActivities = [...state.data.activities].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 3);
  const allowedModules = MODULES.filter((moduleItem) => getAllowedSections().includes(moduleItem.id) && moduleItem.id !== "dashboard").slice(0, 6);

  refs.sections.dashboard.innerHTML = `
    ${renderSectionHeader("Dashboard principal", "Resumen ejecutivo de alumnos, personal, pagos, morosidad y seguimiento academico.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-open-section="admissions">Registrar alumno</button>
        <button class="button button-secondary" type="button" data-open-section="reports">Ver reportes</button>
      </div>
    `)}

    <div class="metric-grid">
      <article class="metric-card">
        <h3>Alumnos matriculados</h3>
        <p class="metric-number">${state.data.students.length}</p>
        <p class="supporting-copy">Anio lectivo ${state.data.school.academicYear}</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Total docentes</h3>
        <p class="metric-number">${state.data.staff.filter((person) => person.role === "Docente").length}</p>
        <p class="supporting-copy">Equipo activo por cursos y areas</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Pagos del dia</h3>
        <p class="metric-number">${formatCurrency(getTodayPaymentsAmount())}</p>
        <p class="supporting-copy">Cobros registrados hoy</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Total recaudado</h3>
        <p class="metric-number">${formatCurrency(getTotalCollected())}</p>
        <p class="supporting-copy">Pagos recibidos en la base actual</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Morosidad</h3>
        <p class="metric-number">${getOverduePayments().length}</p>
        <p class="supporting-copy">Cuotas vencidas por atender</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Planificaciones entregadas</h3>
        <p class="metric-number">${planning.approved}</p>
        <p class="supporting-copy">Cumplimiento promedio ${formatPercent(planning.compliance)}</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Actividades proximas</h3>
        <p class="metric-number">${state.data.activities.length}</p>
        <p class="supporting-copy">Agenda institucional proyectada</p>
        <div class="accent-line"></div>
      </article>
      <article class="metric-card">
        <h3>Saldo pendiente</h3>
        <p class="metric-number">${formatCurrency(getPendingAmount())}</p>
        <p class="supporting-copy">Cuotas por cobrar y pagos parciales</p>
        <div class="accent-line"></div>
      </article>
    </div>

    <div class="grid-two">
      <article class="glass-card">
        <h3>Accesos directos por rol</h3>
        <p class="supporting-copy">Solo se muestran los modulos habilitados para ${escapeHtml(state.session.role)}.</p>
        <div class="button-row">
          ${allowedModules.map((moduleItem) => `<button class="button button-secondary" type="button" data-open-section="${moduleItem.id}">${escapeHtml(moduleItem.label)}</button>`).join("")}
        </div>
      </article>

      <article class="glass-card">
        <h3>Actividades proximas</h3>
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
}
function renderAdmissionsSection() {
  const filteredStudents = getFilteredStudents();
  const vacancy = getVacancy("Primaria", "5°", "A");
  const newStudents = state.data.students.filter((student) => student.admissionType === "Nuevo").length;
  const transferStudents = state.data.students.filter((student) => student.admissionType === "Trasladado").length;

  refs.sections.admissions.innerHTML = `
    ${renderSectionHeader("Matricula y admision", "Registro de alumnos nuevos, trasladados y reingresantes con control de vacantes.", `
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
            <span>Anio lectivo</span>
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
                <th>Anio</th>
                <th>Accion</th>
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
                  <td><button class="link-button" type="button" data-select-student="${student.id}">Ver perfil</button></td>
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
}

function renderProfileSection() {
  const student = getStudentById(state.selectedStudentId);
  if (!student) {
    refs.sections.profile.innerHTML = `<article class="empty-card"><h3>Sin alumnos registrados</h3><p>Registra un alumno para ver su perfil integral.</p></article>`;
    return;
  }

  const grades = getStudentGrades(student.id);
  const payments = getStudentPayments(student.id);
  const documents = getStudentDocuments(student.id);
  const supply = getStudentSupply(student.id);
  const average = getStudentAverage(student.id);
  const finance = getStudentFinancialSummary(student.id);

  refs.sections.profile.innerHTML = `
    ${renderSectionHeader("Perfil integral del alumno", "Vista completa con datos personales, historial academico, pagos, utiles y documentos.", `
      <div class="button-row">
        <button class="button button-soft" type="button" data-open-section="documents">Emitir constancia</button>
      </div>
    `)}

    <div class="profile-layout">
      <aside class="profile-card">
        <div class="profile-avatar">${initials(student.fullName)}</div>
        <h3>${escapeHtml(student.fullName)}</h3>
        <p class="supporting-copy">Codigo ${escapeHtml(student.code)} · DNI ${escapeHtml(student.dni)}</p>
        <div class="chip-row">
          <span class="tag">${escapeHtml(student.level)}</span>
          <span class="tag">${escapeHtml(student.grade)} ${escapeHtml(student.section)}</span>
          <span class="tag">Asistencia ${formatPercent(student.attendance)}</span>
        </div>
        <div class="divider"></div>
        <div class="detail-grid">
          <div>
            <span class="detail-label">Fecha de nacimiento</span>
            <div class="detail-value">${formatDate(student.birthDate)}</div>
          </div>
          <div>
            <span class="detail-label">Apoderado</span>
            <div class="detail-value">${escapeHtml(student.guardianName)} (${escapeHtml(student.guardianRelation || "Apoderado")})</div>
          </div>
          <div>
            <span class="detail-label">Contacto</span>
            <div class="detail-value">${escapeHtml(student.phone)} · ${escapeHtml(student.email)}</div>
          </div>
          <div>
            <span class="detail-label">Direccion</span>
            <div class="detail-value">${escapeHtml(student.address)}</div>
          </div>
          <div>
            <span class="detail-label">Observaciones</span>
            <div class="detail-value">${escapeHtml(student.observations || "Sin observaciones")}</div>
          </div>
        </div>
      </aside>

      <div class="grid-two">
        <article class="profile-card">
          <h3>Historial academico</h3>
          <div class="kpi-row">
            <span class="tag">Promedio ${average.toFixed(1)}</span>
            <span class="tag">${grades.length} registros</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Docente</th>
                  <th>Periodo</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                ${grades.map((grade) => `
                  <tr>
                    <td>${escapeHtml(grade.course)}</td>
                    <td>${escapeHtml(grade.teacher)}</td>
                    <td>${escapeHtml(grade.period)}</td>
                    <td>${grade.score}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>

        <article class="profile-card">
          <h3>Estado financiero</h3>
          <div class="kpi-row">
            <span class="tag">Pagado ${formatCurrency(finance.paid)}</span>
            <span class="tag">Pendiente ${formatCurrency(finance.pending)}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map((payment) => `
                  <tr>
                    <td>${escapeHtml(payment.concept)}</td>
                    <td>${formatDate(payment.dueDate)}</td>
                    <td>${renderStatusPill(payment.status)}</td>
                    <td>${formatCurrency(payment.amount - payment.paid)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>

        <article class="profile-card">
          <h3>Utiles y documentos</h3>
          <div class="timeline-list">
            <div class="timeline-item">
              <strong>Entrega de utiles</strong>
              <p>Estado actual: ${escapeHtml(supply.status)}</p>
              <p>Fecha de entrega: ${formatDate(supply.deliveredAt)}</p>
              <p>Entregado: ${escapeHtml(supply.delivered.join(", ") || "Sin items")}</p>
              <p>Faltante: ${escapeHtml(supply.missing.join(", ") || "Sin pendientes")}</p>
              <p>Observaciones: ${escapeHtml(supply.deliveryNotes || "Sin observaciones")}</p>
            </div>
            <div class="timeline-item">
              <strong>Documentos emitidos</strong>
              <p>${documents.length ? documents.map((item) => `${item.type} (${item.code})`).join(" · ") : "Sin documentos emitidos"}</p>
            </div>
          </div>
        </article>

        <article class="profile-card">
          <h3>Resumen administrativo</h3>
          <div class="detail-grid">
            <div>
              <span class="detail-label">Tipo de ingreso</span>
              <div class="detail-value">${escapeHtml(student.admissionType)}</div>
            </div>
            <div>
              <span class="detail-label">Anio lectivo</span>
              <div class="detail-value">${escapeHtml(student.year)}</div>
            </div>
            <div>
              <span class="detail-label">Cuotas pendientes</span>
              <div class="detail-value">${payments.filter((payment) => payment.status !== "Pagado").length}</div>
            </div>
            <div>
              <span class="detail-label">Constancias emitidas</span>
              <div class="detail-value">${documents.length}</div>
            </div>
          </div>
        </article>
      </div>
    </div>
  `;
}
function renderAcademicSection() {
  const topCourses = getCourseAverages().slice(0, 4);
  const recentGrades = [...state.data.grades].slice(0, 8);

  refs.sections.academic.innerHTML = `
    ${renderSectionHeader("Gestion academica", "Registro de cursos, docentes, calificaciones, promedios y visualizacion por alumno y curso.")}

    <div class="metric-grid">
      ${topCourses.map((courseItem) => `
        <article class="mini-card">
          <h3>${escapeHtml(courseItem.course)}</h3>
          <p class="metric-number">${courseItem.average.toFixed(1)}</p>
          <p class="supporting-copy">Promedio general por curso</p>
        </article>
      `).join("")}
    </div>

    <div class="grid-two">
      <article class="table-card">
        <h3>Cursos y docentes asignados</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Curso</th>
                <th>Docente</th>
                <th>Seccion</th>
                <th>Nivel</th>
              </tr>
            </thead>
            <tbody>
              ${state.data.courses.map((course) => `
                <tr>
                  <td>${escapeHtml(course.course)}</td>
                  <td>${escapeHtml(course.teacher)}</td>
                  <td>${escapeHtml(course.section)}</td>
                  <td>${escapeHtml(course.level)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>

      <article class="table-card">
        <h3>Registro de calificaciones</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Curso</th>
                <th>Periodo</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              ${recentGrades.map((grade) => {
                const student = getStudentById(grade.studentId);
                return `
                  <tr>
                    <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                    <td>${escapeHtml(grade.course)}</td>
                    <td>${escapeHtml(grade.period)}</td>
                    <td>${grade.score}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

function renderPlanningSection() {
  const planning = getPlanningMetrics();

  refs.sections.planning.innerHTML = `
    ${renderSectionHeader("Planificacion docente", "Seguimiento de entregas, revisiones, observaciones y porcentaje de cumplimiento.")}

    <div class="metric-grid">
      <article class="mini-card">
        <h3>Total docentes</h3>
        <p class="metric-number">${state.data.planning.length}</p>
      </article>
      <article class="mini-card">
        <h3>Aprobadas</h3>
        <p class="metric-number">${planning.approved}</p>
      </article>
      <article class="mini-card">
        <h3>Pendientes</h3>
        <p class="metric-number">${planning.pending}</p>
      </article>
      <article class="mini-card">
        <h3>Cumplimiento</h3>
        <p class="metric-number">${formatPercent(planning.compliance)}</p>
      </article>
    </div>

    <article class="table-card">
      <h3>Estado por docente</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Docente</th>
              <th>Area</th>
              <th>Estado</th>
              <th>Entrega</th>
              <th>Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            ${state.data.planning.map((item) => `
              <tr>
                <td>${escapeHtml(item.teacher)}</td>
                <td>${escapeHtml(item.area)}</td>
                <td>${renderStatusPill(item.status)}</td>
                <td>${formatDate(item.deliveredAt)}</td>
                <td>${formatPercent(item.compliance)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderStaffSection() {
  refs.sections.staff.innerHTML = `
    ${renderSectionHeader("Docentes y personal", "Registro de personal academico y administrativo con cursos, grados y horarios asignados.")}

    <div class="grid-three">
      ${state.data.staff.map((person) => `
        <article class="glass-card">
          <div class="chip-row">
            <span class="tag">${escapeHtml(person.role)}</span>
            <span class="tag">${escapeHtml(person.area)}</span>
          </div>
          <h3>${escapeHtml(person.name)}</h3>
          <p>${escapeHtml(person.courses)}</p>
          <p><strong>Grados:</strong> ${escapeHtml(person.grades)}</p>
          <p><strong>Horario:</strong> ${escapeHtml(person.schedule)}</p>
          <p><strong>Historial laboral:</strong> ${escapeHtml(person.tenure)}</p>
          <p><strong>Correo:</strong> ${escapeHtml(person.email)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderScheduleSection() {
  refs.sections.schedule.innerHTML = `
    ${renderSectionHeader("Horarios escolares", "Visualizacion por grado, seccion, aula y docente con opcion de impresion.", `
      <button class="button button-secondary" type="button" data-print-report="horarios">Imprimir horario</button>
    `)}

    <div class="grid-two">
      ${state.data.schedules.map((schedule) => `
        <article class="table-card">
          <h3>${escapeHtml(schedule.sectionKey)}</h3>
          <p class="supporting-copy">${escapeHtml(schedule.room)}</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  ${schedule.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${schedule.rows.map((row) => `
                  <tr>
                    ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFinanceSection() {
  const accountRows = state.data.students.map((student) => {
    const summary = getStudentFinancialSummary(student.id);
    return { student, summary };
  });

  refs.sections.finance.innerHTML = `
    ${renderSectionHeader("Pagos y finanzas", "Registro de matriculas, pensiones, cuotas, pagos parciales y comprobantes.")}

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

    <div class="grid-two">
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
    </div>
  `;
}
function renderAccountingSection() {
  const conceptRows = getIncomeByConcept();
  const monthRows = getIncomeByMonth();
  const conceptMax = Math.max(...conceptRows.map((item) => item.total), 1);
  const monthMax = Math.max(...monthRows.map((item) => item.total), 1);

  refs.sections.accounting.innerHTML = `
    ${renderSectionHeader("Contabilidad", "Visualizacion de ingresos por fecha, concepto, recaudacion mensual y reporte financiero.")}

    <div class="grid-two">
      <article class="glass-card">
        <h3>Ingresos por concepto</h3>
        <div class="bar-chart">
          ${conceptRows.map((item) => `
            <div class="bar-row">
              <div class="bar-label">
                <span>${escapeHtml(item.concept)}</span>
                <strong>${formatCurrency(item.total)}</strong>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${(item.total / conceptMax) * 100}%"></div></div>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="glass-card">
        <h3>Recaudacion mensual</h3>
        <div class="bar-chart">
          ${monthRows.map((item) => `
            <div class="bar-row">
              <div class="bar-label">
                <span>${escapeHtml(item.month)}</span>
                <strong>${formatCurrency(item.total)}</strong>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${(item.total / monthMax) * 100}%"></div></div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;
}

function renderSuppliesSection() {
  refs.sections.supplies.innerHTML = `
    ${renderSectionHeader("Control de utiles escolares", "Seguimiento de listas, entregas por alumno y faltantes por completar.")}

    <article class="table-card">
      <h3>Estado de entrega por alumno</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Estado</th>
              <th>Entregado</th>
              <th>Faltante</th>
            </tr>
          </thead>
          <tbody>
            ${state.data.supplies.map((supply) => {
              const student = getStudentById(supply.studentId);
              return `
                <tr>
                  <td>${escapeHtml(student ? student.fullName : "Alumno")}</td>
                  <td>${renderStatusPill(supply.status)}</td>
                  <td>${escapeHtml(supply.delivered.join(", ") || "Sin items")}</td>
                  <td>${escapeHtml(supply.missing.join(", ") || "Completo")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderActivitiesSection() {
  refs.sections.activities.innerHTML = `
    ${renderSectionHeader("Actividades institucionales", "Agenda de eventos escolares, actividades deportivas, culturales y talleres.")}

    <div class="grid-two">
      ${state.data.activities.map((activity) => `
        <article class="glass-card">
          <div class="chip-row">
            <span class="tag">${formatDate(activity.date)}</span>
            <span class="tag">${escapeHtml(activity.responsible)}</span>
          </div>
          <h3>${escapeHtml(activity.title)}</h3>
          <p>${escapeHtml(activity.description)}</p>
          <p><strong>Participantes:</strong> ${escapeHtml(activity.participants)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderReportsSection() {
  refs.sections.reports.innerHTML = `
    ${renderSectionHeader("Reportes", "Generacion de reportes en formato compatible con Excel y salida lista para imprimir o guardar en PDF.")}

    <div class="grid-three">
      ${REPORT_DEFINITIONS.map((report) => `
        <article class="report-card">
          <h3>${escapeHtml(report.label)}</h3>
          <p>${escapeHtml(report.description)}</p>
          <div class="button-row">
            <button class="button button-soft" type="button" data-export-report="${report.id}">Exportar Excel</button>
            <button class="button button-secondary" type="button" data-print-report="${report.id}">Exportar PDF</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDocumentsSection() {
  const selectedStudentId = state.documentStudentId || state.selectedStudentId || (state.data.students[0] && state.data.students[0].id);
  const selectedType = state.documentType || "Constancia de estudios";
  const student = getStudentById(selectedStudentId);
  const preview = student ? buildDocumentHtml(student, selectedType) : "<p>Seleccione un alumno.</p>";
  const recentDocs = [...state.data.documents].slice(-5).reverse();

  refs.sections.documents.innerHTML = `
    ${renderSectionHeader("Constancias y documentos", "Emision institucional con logo, impresion directa y descarga mediante la impresora PDF del navegador.")}

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
          <div class="button-row">
            <button class="button button-primary" type="button" data-print-document="true">Imprimir documento</button>
            <button class="button button-secondary" type="button" data-save-document="true">Registrar emision</button>
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
}

function renderSecuritySection() {
  const recentLogs = [...state.logs].slice(-8).reverse();
  const allowedTags = getAllowedSections().map((sectionId) => {
    const moduleItem = MODULES.find((item) => item.id === sectionId);
    return moduleItem ? `<span class="tag">${escapeHtml(moduleItem.label)}</span>` : "";
  }).join("");

  refs.sections.security.innerHTML = `
    ${renderSectionHeader("Seguridad y auditoria", "Control de acceso por rol, registro de actividad del sistema y lineamientos para una version productiva.")}

    <div class="grid-two">
      <article class="glass-card">
        <h3>Controles visibles en esta base</h3>
        <ul class="list-clean">
          <li>Inicio de sesion institucional con permisos por rol.</li>
          <li>Registro de accesos y acciones relevantes en la bitacora.</li>
          <li>Sesion local persistente para el navegador actual.</li>
          <li>Restriccion visual de modulos segun el perfil del usuario.</li>
        </ul>
        <div class="divider"></div>
        <h3>Permisos del rol activo</h3>
        <div class="chip-row">${allowedTags}</div>
      </article>

      <article class="glass-card">
        <h3>Para produccion</h3>
        <ul class="list-clean">
          <li>Hash de contrasenas con bcrypt o Argon2 en backend.</li>
          <li>Sesiones seguras con cookies httpOnly o tokens rotados.</li>
          <li>Auditoria persistente en base de datos centralizada.</li>
          <li>Respaldo automatico y monitoreo de actividad sospechosa.</li>
        </ul>
      </article>
    </div>

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
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}
async function handleLogin(event) {
  if (isHostedRuntime() && typeof window.__backendHandleLogin === "function") {
    return window.__backendHandleLogin(event);
  }

  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = normalizeText(formData.get("username"));
  const password = String(formData.get("password") || "");

  if (isHostedRuntime()) {
    HTMLFormElement.prototype.submit.call(event.currentTarget);
    return;
  }

  const user = USERS[username];

  if (!user || user.password !== password) {
    showToast("Credenciales invalidas. Verifica tu usuario y contrasena institucional.", "error");
    return;
  }

  state.session = {
    username: user.username,
    name: user.name,
    role: user.role,
    startedAt: new Date().toISOString()
  };
  state.activeSection = (ROLE_ACCESS[user.role] && ROLE_ACCESS[user.role][0]) || "dashboard";
  saveToStorage(STORAGE_KEYS.session, state.session);
  recordLog(user, "Inicio de sesion");
  renderApp();
  showToast(`Bienvenido(a), ${user.name}.`);
}

async function handleLogout() {
  if (isHostedRuntime() && typeof window.__backendHandleLogout === "function") {
    return window.__backendHandleLogout();
  }

  if (isHostedRuntime()) {
    window.location.assign("/api/logout-web");
    return;
  }

  if (state.session) {
    recordLog(state.session, "Cierre de sesion");
  }
  state.session = null;
  saveToStorage(STORAGE_KEYS.session, null);
  renderApp();
  showToast("La sesion fue cerrada correctamente.");
}

function handleDynamicClick(event) {
  const navButton = event.target.closest("[data-nav-target]");
  if (navButton) {
    navigateTo(navButton.dataset.navTarget, true);
    return;
  }

  const sectionButton = event.target.closest("[data-open-section]");
  if (sectionButton) {
    navigateTo(sectionButton.dataset.openSection, true);
    return;
  }

  const studentButton = event.target.closest("[data-select-student]");
  if (studentButton) {
    state.selectedStudentId = studentButton.dataset.selectStudent;
    renderProfileSection();
    navigateTo("profile", true);
    return;
  }

  const exportButton = event.target.closest("[data-export-report]");
  if (exportButton) {
    exportReport(exportButton.dataset.exportReport);
    return;
  }

  const printReportButton = event.target.closest("[data-print-report]");
  if (printReportButton) {
    printReport(printReportButton.dataset.printReport);
    return;
  }

  const printDocumentButton = event.target.closest("[data-print-document]");
  if (printDocumentButton) {
    printDocument();
    return;
  }

  const saveDocumentButton = event.target.closest("[data-save-document]");
  if (saveDocumentButton) {
    saveCurrentDocument();
    return;
  }

  const receiptButton = event.target.closest("[data-print-receipt]");
  if (receiptButton) {
    printReceipt(receiptButton.dataset.printReceipt);
  }
}

function handleDynamicSubmit(event) {
  if (event.target.id !== "studentForm") {
    return;
  }

  event.preventDefault();
  const formData = new FormData(event.target);
  const level = String(formData.get("level"));
  const grade = String(formData.get("grade"));
  const section = String(formData.get("section"));
  const vacancy = getVacancy(level, grade, section);

  if (vacancy.available <= 0) {
    showToast("No hay vacantes disponibles para el nivel, grado y seccion elegidos.");
    return;
  }

  const student = {
    id: nextStudentId(),
    code: nextStudentCode(),
    names: String(formData.get("names") || "").trim(),
    lastNames: String(formData.get("lastNames") || "").trim(),
    fullName: `${String(formData.get("names") || "").trim()} ${String(formData.get("lastNames") || "").trim()}`.trim(),
    dni: String(formData.get("dni") || "").trim(),
    birthDate: String(formData.get("birthDate") || ""),
    sex: String(formData.get("sex") || "F"),
    address: String(formData.get("address") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    level,
    grade,
    section,
    guardianName: String(formData.get("guardianName") || "").trim(),
    guardianPhone: String(formData.get("guardianPhone") || "").trim(),
    guardianRelation: "Apoderado",
    admissionType: String(formData.get("admissionType") || "Nuevo"),
    year: Number(formData.get("year") || state.data.school.academicYear),
    observations: String(formData.get("observations") || "").trim(),
    attendance: 100,
    photoTone: "fresh"
  };

  state.data.students.push(student);
  state.data.supplies.push({ studentId: student.id, status: "Pendiente", delivered: [], missing: ["Lista pendiente de asignacion"] });
  const firstPaymentId = nextPaymentId();
  state.data.payments.push({ id: firstPaymentId, studentId: student.id, concept: "Matricula", dueDate: isoDate(5), amount: 550, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" });
  state.data.payments.push({ id: nextPaymentId(), studentId: student.id, concept: "Pension inicial", dueDate: isoDate(30), amount: 380, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" });

  state.selectedStudentId = student.id;
  saveToStorage(STORAGE_KEYS.data, state.data);
  recordLog(state.session, `Registro de alumno ${student.fullName}`);
  renderApp();
  navigateTo("profile", true);
  showToast("Matricula registrada con exito. Los campos fueron limpiados automaticamente.");
}

function handleDynamicChange(event) {
  if (event.target.id === "admissionLevel") {
    const level = event.target.value;
    const gradeSelect = document.getElementById("admissionGrade");
    if (gradeSelect) {
      gradeSelect.innerHTML = buildGradeOptions(level, (LEVELS_GRADES[level] || [])[0] || "");
    }
    updateAdmissionVacancyHint();
    return;
  }

  if (event.target.id === "admissionGrade" || event.target.id === "admissionSection") {
    updateAdmissionVacancyHint();
    return;
  }

  if (event.target.id === "docStudentSelect") {
    state.documentStudentId = event.target.value;
    renderDocumentsSection();
    return;
  }

  if (event.target.id === "docTypeSelect") {
    state.documentType = event.target.value;
    renderDocumentsSection();
  }
}

function updateAdmissionVacancyHint() {
  const level = document.getElementById("admissionLevel");
  const grade = document.getElementById("admissionGrade");
  const section = document.getElementById("admissionSection");
  const hint = document.getElementById("vacancyHint");

  if (!level || !grade || !section || !hint) {
    return;
  }

  const vacancy = getVacancy(level.value, grade.value, section.value);
  hint.textContent = `Vacantes disponibles: ${vacancy.available} de ${vacancy.capacity}`;
}

function nextStudentId() {
  return `ALU-${String(state.data.students.length + 1).padStart(3, "0")}`;
}

function nextStudentCode() {
  return `${state.data.school.academicYear}-${String(state.data.students.length + 1).padStart(4, "0")}`;
}

function nextPaymentId() {
  return `PAY-${String(state.data.payments.length + 1).padStart(3, "0")}`;
}

function nextDocumentCode(type) {
  const prefixMap = {
    "Constancia de estudios": "CE",
    "Constancia de matricula": "CM",
    "Constancia de pago": "CP",
    "Constancia de no adeudo": "CN"
  };
  const prefix = prefixMap[type] || "DC";
  return `${prefix}-${state.data.school.academicYear}-${String(state.data.documents.length + 1).padStart(4, "0")}`;
}

function recordLog(user, action) {
  const source = user || { username: "sistema", name: "Sistema", role: "Administrador" };
  state.logs.push({
    id: `LOG-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    user: source.username,
    name: source.name,
    role: source.role,
    action,
    timestamp: new Date().toISOString()
  });
  saveToStorage(STORAGE_KEYS.logs, state.logs);
  renderSecuritySection();
}

function exportReport(reportId) {
  const report = buildReportDataset(reportId);
  const csv = [report.headers, ...report.rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${report.fileName}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Reporte ${report.title} exportado para Excel.`);
}

function printReport(reportId) {
  const report = buildReportDataset(reportId);
  const headerRow = `<tr>${report.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  const bodyRows = report.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  printHtml(report.title, `
    <h2>${escapeHtml(report.title)}</h2>
    <table>
      <thead>${headerRow}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `);
}

function buildReportDataset(reportId) {
  switch (reportId) {
    case "matriculas":
      return {
        title: "Reporte de matriculas",
        fileName: "reporte_matriculas",
        headers: ["Codigo", "Alumno", "DNI", "Nivel", "Grado", "Seccion", "Apoderado", "Ingreso", "Anio"],
        rows: state.data.students.map((student) => [student.code, student.fullName, student.dni, student.level, student.grade, student.section, student.guardianName, student.admissionType, String(student.year)])
      };
    case "academico":
      return {
        title: "Reporte academico",
        fileName: "reporte_academico",
        headers: ["Alumno", "Curso", "Docente", "Periodo", "Nota"],
        rows: state.data.grades.map((grade) => {
          const student = getStudentById(grade.studentId);
          return [student ? student.fullName : "Alumno", grade.course, grade.teacher, grade.period, String(grade.score)];
        })
      };
    case "pagos":
      return {
        title: "Reporte de pagos",
        fileName: "reporte_pagos",
        headers: ["Alumno", "Concepto", "Monto", "Pagado", "Estado", "Vencimiento", "Comprobante"],
        rows: state.data.payments.map((payment) => {
          const student = getStudentById(payment.studentId);
          return [student ? student.fullName : "Alumno", payment.concept, String(payment.amount), String(payment.paid), payment.status, payment.dueDate, payment.receipt];
        })
      };
    case "morosidad":
      return {
        title: "Reporte de morosidad",
        fileName: "reporte_morosidad",
        headers: ["Alumno", "Concepto", "Pendiente", "Vencimiento", "Estado"],
        rows: getOverduePayments().map((payment) => {
          const student = getStudentById(payment.studentId);
          return [student ? student.fullName : "Alumno", payment.concept, String(payment.amount - payment.paid), payment.dueDate, payment.status];
        })
      };
    case "docentes":
      return {
        title: "Reporte de docentes y personal",
        fileName: "reporte_docentes",
        headers: ["Nombre", "Rol", "Area", "Cursos", "Grados", "Horario"],
        rows: state.data.staff.map((person) => [person.name, person.role, person.area, person.courses, person.grades, person.schedule])
      };
    case "horarios":
      return {
        title: "Reporte de horarios",
        fileName: "reporte_horarios",
        headers: ["Seccion", "Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
        rows: state.data.schedules.flatMap((schedule) => schedule.rows.map((row) => [schedule.sectionKey, ...row]))
      };
    default:
      return {
        title: "Reporte financiero",
        fileName: "reporte_financiero",
        headers: ["Concepto", "Ingresos"],
        rows: getIncomeByConcept().map((item) => [item.concept, String(item.total)])
      };
  }
}

function csvEscape(value) {
  const text = String(value || "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildDocumentHtml(student, type) {
  const finance = getStudentFinancialSummary(student.id);
  const lastPayment = [...getStudentPayments(student.id)].filter((payment) => payment.paid > 0).slice(-1)[0];
  const issueDate = formatDate(isoDate(0));
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
    body = `Se deja constancia que el estudiante <strong>${escapeHtml(student.fullName)}</strong> cursa estudios en esta institucion educativa privada durante el anio lectivo ${escapeHtml(student.year)}.`;
  }

  return `
    <div class="document-header">
      <div class="document-logo">${escapeHtml(state.data.school.logo)}</div>
      <div>
        <p class="eyebrow" style="color:#5a6579;">Institucion educativa privada</p>
        <h3>${escapeHtml(state.data.school.name)}</h3>
        <p>${escapeHtml(state.data.school.city)} · ${issueDate}</p>
      </div>
    </div>
    <h4>${escapeHtml(type)}</h4>
    <p>${body}</p>
    <p>Codigo interno: ${escapeHtml(nextDocumentCode(type))}</p>
    <p>Emitido por: ${escapeHtml(state.session ? state.session.name : "Sistema")}</p>
  `;
}

function ensureDocumentRecord(studentId, type) {
  const today = isoDate(0);
  const existing = state.data.documents.find((documentItem) => documentItem.studentId === studentId && documentItem.type === type && documentItem.issuedAt === today);
  if (existing) {
    return existing;
  }

  const record = {
    id: `DOCS-${String(state.data.documents.length + 1).padStart(3, "0")}`,
    studentId,
    type,
    issuedAt: today,
    code: nextDocumentCode(type)
  };
  state.data.documents.push(record);
  saveToStorage(STORAGE_KEYS.data, state.data);
  renderDocumentsSection();
  renderProfileSection();
  return record;
}

function saveCurrentDocument() {
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
  showToast(`Documento registrado con codigo ${record.code}.`);
}

function printDocument() {
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
}

function printReceipt(paymentId) {
  const payment = state.data.payments.find((item) => item.id === paymentId);
  if (!payment || payment.paid <= 0) {
    showToast("El pago seleccionado no tiene comprobante emitido.");
    return;
  }

  const student = getStudentById(payment.studentId);
  printHtml("Comprobante de pago", `
    <h2>Comprobante de pago</h2>
    <p><strong>Alumno:</strong> ${escapeHtml(student ? student.fullName : "Alumno")}</p>
    <p><strong>Concepto:</strong> ${escapeHtml(payment.concept)}</p>
    <p><strong>Monto cancelado:</strong> ${formatCurrency(payment.paid)}</p>
    <p><strong>Tipo:</strong> ${escapeHtml(payment.documentType)}</p>
    <p><strong>Numero:</strong> ${escapeHtml(payment.receipt)}</p>
    <p><strong>Fecha:</strong> ${formatDate(payment.date)}</p>
  `);
}

function printHtml(title, content) {
  const popup = window.open("", "_blank", "width=900,height=700");
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
          body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
          h2, h3, h4 { margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
          p { line-height: 1.6; }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

function showToast(message, tone = "info") {
  refs.toast.textContent = message;
  refs.toast.classList.remove("toast-info", "toast-error", "toast-success");
  refs.toast.classList.add(`toast-${tone}`);
  refs.toast.setAttribute("role", tone === "error" ? "alert" : "status");
  refs.toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  refs.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timerId);
  showToast.timerId = window.setTimeout(() => {
    refs.toast.classList.remove("is-visible");
  }, 3200);
}

window.STORAGE_KEYS = STORAGE_KEYS;
window.state = state;
window.refs = refs;

window.loadFromStorage = loadFromStorage;
window.saveToStorage = saveToStorage;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.recordLog = recordLog;
window.renderSecuritySection = renderSecuritySection;
window.renderApp = renderApp;
window.normalizeText = normalizeText;
window.formatDateLong = formatDateLong;
window.escapeHtml = escapeHtml;
window.showToast = showToast;

