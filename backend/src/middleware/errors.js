export function notFound(req, res) {
  res.status(404).json({ error: 'Route nicht gefunden.' });
}

export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({
    error: error.publicMessage || error.message || 'Unerwarteter Fehler.'
  });
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}
