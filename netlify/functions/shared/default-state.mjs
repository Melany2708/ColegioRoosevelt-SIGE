function isoDate(daysOffset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeScheduleRow(row) {
  if (!Array.isArray(row)) {
    return ["", "", "", "", "", ""];
  }

  const nextRow = row.slice(0, 6).map((cell) => String(cell || ""));
  while (nextRow.length < 6) {
    nextRow.push("");
  }
  return nextRow;
}

function inferScheduleLevel(schedule) {
  const raw = String(schedule?.level || schedule?.sectionKey || "");
  const lower = raw.toLowerCase();
  if (lower.includes("secundaria")) {
    return "Secundaria";
  }
  if (lower.includes("inicial")) {
    return "Inicial";
  }
  return "Primaria";
}

const DEFAULT_ASSESSMENT_TYPES = [
  "Examen de avance",
  "Examen trimestral",
  "Trabajos",
  "Exposiciones",
  "Participacion en aula"
];

export function createDefaultAppState() {
  const year = new Date().getFullYear();
  const today = isoDate(0);
  const lastWeek = isoDate(-7);
  const nextWeek = isoDate(7);
  const nextFortnight = isoDate(15);
  const nextMonth = isoDate(30);

  return {
    school: {
      name: "Colegio Privado Roosevelt",
      academicYear: year,
      city: "Lima",
      logo: "CPR",
      adminName: "Melanie Castro Jones",
      theme: "roosevelt",
      documentTemplate: ""
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
      { id: "DOC-01", name: "Carlos Vega", role: "Docente", area: "Matematica", courses: "Matematica, Algebra", grades: "5° A, 2° B", schedule: "Lun a Vie 7:30 - 13:30", tenure: "2019 - actual", email: "c.vega@roosevelt.edu", phone: "", loginUsername: "cvega", authRole: "Docentes" },
      { id: "DOC-02", name: "Ana Torres", role: "Docente", area: "Comunicacion", courses: "Comunicacion", grades: "5° A, 5° B", schedule: "Lun a Vie 7:30 - 13:30", tenure: "2021 - actual", email: "a.torres@roosevelt.edu", phone: "", loginUsername: "atorres", authRole: "Docentes" },
      { id: "DOC-03", name: "Paola Medina", role: "Docente", area: "Ciencia y tecnologia", courses: "Ciencia y tecnologia", grades: "5° A, 6° A", schedule: "Lun a Vie 8:00 - 14:00", tenure: "2020 - actual", email: "p.medina@roosevelt.edu", phone: "", loginUsername: "pmedina", authRole: "Docentes" },
      { id: "DOC-04", name: "Elena Cruz", role: "Docente", area: "Inicial", courses: "Comunicacion inicial, Psicomotricidad", grades: "5 anos A", schedule: "Lun a Vie 8:00 - 12:30", tenure: "2018 - actual", email: "e.cruz@roosevelt.edu", phone: "", loginUsername: "ecruz", authRole: "Docentes" },
      { id: "ADM-01", name: "Andrea Rojas", role: "Secretaria", area: "Secretaria academica", courses: "-", grades: "-", schedule: "Lun a Sab 8:00 - 16:00", tenure: "2022 - actual", email: "secretaria@roosevelt.edu", phone: "", loginUsername: "secretaria", authRole: "Secretaria" },
      { id: "ADM-02", name: "Rosa Medina", role: "Tesoreria", area: "Caja", courses: "-", grades: "-", schedule: "Lun a Vie 8:00 - 17:00", tenure: "2023 - actual", email: "tesoreria@roosevelt.edu", phone: "", loginUsername: "tesoreria", authRole: "Caja / tesoreria" }
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
        id: "SCH-001",
        level: "Primaria",
        sectionKey: "Primaria 5° A",
        room: "Aula 205",
        days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
        rows: [
          ["7:20", "Formacion", "Matematica", "Comunicacion", "Matematica", "Tutoria"],
          ["8:10", "Matematica", "Comunicacion", "Ciencia", "Comunicacion", "Arte"],
          ["9:00", "Comunicacion", "Ciencia", "Matematica", "Ciencia", "Ingles"],
          ["10:00", "RECREO", "RECREO", "RECREO", "RECREO", "RECREO"],
          ["10:20", "Historia", "Computacion", "Historia", "Ingles", "Deporte"],
          ["11:10", "Ingles", "Arte", "Deporte", "Historia", "Proyecto"],
          ["12:00", "Proyecto", "Lectura", "Tutoria", "Proyecto", "Cierre"],
          ["12:50", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15", "SALIDA 13:15"]
        ]
      },
      {
        id: "SCH-002",
        level: "Secundaria",
        sectionKey: "Secundaria 2° B",
        room: "Aula 302",
        days: ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
        rows: [
          ["7:20", "Historia", "Matematica", "Historia", "Matematica", "Tutoria"],
          ["8:10", "Matematica", "Ingles", "Matematica", "Ingles", "Ciencia"],
          ["9:00", "Comunicacion", "Historia", "Comunicacion", "Historia", "Arte"],
          ["9:50", "Ciencia", "Proyecto", "Ciencia", "Proyecto", "Deporte"],
          ["11:00", "RECREO", "RECREO", "RECREO", "RECREO", "RECREO"],
          ["11:20", "Ingles", "Comunicacion", "Ingles", "Comunicacion", "Tutoria"],
          ["12:10", "Laboratorio", "Arte", "Laboratorio", "Arte", "Club"],
          ["13:00", "Proyecto", "Proyecto", "Proyecto", "Proyecto", "Cierre"],
          ["13:50", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00", "SALIDA 14:00"]
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
      { id: "PAY-010", studentId: "ALU-001", concept: "Pension abril", dueDate: nextMonth, amount: 380, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" },
      { id: "PAY-011", studentId: "ALU-001", concept: "Buso institucional", dueDate: nextWeek, amount: 140, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" },
      { id: "PAY-012", studentId: "ALU-001", concept: "Uniforme institucional", dueDate: nextFortnight, amount: 160, paid: 0, status: "Pendiente", receipt: "-", date: "-", documentType: "Boleta" }
    ],
    supplies: [
      { studentId: "ALU-001", status: "Entregado", delivered: ["Cuaderno A4", "Lapices", "Colores", "Folder"], missing: [], deliveredAt: isoDate(-16), deliveryNotes: "Entrega conforme registrada." },
      { studentId: "ALU-002", status: "Incompleto", delivered: ["Cuaderno A4", "Lapices"], missing: ["Colores", "Folder"], deliveredAt: isoDate(-10), deliveryNotes: "Entrega parcial registrada por almacen." },
      { studentId: "ALU-003", status: "Pendiente", delivered: [], missing: ["Cuaderno cuadriculado", "Compas", "Regla"], deliveredAt: "", deliveryNotes: "Pendiente de entrega." },
      { studentId: "ALU-004", status: "Entregado", delivered: ["Cartuchera", "Temperas", "Cuaderno inicial"], missing: [], deliveredAt: isoDate(-8), deliveryNotes: "Entrega conforme registrada." }
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
    ],
    attendance: [
      { id: "ATT-0001", studentId: "ALU-001", date: today, status: "Presente", notes: "" },
      { id: "ATT-0002", studentId: "ALU-002", date: today, status: "Llego tarde", notes: "Ingreso despues del toque de formacion." },
      { id: "ATT-0003", studentId: "ALU-003", date: today, status: "Ausente", notes: "" },
      { id: "ATT-0004", studentId: "ALU-004", date: today, status: "Retirado", notes: "Retiro autorizado por el apoderado." }
    ],
    gradeTables: [],
    simulations: []
  };
}

export function normalizeAppState(source) {
  const defaults = createDefaultAppState();
  const input = source && typeof source === "object" ? deepClone(source) : {};
  const nextState = {
    ...defaults,
    ...input
  };

  nextState.school = {
    ...defaults.school,
    ...(input.school || {})
  };
  nextState.capacities = {
    ...defaults.capacities,
    ...(input.capacities || {})
  };

  nextState.students = Array.isArray(input.students) ? input.students.map((student, index) => ({
    ...defaults.students[0],
    id: student.id || `ALU-${String(index + 1).padStart(3, "0")}`,
    code: student.code || `${nextState.school.academicYear}-${String(index + 1).padStart(4, "0")}`,
    names: student.names || "",
    lastNames: student.lastNames || "",
    fullName: student.fullName || `${String(student.names || "").trim()} ${String(student.lastNames || "").trim()}`.trim(),
    dni: String(student.dni || ""),
    birthDate: String(student.birthDate || ""),
    sex: student.sex || "F",
    address: student.address || "",
    phone: student.phone || "",
    email: student.email || "",
    level: student.level || "Primaria",
    grade: student.grade || "1°",
    section: student.section || "A",
    guardianName: student.guardianName || "",
    guardianPhone: student.guardianPhone || "",
    guardianRelation: student.guardianRelation || "Apoderado",
    admissionType: student.admissionType || "Nuevo",
    year: Number(student.year || nextState.school.academicYear),
    observations: student.observations || "",
    attendance: Number(student.attendance || 0),
    photoTone: student.photoTone || "fresh"
  })) : defaults.students;

  nextState.grades = Array.isArray(input.grades) ? input.grades.map((grade) => ({
    studentId: String(grade.studentId || ""),
    course: String(grade.course || ""),
    teacher: String(grade.teacher || ""),
    period: String(grade.period || grade.trimester || "Trimestre 1"),
    trimester: String(grade.trimester || grade.period || "Trimestre 1"),
    assessmentType: String(grade.assessmentType || DEFAULT_ASSESSMENT_TYPES[0]),
    sectionKey: String(grade.sectionKey || ""),
    score: Number(grade.score || 0),
    recordedAt: String(grade.recordedAt || isoDate(0)),
    id: String(grade.id || "")
  })) : defaults.grades;

  nextState.staff = Array.isArray(input.staff) ? input.staff.map((person, index) => ({
    id: person.id || `PER-${String(index + 1).padStart(3, "0")}`,
    name: person.name || "Personal",
    role: person.role || "Administrativo",
    area: person.area || "Area general",
    courses: person.courses || "-",
    grades: person.grades || "-",
    schedule: person.schedule || "",
    tenure: person.tenure || "Ingreso reciente",
    email: person.email || `personal${index + 1}@roosevelt.edu`,
    phone: person.phone || "",
    loginUsername: person.loginUsername || "",
    authRole: person.authRole || ""
  })) : defaults.staff;

  nextState.planning = Array.isArray(input.planning) ? input.planning.map((item) => ({
    teacherId: String(item.teacherId || ""),
    teacher: String(item.teacher || ""),
    area: String(item.area || ""),
    status: String(item.status || "Pendiente"),
    deliveredAt: String(item.deliveredAt || "-"),
    compliance: Number(item.compliance || 0)
  })) : defaults.planning;

  nextState.courses = Array.isArray(input.courses) ? input.courses.map((course) => ({
    course: String(course.course || ""),
    teacher: String(course.teacher || ""),
    section: String(course.section || ""),
    level: String(course.level || inferScheduleLevel(course))
  })) : defaults.courses;

  nextState.schedules = Array.isArray(input.schedules) ? input.schedules.map((schedule, index) => ({
    id: schedule.id || `SCH-${String(index + 1).padStart(3, "0")}`,
    level: schedule.level || inferScheduleLevel(schedule),
    sectionKey: schedule.sectionKey || `Seccion ${index + 1}`,
    room: schedule.room || "Aula pendiente",
    days: Array.isArray(schedule.days) && schedule.days.length ? schedule.days.slice(0, 6).map((day) => String(day || "")) : ["Hora", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes"],
    rows: Array.isArray(schedule.rows) && schedule.rows.length ? schedule.rows.map((row) => normalizeScheduleRow(row)) : []
  })) : defaults.schedules;

  nextState.payments = Array.isArray(input.payments) ? input.payments.map((payment, index) => ({
    id: payment.id || `PAY-${String(index + 1).padStart(3, "0")}`,
    studentId: String(payment.studentId || ""),
    concept: String(payment.concept || "Concepto"),
    dueDate: String(payment.dueDate || "-"),
    amount: Number(payment.amount || 0),
    paid: Number(payment.paid || 0),
    status: String(payment.status || "Pendiente"),
    receipt: String(payment.receipt || "-"),
    date: String(payment.date || "-"),
    documentType: String(payment.documentType || "Boleta")
  })) : defaults.payments;

  nextState.supplies = Array.isArray(input.supplies) ? input.supplies.map((supply) => ({
    studentId: String(supply.studentId || ""),
    status: String(supply.status || "Pendiente"),
    delivered: Array.isArray(supply.delivered) ? supply.delivered.map((item) => String(item || "")) : [],
    missing: Array.isArray(supply.missing) ? supply.missing.map((item) => String(item || "")) : [],
    deliveredAt: String(supply.deliveredAt || ""),
    deliveryNotes: String(supply.deliveryNotes || "")
  })) : defaults.supplies;

  nextState.activities = Array.isArray(input.activities) ? input.activities.map((activity) => ({
    title: String(activity.title || "Actividad"),
    date: String(activity.date || ""),
    responsible: String(activity.responsible || ""),
    description: String(activity.description || ""),
    participants: String(activity.participants || "")
  })) : defaults.activities;

  nextState.documents = Array.isArray(input.documents) ? input.documents.map((documentItem, index) => ({
    id: documentItem.id || `DOCS-${String(index + 1).padStart(3, "0")}`,
    studentId: String(documentItem.studentId || ""),
    type: String(documentItem.type || "Constancia de estudios"),
    issuedAt: String(documentItem.issuedAt || isoDate(0)),
    code: String(documentItem.code || `DOC-${nextState.school.academicYear}-${String(index + 1).padStart(4, "0")}`)
  })) : defaults.documents;

  nextState.attendance = Array.isArray(input.attendance) ? input.attendance.map((entry, index) => ({
    id: String(entry.id || `ATT-${String(index + 1).padStart(4, "0")}`),
    studentId: String(entry.studentId || ""),
    date: String(entry.date || isoDate(0)),
    status: String(entry.status || "Presente"),
    notes: String(entry.notes || "")
  })) : defaults.attendance;

  nextState.gradeTables = Array.isArray(input.gradeTables) ? input.gradeTables.map((table, index) => ({
    id: String(table.id || `GTB-${String(index + 1).padStart(3, "0")}`),
    teacher: String(table.teacher || ""),
    course: String(table.course || ""),
    section: String(table.section || ""),
    assessmentTypes: Array.isArray(table.assessmentTypes) && table.assessmentTypes.length
      ? table.assessmentTypes.map((item) => String(item || ""))
      : [...DEFAULT_ASSESSMENT_TYPES],
    updatedAt: String(table.updatedAt || isoDate(0))
  })) : defaults.gradeTables;

  nextState.simulations = Array.isArray(input.simulations) ? input.simulations.map((item, index) => ({
    id: String(item.id || `SIM-${String(index + 1).padStart(3, "0")}`),
    simulationType: String(item.simulationType || "Primer simulacro"),
    studentId: String(item.studentId || ""),
    studentName: String(item.studentName || ""),
    dni: String(item.dni || ""),
    totalScore: Number(item.totalScore || 0),
    date: String(item.date || isoDate(0))
  })) : defaults.simulations;

  return nextState;
}

export function hasMeaningfulState(source) {
  if (!source || typeof source !== "object") {
    return false;
  }
  return Array.isArray(source.students) && source.students.length > 0;
}
