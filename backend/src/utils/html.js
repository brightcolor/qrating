// Shared escaping for the few HTML pages the API renders itself
// (error pages, QR print sheets). Everything that comes from admins,
// guests or the Pretix sync goes through this before it reaches a page.
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
