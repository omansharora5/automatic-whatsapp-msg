export function validateBundle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object.');
  const phone = String(input.phone ?? '').replace(/[\s()+-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Use an international phone number including country code, e.g. +91 followed by 10 digits.');
  const steps = [];
  const common = { session: 'default', chatId: `${phone}@c.us` };
  if (input.text !== undefined && typeof input.text !== 'string') throw new Error('Text must be a string.');
  if (input.text?.trim()) {
    if (input.text.length > 10000) throw new Error('Text exceeds 10,000 characters.');
    steps.push({ type: 'text', path: '/api/sendText', body: { ...common, text: input.text } });
  }
  if (input.video) {
    const { data, filename = 'video.mp4', caption = '' } = input.video;
    if (input.video.convert !== undefined && typeof input.video.convert !== 'boolean') throw new Error('video.convert must be a boolean.');
    if (!data) throw new Error('The video is empty. Save the complete video locally and select it again.');
    if (typeof data !== 'string' || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Video upload is invalid. Select the local video file again.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > 12 * 1024 * 1024) throw new Error('Video exceeds the app limit of 12 MB.');
    if (typeof filename !== 'string' || !/\.(mp4|mov|webm|mkv|avi)$/i.test(filename) || filename.length > 255) throw new Error('Choose an MP4, MOV, WebM, MKV, or AVI file.');
    const isMp4 = /\.mp4$/i.test(filename) && bytes.toString('ascii', 4, 8) === 'ftyp';
    if (typeof caption !== 'string' || caption.length > 2000) throw new Error('Video caption must be under 2,000 characters.');
    steps.push({ type: 'video', path: '/api/sendVideo', body: { ...common, caption, asNote: false, convert: !isMp4 || (input.video.convert ?? true), file: { mimetype: 'video/mp4', filename: 'video.mp4', data } } });
  }
  if (input.location) {
    const { latitude, longitude, title = '' } = input.location;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Location needs numeric latitude (-90 to 90) and longitude (-180 to 180).');
    if (typeof title !== 'string' || title.length > 200) throw new Error('Location title must be under 200 characters.');
    steps.push({ type: 'location', path: '/api/sendLocation', body: { ...common, latitude, longitude, title } });
  }
  if (!steps.length) throw new Error('Add text, a video, or a location.');
  return steps;
}

export async function sendBundle(steps, request, prepare = async step => ({ body: step.body })) {
  steps = [...steps.filter(step => step.type !== 'video'), ...steps.filter(step => step.type === 'video')];
  // Start encoding immediately. Capture rejection immediately too, since other
  // messages may still be in flight when conversion fails.
  const preparations = new Map(steps.filter(step => step.type === 'video').map(step => {
    const started = performance.now();
    const promise = Promise.resolve().then(() => prepare(step)).then(
      value => ({ value, prepareMs: Math.round(performance.now() - started) }),
      error => ({ error }),
    );
    return [step, promise];
  }));
  const results = [];
  for (const step of steps) {
    let attempted = false;
    const started = performance.now();
    try {
      const preparation = preparations.has(step) ? await preparations.get(step) : { value: await prepare(step), prepareMs: Math.round(performance.now() - started) };
      if (preparation.error) throw preparation.error;
      const prepared = preparation.value;
      const prepareMs = preparation.prepareMs;
      const requestStart = performance.now();
      attempted = true;
      const response = await request(step.path, 'POST', prepared.body);
      results.push({ type: step.type, status: 'accepted', id: response?.id ?? null, prepareMs, requestMs: Math.round(performance.now() - requestStart), cacheHit: prepared.cacheHit, videoBytes: prepared.videoBytes });
    } catch (error) {
      results.push({ type: step.type, status: attempted ? 'failed-or-unknown' : 'failed-before-send', error: error.message, elapsedMs: Math.round(performance.now() - started) });
      for (const pending of steps.slice(results.length)) results.push({ type: pending.type, status: 'not-attempted' });
      return { ok: false, results, note: 'Stopped after error. Check WhatsApp before retrying; a timed-out request may still have sent.' };
    }
  }
  return { ok: true, results, note: 'WAHA accepted the messages. This is not a delivery or read receipt.' };
}
