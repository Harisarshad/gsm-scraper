import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import expressLayouts from 'express-ejs-layouts';
import { getBrands, getBrandModels, getPhoneDetails, bulkInsertByBrand } from './scraper/gsmarena.js';
import { upsertPhone, getAllPhones } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/brands'));

// Brands page
app.get('/brands', async (req, res, next) => {
  try {
    const brands = await getBrands();
        console.log('brands count:', brands?.length, brands?.slice(0, 3));

    res.render('brands', { brands, title: 'Brands' });
  } catch (e) {
    next(e);
  }
});

// Models by brand
app.get('/brands/:brandSlug', async (req, res, next) => {
  try {
    const brandSlug = req.params.brandSlug;
    const pageIndex = Number(req.query.page || 1);
    const { models, hasNext } = await getBrandModels(brandSlug, pageIndex);
    const brandName = decodeURIComponent(brandSlug.split('-phones-')[0]).replace(/_/g, ' ');
    res.render('models', {
      brandName,
      brandSlug,
      models,
      pageIndex,
      hasNext,
      title: `${brandName} — Models`
    });
  } catch (e) {
    next(e);
  }
});

// Insert one phone
app.get('/phones/insert/:phoneSlug', async (req, res, next) => {
  try {
    const phoneSlug = req.params.phoneSlug;
    const { data } = await getPhoneDetails(phoneSlug);
    upsertPhone(phoneSlug, data);
    res.redirect('/saved');
  } catch (e) {
    next(e);
  }
});

// Bulk insert helper page (optional)
app.get('/brands/:brandSlug/bulk', (req, res) => {
  // Just redirect to /brands where the SSE UI is present
  res.redirect('/brands');
});

// SSE: bulk insert by brand
app.get('/brands/:brandSlug/bulk/stream', async (req, res) => {
  const brandSlug = req.params.brandSlug;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  send({ started: true, brandSlug });

  let keepAliveInterval = setInterval(() => send({ keepalive: true }), 25000);

  try {
    await bulkInsertByBrand(brandSlug, (slug, data) => {
      upsertPhone(slug, data);
    }, (progress) => {
      send(progress);
    });

    send({ page: 'all', done: true, totalInserted: getAllPhones().length, totalModels: 'unknown' });
  } catch (err) {
    send({ error: err.message || 'Bulk job failed.' });
  } finally {
    clearInterval(keepAliveInterval);
    res.end();
  }
});

// Saved list
app.get('/saved', (req, res) => {
  const phones = getAllPhones();
  res.render('saved', { phones, title: 'Saved Phones' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(`<pre>${err.message}\n\n${err.stack}</pre>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
