async page => {
  const tab = await page.context().newPage();
  let sent;
  await tab.addInitScript(() => {
    const create = document.createElement.bind(document);
    document.createElement = function(name, options) {
      const element = create(name, options);
      if (name === 'video') Object.defineProperty(element, 'src', { set() { queueMicrotask(() => element.onerror?.(new Event('error'))); } });
      return element;
    };
  });
  await tab.route('**/api/**', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, results: [], note: 'Mock codec test' } });
  });
  try {
    await tab.goto('http://127.0.0.1:3210/');
    await tab.locator('#prepare-video').uncheck();
    await tab.locator('#video').setInputFiles('examples/demo-10s.mp4');
    await tab.waitForFunction(() => !document.getElementById('video-status').textContent.includes('Checking'));
    await tab.locator('#phone').fill('12025550123');
    await tab.locator('#send').click();
    await tab.waitForFunction(() => !document.getElementById('fields').disabled);
    if (!sent?.video?.data || sent.video.convert !== true) throw new Error('Browser decoder failure blocks video or fails to enable server conversion');
    return 'PASS: browser decoder failure still submits video with server conversion. No WhatsApp message sent.';
  } finally { await tab.close(); }
}
