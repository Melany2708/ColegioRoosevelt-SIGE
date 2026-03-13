import { countUsers, getAuthenticatedUser } from "./shared/auth.mjs";
import { listAuditLogs } from "./shared/audit.mjs";
import { jsonResponse, methodNotAllowed } from "./shared/http.mjs";
import { getSnapshot } from "./shared/snapshot.mjs";
import { ACCESS_MANAGER_ROLE } from "./shared/users.mjs";

function buildAccessOnlyState(source) {
  return {
    school: {
      name: "Colegio Privado Roosevelt",
      academicYear: new Date().getFullYear(),
      city: "Lima",
      logo: "CPR",
      adminName: "Melanie Castro Jones",
      theme: "roosevelt",
      documentTemplate: "",
      ...(source?.school || {})
    },
    capacities: {
      Primaria: 120,
      Secundaria: 90,
      Inicial: 45,
      ...(source?.capacities || {})
    },
    students: [],
    grades: [],
    staff: [],
    planning: [],
    courses: [],
    schedules: [],
    payments: [],
    supplies: [],
    activities: [],
    documents: [],
    attendance: [],
    gradeTables: [],
    simulations: []
  };
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  try {
    const userCount = await countUsers();
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return jsonResponse({
        ok: true,
        backend: true,
        authenticated: false,
        setupRequired: userCount === 0
      });
    }

    const snapshot = await getSnapshot();
    const accessOnly = auth.user.role === ACCESS_MANAGER_ROLE;
    const logs = accessOnly ? [] : await listAuditLogs(100);

    return jsonResponse({
      ok: true,
      backend: true,
      authenticated: true,
      setupRequired: userCount === 0,
      session: auth.session,
      user: auth.user,
      state: accessOnly ? buildAccessOnlyState(snapshot.state) : snapshot.state,
      logs,
      snapshotSource: snapshot.source,
      snapshotUpdatedAt: snapshot.updatedAt
    }, 200, {
      "set-cookie": auth.refreshCookie
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message,
      hint: "Si esta es la primera vez, ejecuta primero el esquema SQL y el script de usuarios."
    }, 500);
  }
}
