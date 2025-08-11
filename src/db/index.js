import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbFile = process.env.DATABASE_FILE || './phones.db';

const dir = path.dirname(dbFile);
if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbFile);

db.exec(`
CREATE TABLE IF NOT EXISTS phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  brandValue TEXT,
  modelValue TEXT,
  yearValue TEXT,
  customId TEXT,

  networkTechnology TEXT,
  network2GBands TEXT,
  network3GBands TEXT,
  network4GBands TEXT,
  network5GBands TEXT,
  networkSpeed TEXT,

  launchAnnounced TEXT,
  launchStatus TEXT,

  bodyDimensions TEXT,
  bodyWeight TEXT,
  bodySim TEXT,
  bodyBuild TEXT,
  bodyOther1 TEXT,

  displayType TEXT,
  displaySize TEXT,
  displayResolution TEXT,
  displayProtection TEXT,
  displayOther1 TEXT,
  displayOther2 TEXT,

  platformChipset TEXT,
  platformCpu TEXT,
  platformGpu TEXT,
  platformOs TEXT,

  memoryCardSlot TEXT,
  memoryInternal TEXT,
  memoryOther1 TEXT,

  mainCameraFeatures TEXT,
  mainCameraTriple TEXT,
  mainCameraVideo TEXT,

  selfieCameraFeatures TEXT,
  selfieCameraSingle TEXT,
  selfieCameraVideo TEXT,

  sound35MmJack TEXT,
  soundLoudspeaker TEXT,
  soundOther1 TEXT,
  soundOther2 TEXT,

  communicationsBluetooth TEXT,
  communicationsNfc TEXT,
  communicationsPositioning TEXT,
  communicationsRadio TEXT,
  communicationsUsb TEXT,
  communicationsWlan TEXT,

  featuresOther1 TEXT,
  featuresOther2 TEXT,
  featuresOther3 TEXT,
  featuresOther4 TEXT,

  batteryCharging TEXT,
  batteryType TEXT,

  miscColors TEXT,
  miscModels TEXT,
  miscPrice TEXT,
  miscSar TEXT,
  miscSarEu TEXT,

  testsPerformance TEXT,
  testsDisplay TEXT,
  testsCamera TEXT,
  testsLoudspeaker TEXT,
  testsBatteryLife TEXT,

  articleImage TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

export function upsertPhone(slug, data) {
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.map(c => `${c} = excluded.${c}`).join(', ');

  const stmt = db.prepare(`
    INSERT INTO phones (slug, ${cols.join(', ')})
    VALUES (?, ${placeholders})
    ON CONFLICT(slug) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(slug, ...cols.map(c => data[c]));
}

export function getAllPhones() {
  return db.prepare('SELECT * FROM phones ORDER BY id DESC').all();
}

export default db;
