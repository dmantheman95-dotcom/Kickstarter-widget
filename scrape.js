const puppeteer = require('puppeteer');
const fs = require('fs');

const CAMPAIGN_URL = 'https://www.kickstarter.com/projects/kalatime/kala-watches-series-001';

// Same pattern list as the desktop widget. Backers checked first so that
// once the campaign is live, it takes priority over any lingering
// "followers" text elsewhere on the page.
const BACKER_PATTERNS = [
  /([\d][\d,]*)\s*backers?\b/i,
  /backed by\s*([\d][\d,]*)/i,
];

const FOLLOWER_PATTERNS = [
  /([\d][\d,]*)\s*followers?\b/i,
  /([\d][\d,]*)\s*people (?:are )?following/i,
  /([\d][\d,]*)\s*people (?:are )?interested/i,
  /([\d][\d,]*)\s*people like this/i,
];

function tryPatterns(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/,/g, '');
  }
  return null;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    );
    await page.goto(CAMPAIGN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Let client-side rendering settle.
    await new Promise((r) => setTimeout(r, 2500));

    const text = await page.evaluate(() => document.body.innerText);

    const backers = tryPatterns(text, BACKER_PATTERNS);
    const followers = tryPatterns(text, FOLLOWER_PATTERNS);

    let result;
    if (backers) {
      result = { value: Number(backers), label: 'Backers', status: 'ok' };
    } else if (followers) {
      result = { value: Number(followers), label: 'Followers', status: 'ok' };
    } else {
      result = { value: null, label: 'No match', status: 'nomatch' };
      fs.writeFileSync('debug.log', text);
    }

    result.updatedAt = new Date().toISOString();
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.log('Wrote data.json:', result);
  } catch (err) {
    const result = {
      value: null,
      label: 'Error',
      status: 'error',
      error: err.message,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.error('Scrape failed:', err.message);
  } finally {
    await browser.close();
  }
})();
