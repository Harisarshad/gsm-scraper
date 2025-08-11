import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import got from 'got';

import fs from 'fs/promises';
const BASE_URL = process.env.BASE_URL || 'https://www.gsmarena.com';
const DELAY = Number(process.env.SCRAPER_DELAY_MS || 800);
const BULK_DELAY = Number(process.env.SCRAPER_BULK_DELAY_MS || 1200);
const UA = process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; PhoneSpecsBot/1.0)';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function makeBrowser() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 800 }
  });
  const page = await ctx.newPage();
  return { browser, page };
}

const client = got.extend({
  prefixUrl: 'https://www.gsmarena.com',
  http2: true,
  timeout: { request: 15000 },
  retry: { limit: 1 },
  headers: {
    // Browser-like headers
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    // A benign cookie sometimes helps avoid “first-visit” walls
    'Cookie': 'visited=1;'
  }
});
// /** Get all brands from makers page */
// export async function getBrands() {
//   const { browser, page } = await makeBrowser();
//   try {
//     const url = `${BASE_URL}/makers.php3`;
//     await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
//     await sleep(DELAY);

//     const html = await page.content();
//     const $ = cheerio.load(html);

//     const brands = [];
//     $('table.makers a').each((_, el) => {
//       const href = $(el).attr('href'); // e.g. "samsung-phones-6.php"
//       const name = $(el).find('strong span').first().text().trim() || $(el).find('strong').text().trim();
//       const count = $(el).find('span').not('strong span').last().text().trim();
//       if (href && name) {
//         brands.push({
//           name,
//           count,
//           slug: href,
//           url: `${BASE_URL}/${href}`
//         });
//       }
//     });
//     return brands;
//   } finally {
//     await page.context().close();
//     await browser.close();
//   }
// }
export async function getBrands() {
  const res = await client.get('makers.php3');
  const html = res.body || '';
  const $ = cheerio.load(html);

  // If you got blocked, the title often says things like "Just a moment..." or "Attention Required!"
  const pageTitle = ($('title').text() || '').trim();

  const brands = [];
  // Updated GSMArena structure:
  // <div class="st-text"><table> ... <a href="samsung-phones-9.php">Samsung<br><span>...</span></a>
  $('.st-text table a').each((_, a) => {
    const href = $(a).attr('href'); // e.g., "samsung-phones-9.php"
    const name = $(a).contents().filter(function() { return this.type === 'text'; }).text().trim();
    const count = $(a).find('span').text().trim();
    if (href && name) {
      const slug = href.replace(/\.php$/, '');
      brands.push({ name, slug, count });
    }
  });

  if (!brands.length) {
    // Dump what we actually received so you can inspect it
    await fs.writeFile('debug-makers.html', html);
    console.warn('GSMArena parsing returned 0 brands.');
    console.warn('Saved the fetched HTML to debug-makers.html for inspection.');
    console.warn('Page title:', pageTitle);
  }

  return brands;
}
/** Get models list for a brand (with pagination support via page index) */
export async function getBrandModels(brandSlug, pageIndex = 1) {
  const { browser, page } = await makeBrowser();
  try {
    const url = `${BASE_URL}/${brandSlug}${pageIndex > 1 ? `-f-9-0-p${pageIndex}` : ''}.php`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(DELAY);

    const html = await page.content();
    await fs.writeFile('debug-brand-models.html', html);
    const $ = cheerio.load(html);

    // Extract models
    const models = [];
    $('.general-menu ul li a').each((_, a) => {
      const href = $(a).attr('href');
      const title = $(a).find('strong').text().trim();
      const img = $(a).find('img').attr('src');
      if (href && title) {
        models.push({
          title,
          slug: href,
          url: `${BASE_URL}/${href}`,
          image: img ? (img.startsWith('http') ? img : `${BASE_URL}/${img}`) : null
        });
      }
    });

    // Pagination: find next page link
    let hasNext = false;
    let nextPage = null;
    $('#nav-review-page-temp a').each((_, el) => {
      const $el = $(el);
      if ($el.hasClass('prevnextbutton') && !$el.hasClass('disabled') && $el.find('.icon-gallery-arrow-right').length) {
        hasNext = true;
        const href = $el.attr('href');
        // Extract page number from href, fallback to pageIndex+1
        const match = href && href.match(/p(\d+)\.php/);
        nextPage = match ? parseInt(match[1], 10) : pageIndex + 1;
      }
    });

    return { pageUrl: url, models, hasNext, nextPage };
  } finally {
    await page.context().close();
    await browser.close();
  }
}

