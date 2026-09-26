async page => {
  const tab = await page.context().newPage();
  let sent;
  await tab.route('**/api/**', async route => {
    if (route.request().url().endsWith('/api/send')) sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, results: [], note: 'Mock only' } });
  });
  try {
    await tab.goto('http://127.0.0.1:3210/');
    await tab.locator('#video').setInputFiles('examples/demo-10s.mp4');
    await tab.waitForFunction(() => document.getElementById('video-status').textContent.includes('Ready to send'));
    await tab.waitForFunction(() => document.getElementById('video-preview').readyState >= 2);
    await tab.evaluate(() => {
      window.testClip = document.getElementById('video').files[0];
    });
    await tab.locator('#remove-video').click();
    if (await tab.locator('#video-preview').isVisible()) throw new Error('Remove failed');
    await tab.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(window.testClip);
      document.getElementById('video-drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await tab.waitForFunction(() => document.getElementById('video-status').textContent.includes('Ready to send'));
    await tab.locator('#phone').fill('12025550123');
    await tab.locator('#send').click();
    await tab.waitForFunction(() => document.getElementById('result').textContent.includes('Mock only'));
    if (!sent?.video?.data || sent.video.filename !== 'video.mp4') throw new Error('Video absent from send payload');
    await tab.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['invalid'], 'bad.txt', { type: 'text/plain' }));
      const input = document.getElementById('video');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    });
    await tab.waitForFunction(() => document.getElementById('video-status').textContent.includes('Choose an MP4'));
    sent = undefined;
    await tab.locator('#send').click();
    await tab.waitForFunction(() => document.getElementById('result').textContent.includes('Choose an MP4'));
    if (sent) throw new Error('Invalid selection sent');
    return 'PASS: file selection, playable preview, remove, drag/drop, mocked video send, invalid-file blocking. No external messages sent.';
  } finally { await tab.close(); }
}
