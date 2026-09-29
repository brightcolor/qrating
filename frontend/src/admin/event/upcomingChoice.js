// The upcoming events a guest sees after the feedback, picked by hand. The server takes as many as
// its setting allows; at that limit an event comes in only once another one goes out.
export function toggleUpcoming(ids, id, max) {
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  if (upcomingFull(ids, max)) return ids;
  return [...ids, id];
}

export function upcomingFull(ids, max) {
  return Boolean(max) && ids.length >= max;
}
