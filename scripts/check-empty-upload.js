async page => {
  const tab = await page.context().newPage();
  let requests = 0;
  await tab.route('**/api/**', async route => { requests++; await route.fulfill({ json: { ok: true } }); });
  try {
    await tab.goto('http://127.0.0.1:3210/');
    await tab.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([], 'empty.mp4', { type: 'video/mp4' }));
      document.getElementById('video-drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    });
    await tab.waitForFunction(() => !document.getElementById('video-status').textContent.includes('Checking'));
    await tab.locator('#phone').fill('12025550123');
    await tab.locator('#send').click();
    await tab.waitForFunction(() => !document.getElementById('fields').disabled);
    if (requests || !(await tab.locator('#video-status').textContent()).includes('empty')) throw new Error('Empty file was not blocked before sending');
    return 'PASS: zero-byte drag/drop rejected before any API request';
  } finally { await tab.close(); }
}
