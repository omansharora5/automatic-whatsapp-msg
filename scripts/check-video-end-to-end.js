async page => {
  const tab = await page.context().newPage();
  try {
    await tab.goto('http://127.0.0.1:3215/');
    await tab.locator('#key').fill('video-test-key');
    await tab.locator('#phone').fill('12025550123');
    await tab.locator('#text').fill('Local integration test');
    await tab.locator('#include-location').check();
    await tab.locator('#latitude').fill('0');
    await tab.locator('#longitude').fill('0');
    const results = [];
    for (const file of ['examples/demo-10s.mp4', 'examples/demo-1s.webm']) {
      await tab.locator('#video').setInputFiles(file);
      await tab.waitForFunction(() => /Ready to send|Selected\./.test(document.getElementById('video-status').textContent));
      await tab.locator('#send').click();
      await tab.waitForFunction(() => !document.getElementById('fields').disabled, { timeout: 90000 });
      const result = JSON.parse(await tab.locator('#result').textContent());
      if (!result.ok || result.results.map(x => x.type).join(',') !== 'text,location,video') throw new Error('End-to-end video failed: ' + JSON.stringify(result));
      results.push({ file, statuses: result.results.map(x => x.status), videoBytes: result.results[2].videoBytes });
    }
    return results;
  } finally { await tab.close(); }
}