/** Scrape phone page and map to target schema */
export async function getPhoneDetails(phoneSlug) {
  const { browser, page } = await makeBrowser();
  try {
    const url = `${BASE_URL}/${phoneSlug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(DELAY);

    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $('h1.specs-phone-name-title').first().text().trim();
    const imageUrl = $('#specs-cp img').first().attr('src') || null;

    const sections = {};
    $('#specs-list table').each((_, table) => {
      const sectionName = $(table).find('th').first().text().trim();
      const rows = {};
      $(table).find('tr').each((_, tr) => {
        const k = $(tr).find('td.ttl').text().trim();
        const v = $(tr).find('td.nfo').text().trim();
        if (k && v) rows[k] = v;
      });
      if (sectionName) sections[sectionName] = rows;
    });

    const get = (sect, label) => (sections[sect] && sections[sect][label]) ? sections[sect][label] : null;

    let yearValue = null;
    const announced = get('Launch', 'Announced');
    if (announced) {
      const m = announced.match(/\b(19|20)\d{2}\b/);
      if (m) yearValue = m[0];
    }

    const brandValue = title ? title.split(' ')[0] : null;
    const modelValue = title || null;

    const data = {
      yearValue,
      brandValue,
      modelValue,

      networkTechnology: get('Network', 'Technology'),
      network2GBands: get('Network', '2G bands'),
      network3GBands: get('Network', '3G bands'),
      network4GBands: get('Network', '4G bands'),
      network5GBands: get('Network', '5G bands'),
      networkSpeed: get('Network', 'Speed'),

      launchAnnounced: announced,
      launchStatus: get('Launch', 'Status'),

      bodyDimensions: get('Body', 'Dimensions'),
      bodyWeight: get('Body', 'Weight'),
      bodySim: get('Body', 'SIM'),
      bodyBuild: get('Body', 'Build'),
      bodyOther1: get('Body', 'Others'),

      displayType: get('Display', 'Type'),
      displaySize: get('Display', 'Size'),
      displayResolution: get('Display', 'Resolution'),
      displayProtection: get('Display', 'Protection'),
      displayOther1: get('Display', 'Features') || get('Display', 'Others'),
      displayOther2: null,

      platformChipset: get('Platform', 'Chipset'),
      platformCpu: get('Platform', 'CPU'),
      platformGpu: get('Platform', 'GPU'),
      platformOs: get('Platform', 'OS'),

      memoryCardSlot: get('Memory', 'Card slot'),
      memoryInternal: get('Memory', 'Internal'),
      memoryOther1: get('Memory', 'Others'),

      mainCameraFeatures: get('Main Camera', 'Features'),
      mainCameraTriple: get('Main Camera', 'Triple') || get('Main Camera', 'Quad') || get('Main Camera', 'Single') || get('Main Camera', 'Dual'),
      mainCameraVideo: get('Main Camera', 'Video'),

      selfieCameraFeatures: get('Selfie camera', 'Features'),
      selfieCameraSingle: get('Selfie camera', 'Single') || get('Selfie camera', 'Dual'),
      selfieCameraVideo: get('Selfie camera', 'Video'),

      sound35MmJack: get('Sound', '3.5mm jack'),
      soundLoudspeaker: get('Sound', 'Loudspeaker'),
      soundOther1: get('Sound', 'Others'),
      soundOther2: null,

      communicationsBluetooth: get('Comms', 'Bluetooth'),
      communicationsNfc: get('Comms', 'NFC'),
      communicationsPositioning: get('Comms', 'Positioning') || get('Comms', 'GPS'),
      communicationsRadio: get('Comms', 'Radio'),
      communicationsUsb: get('Comms', 'USB'),
      communicationsWlan: get('Comms', 'WLAN'),

      featuresOther1: get('Features', 'Sensors'),
      featuresOther2: null,
      featuresOther3: null,
      featuresOther4: null,

      batteryCharging: get('Battery', 'Charging'),
      batteryType: get('Battery', 'Type'),

      miscColors: get('Misc', 'Colors'),
      miscModels: get('Misc', 'Models'),
      miscPrice: get('Misc', 'Price'),
      miscSar: get('Misc', 'SAR'),
      miscSarEu: get('Misc', 'SAR EU'),

      testsPerformance: get('Tests', 'Performance'),
      testsDisplay: get('Tests', 'Display'),
      testsCamera: get('Tests', 'Camera'),
      testsLoudspeaker: get('Tests', 'Loudspeaker'),
      testsBatteryLife: get('Tests', 'Battery life'),

      articleImage: imageUrl
    };

    return { url, title, data };
  } finally {
    await page.context().close();
    await browser.close();
  }
}

/** Bulk insert all models for a brand, with callbacks for progress */
export async function bulkInsertByBrand(brandSlug, insertFn, onProgress = () => {}) {
  let pageIndex = 1;
  let totalInserted = 0;
  let totalModels = 0;

  while (true) {
    const { models, hasNext } = await getBrandModels(brandSlug, pageIndex);
    totalModels += models.length;

    for (let i = 0; i < models.length; i++) {
      const m = models[i];
      try {
        const { data } = await getPhoneDetails(m.slug);
        insertFn(m.slug, data);
        totalInserted++;
        onProgress({ page: pageIndex, indexOnPage: i+1, totalInserted, currentSlug: m.slug, title: m.title });
        await sleep(BULK_DELAY);
      } catch (e) {
        onProgress({ page: pageIndex, indexOnPage: i+1, error: e.message, currentSlug: m.slug, title: m.title });
      }
    }

    if (!hasNext) break;
    pageIndex++;
    await sleep(DELAY);
  }

  return { totalInserted, totalModels };
}
