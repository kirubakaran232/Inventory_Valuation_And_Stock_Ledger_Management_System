async function request(path, options) {
  const response = await fetch(`/api/v1${path}`, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `The API returned an invalid response (${response.status}). Check that the backend is running.`,
    );
  }
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);
  return data;
}
const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
export const getLedger = (query) =>
  request(`/reports/valuation?${new URLSearchParams(Object.entries(query).filter(([, v]) => v))}`);
export const postTransaction = (body) => post('/transactions', body);
export const createMaster = (type, body) =>
  post(`/${type}`, Object.fromEntries(Object.entries(body).filter(([, value]) => value !== '')));
export const updateMaster = (type, id, body) =>
  request(`/${type}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
export const deleteMaster = (type, id) => request(`/${type}/${id}`, { method: 'DELETE' });
