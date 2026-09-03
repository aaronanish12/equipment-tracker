const db = require('./db');

const HELP_TEXT = `*Equipment Tracker — how to use*

*Update equipment:*
  "JH-04 is at Site B"
  "JH-04 busy at Site B"
  "JH-04 is free" / "JH-04 done"
  "JH-04 needs repair, leaking oil"

*Check equipment:*
  "where is JH-04" / "where's JH-04"
  "what's at Site B"
  "what's free" / "what's busy" / "what's in repair"

*Add things (admins only):*
  "add equipment JH-05, Jackhammer 05"
  "add site SITE-C, Pokhara Housing Project"
  "add engineer Ram Thapa, 9779812345678, Site C"
  "add supervisor Sita Gurung, 9779811112222, Site C"

Send HELP anytime to see this again.`;

async function getUserByPhone(phone) {
  const r = await db.query('SELECT * FROM users WHERE phone = $1 AND active = true', [phone]);
  return r.rows[0] || null;
}

async function getEquipmentByCode(code) {
  const r = await db.query(
    `SELECT e.*, s.code AS site_code, s.name AS site_name
     FROM equipment e LEFT JOIN sites s ON e.current_site_id = s.id
     WHERE UPPER(e.code) = UPPER($1)`,
    [code]
  );
  return r.rows[0] || null;
}

async function getSiteByCode(code) {
  const r = await db.query('SELECT * FROM sites WHERE UPPER(code) = UPPER($1)', [code]);
  return r.rows[0] || null;
}

