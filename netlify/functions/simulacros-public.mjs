import { getSnapshot } from "./shared/snapshot.mjs";
import { jsonResponse, methodNotAllowed } from "./shared/http.mjs";

function normalizeSimulationType(value) {
  const text = String(value || "Primer simulacro").toLowerCase();
  if (text.includes("tercer") || text.includes("3")) {
    return "Tercer simulacro";
  }
  if (text.includes("segundo") || text.includes("2")) {
    return "Segundo simulacro";
  }
  return "Primer simulacro";
}

function buildRanking(items, simulationType) {
  return items
    .filter((item) => normalizeSimulationType(item.simulationType) === normalizeSimulationType(simulationType))
    .sort((left, right) => Number(right.totalScore || 0) - Number(left.totalScore || 0))
    .map((item, index) => ({
      ...item,
      simulationType: normalizeSimulationType(item.simulationType),
      position: index + 1
    }));
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  try {
    const url = new URL(request.url);
    const dni = String(url.searchParams.get("dni") || "").trim();
    const simulationType = String(url.searchParams.get("simulationType") || "Todas").trim();
    const snapshot = await getSnapshot();
    const state = snapshot.state || {};
    const simulations = Array.isArray(state.simulations) ? state.simulations : [];

    if (!dni) {
      return jsonResponse({
        ok: true,
        schoolName: state.school?.name || "Colegio Privado Roosevelt",
        results: [],
        topThree: [],
        simulationTypeApplied: ""
      });
    }

    const ranked = ["Primer simulacro", "Segundo simulacro", "Tercer simulacro"]
      .flatMap((type) => buildRanking(simulations, type));

    const results = ranked
      .filter((item) => item.dni === dni && (simulationType === "Todas" || normalizeSimulationType(item.simulationType) === normalizeSimulationType(simulationType)))
      .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));

    const simulationTypeApplied = simulationType === "Todas"
      ? (results[0]?.simulationType || "")
      : normalizeSimulationType(simulationType);
    const topThree = simulationTypeApplied
      ? buildRanking(simulations, simulationTypeApplied).slice(0, 3)
      : [];

    return jsonResponse({
      ok: true,
      schoolName: state.school?.name || "Colegio Privado Roosevelt",
      results,
      topThree,
      simulationTypeApplied
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message,
      hint: "No se pudo consultar los simulacros publicos."
    }, 500);
  }
}
