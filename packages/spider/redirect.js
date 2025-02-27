const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    'headless': 'new'
  });
  const page = await browser.newPage();
  // await page.setRequestInterception(true);

  page.on('request', async r => {
    console.log(`=>  ${r.method()}  ${r.url()}`);
    if (r.resourceType() === 'document') {
      // console.log(`=>  ${r.method()}  ${r.url()}`);
    }

    const url = r.url();
    if (url.startsWith('https://link')) {
      // fake abort

      // await page.close();
      // const newPage = await browser.newPage();
    }

    // await r.continue();
  });
  page.on('response', r => {
    if (r.request().resourceType() === 'document') {
      const is3xx = 300 <= r.status() && r.status() < 400;
      const location = is3xx? r.headers()['location'] : '';
      console.log(`<=  ${r.status()}  ${location} <- ${r.request().url()} `);
    }
  });
  const url = 'https://doi.org/10.1007/s10723-013-9263-6';
  await page.goto(url);
  await browser.close();
})();
