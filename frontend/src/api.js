export const BASE_URL = "http://localhost:8000";

// Small wrapper: throws on network failure or non-2xx so the UI can show an error
async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const getStats = () => request("/stats");
export const getRules = () => request("/rules");

// status is "pending" | "reviewed" | "cleared", or "all" for no filter
export const getFlagged = (status = "all") =>
  request(status === "all" ? "/flagged" : `/flagged?status=${status}`);

export const updateStatus = (id, status) =>
  request(`/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
