// A QR place deleted while a vote or a step of the guest page was on its way: the write waits for
// the deletion and then finds no place to point at. It goes through once more without the place,
// and from then on stands under the short name, as the notice before the deletion says. The
// answer names the place that was written, so the numbers follow the same one.
export function placeGone(error) {
  return error?.code === '23503' && /qr_source/.test(`${error.constraint || ''} ${error.detail || ''} ${error.message || ''}`);
}

export async function withoutGonePlace(qrSource, write) {
  if (!qrSource) return { qrSource: null, result: await write(null) };
  try {
    return { qrSource, result: await write(qrSource) };
  } catch (error) {
    if (!placeGone(error)) throw error;
    return { qrSource: null, result: await write(null) };
  }
}
