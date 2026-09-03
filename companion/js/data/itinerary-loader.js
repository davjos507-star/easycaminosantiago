import { DataNotFoundError } from './pilgrim-loader.js';

export async function loadItinerary(itineraryId) {
  const res = await fetch(`data/itineraries/${itineraryId}.json`, { cache: 'no-cache' });
  if (res.status === 404) throw new DataNotFoundError(`Itinerario "${itineraryId}" no encontrado`);
  if (!res.ok) throw new Error(`Error cargando itinerario "${itineraryId}": ${res.status}`);
  return res.json();
}

export async function loadStage(stagePath) {
  const res = await fetch(`data/${stagePath}`, { cache: 'no-cache' });
  if (res.status === 404) throw new DataNotFoundError(`Etapa "${stagePath}" no encontrada`);
  if (!res.ok) throw new Error(`Error cargando etapa "${stagePath}": ${res.status}`);
  return res.json();
}

export async function loadAllStages(itinerary) {
  return Promise.all(itinerary.stages.map((entry) => loadStage(entry.path)));
}
