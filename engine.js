/**
 * ChekMsg detection engine v0.4
 *
 * ทำงานได้ทั้งในเบราว์เซอร์และ Node (ES module)
 * ตัว engine ไม่รู้จักภาษาที่จะแสดงผล — คืนค่าเป็น "รหัส" ให้ชั้น UI แปลเอง
 * เพื่อให้เพิ่มภาษาได้โดยไม่ต้องแตะ logic
 *
 * สิ่งที่ v0.4 แก้จาก v0.3:
 *   1. pattern อยู่ใน patterns.json ไม่ปนกับโค้ด
 *   2. รู้จักการปฏิเสธ — "ห้ามบอก OTP" ไม่ถูกนับเป็นสัญญาณสแกม
 *   3. นับสูงสุด 1 ครั้งต่อหมวด กันคะแนนเฟ้อจาก pattern ที่ซ้อนกัน
 *   4. ตัดสินด้วยส่วนต่างคะแนน ไม่ใช่คำเดียวชนะ
 *   5. ตรวจโดเมนของลิงก์เทียบ allowlist ของธนาคาร/หน่วยงานรัฐ
 *   6. คืน "ความแรงของสัญญาณ" แทน % ความมั่นใจปลอม
 */

const URL_RE = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s]*)?/gi;

export function createEngine(patterns) {
  const {
    thresholds, negations, negationWindow, categories,
    scam = [], legit = [], risk = [], linkCheck = {}
  } = patterns;

  const compiledRisk = risk.map(r => ({ ...r, re: new RegExp(r.regex, r.flags || '') }));
  const trusted = new Set((linkCheck.trustedDomains || []).map(d => d.toLowerCase()));
  const bankMentions = (linkCheck.bankMentions || []).map(m => m.toLowerCase());
  const allNegations = [...(negations.en || []), ...(negations.th || [])];

  /** ข้อความก่อนหน้าตำแหน่งที่ match มีคำปฏิเสธหรือไม่ */
  function isNegated(lowerText, matchIndex, lang) {
    const win = (negationWindow && negationWindow[lang]) || 30;
    const before = lowerText.slice(Math.max(0, matchIndex - win), matchIndex);
    return allNegations.some(n => before.includes(n));
  }

  /** เหลือรายการที่น้ำหนักสูงสุดของแต่ละหมวด */
  function dedupeByCategory(hits) {
    const best = new Map();
    for (const h of hits) {
      const cur = best.get(h.cat);
      if (!cur || h.w > cur.w) best.set(h.cat, h);
    }
    return [...best.values()];
  }

  function extractDomains(raw) {
    const out = [];
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(raw)) !== null) {
      const host = m[1].toLowerCase();
      // ตัด subdomain ให้เหลือ 2 ระดับสุดท้าย เว้นโดเมนไทยที่เป็น 3 ระดับ (co.th, or.th, go.th, ac.th, in.th)
      const parts = host.split('.');
      const isThreeLevelTh = parts.length > 2 && parts[parts.length - 1] === 'th' &&
        ['co', 'or', 'go', 'ac', 'in', 'net', 'mi'].includes(parts[parts.length - 2]);
      const registrable = isThreeLevelTh ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
      out.push({ host, registrable });
    }
    return out;
  }

  /**
   * ลบช่องว่างออกทั้งหมด พร้อมเก็บ map กลับไปยังตำแหน่งเดิม
   * เพื่อรับมือเทคนิคหลบ keyword ด้วยการแทรกช่องว่าง เช่น "ก ด ลิ ง ก์"
   * (พบจริงในสแกมไทย — ดู note ใน README)
   */
  function despace(lowerText) {
    let out = '';
    const map = [];
    for (let i = 0; i < lowerText.length; i++) {
      const ch = lowerText[i];
      if (ch === ' ' || ch === ' ' || ch === '\t') continue;
      out += ch;
      map.push(i);
    }
    return { text: out, map };
  }

  /** หา pattern ในข้อความ คืนตำแหน่งในข้อความต้นฉบับ หรือ -1 */
  function findMatch(lower, packed, needle) {
    const direct = lower.indexOf(needle);
    if (direct !== -1) return direct;
    const squeezed = needle.replace(/\s+/g, '');
    if (!squeezed) return -1;
    const idx = packed.text.indexOf(squeezed);
    return idx === -1 ? -1 : packed.map[idx];
  }

  function analyze(rawInput) {
    const raw = String(rawInput || '');
    const lower = raw.toLowerCase();
    const packed = despace(lower);

    const scamHits = [];
    const legitHits = [];
    let negatedCount = 0;

    // --- keyword ฝั่งสแกม (ข้ามถ้าถูกปฏิเสธ) ---
    for (const p of scam) {
      const idx = findMatch(lower, packed, p.match.toLowerCase());
      if (idx === -1) continue;
      if (isNegated(lower, idx, p.lang)) { negatedCount++; continue; }
      scamHits.push({ id: p.id, cat: p.cat, w: p.w, side: 'scam' });
    }

    // --- keyword ฝั่งข้อความปกติ ---
    for (const p of legit) {
      const idx = findMatch(lower, packed, p.match.toLowerCase());
      if (idx === -1) continue;
      legitHits.push({ id: p.id, cat: p.cat, w: p.w, side: 'legit' });
    }

    // ข้อความที่ "ห้ามบอกรหัส" คือคำเตือนของธนาคาร ไม่ใช่คำขอของคนร้าย
    if (negatedCount > 0 && !legitHits.some(h => h.cat === 'security_advice')) {
      legitHits.push({ id: 'l_derived_negation', cat: 'security_advice', w: 3, side: 'legit' });
    }

    // --- pattern เชิงโครงสร้าง ---
    const riskHits = [];
    for (const r of compiledRisk) {
      r.re.lastIndex = 0;
      if (r.re.test(raw)) riskHits.push({ id: r.id, cat: r.cat, w: r.w, side: 'risk' });
    }

    // --- ตรวจโดเมนของลิงก์ ---
    const domains = extractDomains(raw);
    const untrusted = domains.filter(d => !trusted.has(d.registrable));
    const mentionsInstitution = bankMentions.some(m => lower.includes(m));
    if (linkCheck.enabled && untrusted.length && mentionsInstitution) {
      riskHits.push({
        id: 'r_untrusted_domain',
        cat: 'link_untrusted',
        w: linkCheck.weightUntrusted || 4,
        side: 'risk',
        detail: untrusted.map(d => d.registrable).join(', ')
      });
    }

    // --- รวมคะแนน (นับสูงสุด 1 ครั้งต่อหมวด) ---
    const scamFinal = dedupeByCategory([...scamHits, ...riskHits]);
    const legitFinal = dedupeByCategory(legitHits);
    const scamScore = scamFinal.reduce((s, h) => s + h.w, 0);
    const legitScore = legitFinal.reduce((s, h) => s + h.w, 0);
    const margin = scamScore - legitScore;

    // --- ตัดสินด้วยส่วนต่าง ไม่ใช่คำเดียวชนะ ---
    let verdict;
    if (margin >= thresholds.scamMargin) verdict = 'scam';
    else if (-margin >= thresholds.legitMargin) verdict = 'legit';
    else verdict = 'unsure';

    // --- ความแรงของสัญญาณ (ไม่ใช่ความน่าจะเป็น) ---
    const dominant = Math.max(scamScore, legitScore);
    let strength = 'low';
    if (dominant >= thresholds.strength.high) strength = 'high';
    else if (dominant >= thresholds.strength.medium) strength = 'medium';
    if (verdict === 'unsure') strength = 'low';

    return {
      verdict,
      strength,
      scamScore,
      legitScore,
      margin,
      negatedCount,
      scamSignals: scamFinal,
      legitSignals: legitFinal,
      domains: domains.map(d => d.registrable),
      untrustedDomains: untrusted.map(d => d.registrable),
      categoryLabel: (cat, lang) => (categories[cat] && categories[cat][lang]) || cat
    };
  }

  return { analyze, patterns };
}

/** helper สำหรับ Node: โหลด patterns.json แล้วสร้าง engine */
export async function createEngineFromFile(path) {
  const { readFile } = await import('node:fs/promises');
  const patterns = JSON.parse(await readFile(path, 'utf8'));
  return createEngine(patterns);
}