async function logStatus(equipmentId, siteId, status, note, userId) {
  await db.query(
    `INSERT INTO status_log (equipment_id, site_id, status, note, updated_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [equipmentId, siteId, status, note || null, userId]
  );
}

// Helper: pull the first "code-looking" token out of a sentence, e.g.
// "JH-04" out of "where is JH-04 right now". Codes are letters/digits/dashes,
// at least 2 chars, containing at least one digit or dash so we don't
// accidentally grab ordinary words like "is" or "at".
function extractCode(text) {
  const tokens = text.split(/\s+/);
  for (const t of tokens) {
    const clean = t.replace(/[.,!?]+$/, '');
    if (/^[A-Za-z0-9-]{2,}$/.test(clean) && /[0-9-]/.test(clean)) {
      return clean;
    }
  }
  return null;
}

async function handleMessage(fromPhone, rawText) {
  const text = (rawText || '').trim();
  if (!text) return "Sorry, I didn't get that. Send HELP for how to use this.";

  const user = await getUserByPhone(fromPhone);
  if (!user) {
    return "Your number isn't registered yet. Ask your admin to add you, e.g. \"add engineer Your Name, your number, your site\".";
  }

  const lower = text.toLowerCase();

  if (lower === 'help' || lower === 'commands' || lower === 'menu') return HELP_TEXT;

  // ---- ADD commands (admin only), e.g.:
  // "add equipment JH-05, Jackhammer 05"
  // "add site SITE-C, Pokhara Housing Project"
  // "add engineer Ram Thapa, 9779812345678, Site C"
  const addMatch = lower.match(/^add\s+(equipment|site|engineer|supervisor|admin)\s+(.*)/i);
  if (addMatch) {
    if (user.role !== 'admin') return "Sorry, only admins can add new equipment, sites, or people.";
    const kind = addMatch[1].toLowerCase();
    // Recover original casing for the rest of the sentence
    const rest = text.slice(text.toLowerCase().indexOf(kind) + kind.length).trim();
    return handleAdd(kind, rest);
  }

  // ---- WHERE / STATUS check, e.g. "where is JH-04", "status of JH-04", "JH-04?"
  if (/^(where('?s| is)?|status( of)?)\b/i.test(text) || /^\S+\?$/.test(text)) {
    const code = extractCode(text);
    if (!code) return 'Which item? e.g. "where is JH-04"';
    const eq = await getEquipmentByCode(code);
    if (!eq) return `I don't have anything called ${code}. Send HELP to see how to add it.`;
    return formatEquipment(eq);
  }

  // ---- "what's at Site B" / "what's free" / "what's busy" / "what's in repair"
  const whatsMatch = text.match(/^what'?s\s+(free|busy|in repair|repair|at\s+(\S+))/i);
  if (whatsMatch) {
    const kind = whatsMatch[1].toLowerCase();
    if (kind.startsWith('at ')) {
      const siteCode = whatsMatch[2];
      const site = await getSiteByCode(siteCode);
      if (!site) return `I don't know a site called ${siteCode}.`;
      const r = await db.query('SELECT * FROM equipment WHERE current_site_id = $1 ORDER BY code', [site.id]);
      if (r.rows.length === 0) return `Nothing is currently listed at ${site.code}.`;
      return `*At ${site.code} (${r.rows.length} items):*\n` + r.rows.map(e => `- ${e.code} (${e.name}) — ${e.status}`).join('\n');
    } else {
      const status = kind.includes('repair') ? 'repair' : kind;
      const r = await db.query(
        `SELECT e.*, s.code AS site_code FROM equipment e
         LEFT JOIN sites s ON e.current_site_id = s.id
         WHERE e.status = $1 ORDER BY e.code`,
        [status]
      );
      if (r.rows.length === 0) return `Nothing is currently marked ${status}.`;
      return `*${capitalize(status)} (${r.rows.length}):*\n` + r.rows.map(e => `- ${e.code} (${e.name})${e.site_code ? ' @ ' + e.site_code : ''}`).join('\n');
    }
  }

  // ---- Status updates: needs a code first.
  const code = extractCode(text);
  if (code) {
    const eq = await getEquipmentByCode(code);
    if (!eq) return `I don't have anything called ${code}. Send HELP to see how to add it.`;

    // free / done / available / back
    if (/\b(free|done|available|back|finished)\b/i.test(text)) {
      await db.query(
        `UPDATE equipment SET status='free', assigned_to=NULL, last_updated_by=$1, last_updated_at=now() WHERE id=$2`,
        [user.id, eq.id]
      );
      await logStatus(eq.id, eq.current_site_id, 'free', null, user.id);
      return `✅ ${eq.code} is now marked *free*.`;
    }

    // repair / broken / fix / down
    if (/\b(repair|broken|fix|fixing|down|not working)\b/i.test(text)) {
      const note = text.replace(new RegExp(code, 'i'), '').replace(/\b(needs?|is|repair|broken|fix(ing)?|down|not working)\b/gi, '').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
      await db.query(
        `UPDATE equipment SET status='repair', last_updated_by=$1, last_updated_at=now() WHERE id=$2`,
        [user.id, eq.id]
      );
      await logStatus(eq.id, eq.current_site_id, 'repair', note || null, user.id);
      return `🔧 ${eq.code} marked *under repair*.${note ? ' Note: ' + note : ''}`;
    }

    // busy / at <site> / to <site>
    const siteMatch = text.match(/\b(?:at|to|@)\s+(\S+)/i) || text.match(/\bbusy\s+(?:at\s+)?(\S+)/i);
    if (siteMatch || /\bbusy\b/i.test(text)) {
      const siteCode = siteMatch ? siteMatch[1].replace(/[.,!?]+$/, '') : null;
      if (!siteCode) return `Which site is ${eq.code} at? e.g. "${eq.code} is at Site B"`;
      const site = await getSiteByCode(siteCode);
      if (!site) return `I don't know a site called ${siteCode}. Ask an admin to add it first: "add site ${siteCode}, Full Site Name"`;
      await db.query(
        `UPDATE equipment SET status='busy', current_site_id=$1, assigned_to=$2, last_updated_by=$2, last_updated_at=now() WHERE id=$3`,
        [site.id, user.id, eq.id]
      );
      await logStatus(eq.id, site.id, 'busy', null, user.id);
      return `✅ ${eq.code} is now marked *busy* at ${site.code}.`;
    }
  }

  return "Sorry, I didn't quite catch that. Send HELP to see some examples.";
}

async function handleAdd(kind, rest) {
  const fields = rest.split(',').map(s => s.trim()).filter(Boolean);

  if (kind === 'equipment') {
    // "JH-05, Jackhammer 05" -> code, name (type = first word of name)
    const [code, name] = fields;
    if (!code || !name) return 'Try: "add equipment JH-05, Jackhammer 05" (code, then a name)';
    const type = name.split(/\s+/)[0];
    try {
      await db.query('INSERT INTO equipment (code, type, name) VALUES ($1,$2,$3)', [code, type, name]);
      return `✅ Added ${code} — ${name}.`;
    } catch (e) {
      return `Couldn't add that: ${e.message}`;
    }
  }

  if (kind === 'site') {
    const [code, name] = fields;
    if (!code || !name) return 'Try: "add site SITE-C, Pokhara Housing Project"';
    try {
      await db.query('INSERT INTO sites (code, name) VALUES ($1,$2)', [code, name]);
      return `✅ Added site ${code} — ${name}.`;
    } catch (e) {
      return `Couldn't add that: ${e.message}`;
    }
  }

  if (['engineer', 'supervisor', 'admin'].includes(kind)) {
    // "Ram Thapa, 9779812345678, Site C"
    const [name, phone, siteCode] = fields;
    if (!name || !phone) return `Try: "add ${kind} Ram Thapa, 9779812345678, Site C"`;
    const site = siteCode ? await getSiteByCode(siteCode) : null;
    try {
      await db.query(
        'INSERT INTO users (phone, name, role, site_id) VALUES ($1,$2,$3,$4)',
        [phone.replace(/\D/g, ''), name, kind, site ? site.id : null]
      );
      return `✅ Added ${name} as ${kind}${site ? ' at ' + site.code : ''}.`;
    } catch (e) {
      return `Couldn't add that: ${e.message}`;
    }
  }
}

function formatEquipment(eq) {
  const lines = [
    `*${eq.code}* — ${eq.name}`,
    `Status: ${eq.status.toUpperCase()}`,
  ];
  if (eq.site_code) lines.push(`Location: ${eq.site_code} (${eq.site_name})`);
  lines.push(`Last updated: ${new Date(eq.last_updated_at).toLocaleString()}`);
  return lines.join('\n');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { handleMessage, getUserByPhone };
