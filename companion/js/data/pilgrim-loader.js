export class DataNotFoundError extends Error {}

export async function loadPilgrim(pilgrimId) {
  const res = await fetch(`data/pilgrims/${pilgrimId}.json`, { cache: 'no-cache' });
  if (res.status === 404) throw new DataNotFoundError(`Peregrino "${pilgrimId}" no encontrado`);
  if (!res.ok) throw new Error(`Error cargando peregrino "${pilgrimId}": ${res.status}`);
  return res.json();
}
