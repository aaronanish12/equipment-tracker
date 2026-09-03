-- Equipment Tracker DB Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- e.g. 'SITE-B'
  name TEXT NOT NULL,               -- e.g. 'Baneshwor Tower Project'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,       -- WhatsApp number in E.164 format, e.g. '9779812345678'
  name TEXT NOT NULL,
  role TEXT DEFAULT 'engineer',     -- 'engineer' | 'supervisor' | 'admin'
  site_id INTEGER REFERENCES sites(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- e.g. 'JH-04'
  name TEXT NOT NULL,               -- e.g. 'Jackhammer 04'
  type TEXT,                        -- e.g. 'Jackhammer', 'Grinder', 'Prop'
  status TEXT DEFAULT 'free',       -- 'free' | 'busy' | 'repair' | 'lost'
  current_site_id INTEGER REFERENCES sites(id),
  assigned_to INTEGER REFERENCES users(id),
  last_updated_by INTEGER REFERENCES users(id),
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_log (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER REFERENCES equipment(id),
  site_id INTEGER REFERENCES sites(id),
  status TEXT NOT NULL,
  note TEXT,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_code ON equipment(code);
CREATE INDEX IF NOT EXISTS idx_equipment_site ON equipment(current_site_id);
CREATE INDEX IF NOT EXISTS idx_status_log_equipment ON status_log(equipment_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
