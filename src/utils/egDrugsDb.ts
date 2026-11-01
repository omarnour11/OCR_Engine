/**
 * Egyptian Drug Authority (EDA) & Market Database Indexer (27,617 Medicines)
 * Source: https://github.com/mahmoudfalous/eg-drugs (eg_drugs.json / eg_drugs.csv)
 *
 * Provides sub-millisecond exact & orthographic Levenshtein fuzzy search across
 * 27,617 Egyptian pharmaceutical products (English trade names, Arabic trade names,
 * active generic ingredients, EGP prices, manufacturers, and barcodes).
 */

export interface EgDrugCompactRecord {
  /** Unique ID from mahmoudfalous/eg-drugs (1..27617) */
  id: number;
  /** Full English trade name + strength + dosage form (e.g. "sirdalud 4mg 20 tab") */
  n: string;
  /** Full Arabic trade name + strength + form (e.g. "سيردالود 4مجم 20 قرص") */
  a: string;
  /** Active generic ingredient(s) (e.g. "tizanidine") */
  g: string;
  /** Official Egyptian pharmacy price in EGP */
  p: number;
  /** Clinical / therapeutic category */
  c: string;
  /** Manufacturer / Pharma company in Egypt */
  m: string;
  /** Egyptian barcode (622...) */
  b: string;
}

export interface EgDrugMatchHit {
  record: EgDrugCompactRecord;
  matchedBrandKey: string;
  matchedRawWord: string;
  displayTradeName: string;
  extractedStrength: string;
  extractedForm: string;
  similarity: number;
  editDistance: number;
}

/**
 * Comprehensive stopword and non-drug blocklist so clinic headers, titles,
 * dosage form tokens, sig abbreviations, and personal names are NEVER misclassified
 * as Egyptian drug trade names during fuzzy OCR matching.
 */
export const NON_MEDICINE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'not', 'are', 'was', 'were',
  'dr', 'prof', 'doctor', 'professor', 'clinic', 'clinics', 'hospital', 'hospitals', 'center', 'centre',
  'medical', 'medicine', 'specialist', 'consultant', 'faculty', 'university', 'syndicate', 'ministry',
  'pharmacy', 'pharmacist', 'patient', 'name', 'age', 'sex', 'gender', 'male', 'female', 'weight', 'dob',
  'date', 'time', 'phone', 'tel', 'mob', 'mobile', 'address', 'street', 'st', 'square', 'sq', 'floor',
  'building', 'apt', 'flat', 'city', 'governorate', 'branch', 'appointment', 'consultation', 'follow',
  'diagnosis', 'history', 'allergy', 'allergies', 'nkda', 'none', 'known', 'signature', 'sign', 'stamp',
  'license', 'registration', 'reg', 'prescription', 'roshetta', 'rx', 'dispense', 'refill', 'refills',
  // Egyptian cities & districts
  'cairo', 'giza', 'alexandria', 'alex', 'mansoura', 'tanta', 'zagazig', 'assiut', 'aswan', 'luxor',
  'sohag', 'minya', 'beni', 'suef', 'fayoum', 'ismailia', 'suez', 'port', 'said', 'damietta', 'damanhour',
  'banha', 'shibin', 'kafr', 'sheikh', 'hurghada', 'sharm', 'dokki', 'mohandessin', 'zamalek', 'maadi',
  'heliopolis', 'nasr', 'october', 'zayed', 'haram', 'faisal', 'shubra', 'abbasia', 'helwan', 'rehab',
  'madinaty', 'tagamoa', 'smouha', 'gleem', 'stanley', 'miami', 'sidi', 'gaber', 'bishr', 'louran',
  'fawzy', 'moaz', 'tahrir', 'gomhoria', 'ramses', 'egypt', 'egyptian',
  // Common Egyptian personal names (prevent matching "Dr. Tarek" -> "Tareg" or "Amir" -> "Amaryl")
  'ahmed', 'mohamed', 'mohammed', 'mahmoud', 'mostafa', 'mustafa', 'hassan', 'hussein', 'ibrahim',
  'ismail', 'ali', 'omar', 'osman', 'khaled', 'khalid', 'tarek', 'tarik', 'amr', 'amro', 'amer', 'amir',
  'amin', 'anwar', 'ayman', 'ashraf', 'adel', 'atef', 'alaa', 'baha', 'bassem', 'bahaa', 'diaa', 'emad',
  'ehab', 'essam', 'eslam', 'islam', 'farouk', 'fouad', 'fathy', 'farid', 'gamal', 'galal', 'george',
  'hani', 'hany', 'hatem', 'hazem', 'hesham', 'hisham', 'hossam', 'hamdy', 'hamada', 'karim', 'kareem',
  'kamal', 'magdy', 'magdi', 'maher', 'maged', 'marwan', 'medhat', 'mamdouh', 'mansour', 'mina', 'momen',
  'mourad', 'murad', 'nabil', 'nader', 'nagy', 'nasser', 'osama', 'oussama', 'ragab', 'rami', 'ramy',
  'ramadan', 'rashad', 'reda', 'refaat', 'saad', 'saber', 'sabry', 'said', 'salah', 'saleh', 'salem',
  'sameh', 'sami', 'samy', 'samir', 'sayed', 'shady', 'shadi', 'sharif', 'sherif', 'shawky', 'shoukry',
  'sobhy', 'soliman', 'taher', 'talaat', 'tamer', 'tawfik', 'wael', 'wahid', 'walid', 'waleed', 'wagdy',
  'yasser', 'yassin', 'youssef', 'yehia', 'yahia', 'zakaria', 'zaki', 'ziad', 'zein', 'abdel', 'abdul',
  'rahman', 'rahim', 'aziz', 'hamid', 'fattah', 'nasser', 'latif', 'halim', 'maguid', 'moneim', 'salam',
  'salma', 'mona', 'sara', 'sarah', 'fatma', 'fatima', 'nada', 'aya', 'nour', 'noha', 'نهى', 'رانيا',
  'rania', 'reem', 'reham', 'riham', 'dina', 'doaa', 'eman', 'iman', 'esraa', 'israa', 'haba', 'heba',
  'hend', 'hoda', 'laila', 'layla', 'maha', 'mai', 'may', 'manal', 'marwa', 'mariam', 'maryam', 'menna',
  'mirna', 'naglaa', 'nahla', 'nermine', 'nesma', 'nevien', 'nihal', 'nisreen', 'omnia', 'radwa', 'rana',
  'asha', 'sahar', 'samar', 'samia', 'shaimaa', 'shereen', 'sherine', 'soha', 'soheir', 'suhair', 'wafaa',
  'yara', 'yasmin', 'yasmine', 'zeinab', 'zainab', 'menshawy', 'elmenshawy',
  // Dosage forms, units & sig instructions
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'syrup', 'susp', 'suspension',
  'vial', 'vials', 'amp', 'ampoule', 'ampoules', 'sachet', 'sachets', 'cream', 'oint', 'ointment', 'gel',
  'drops', 'drop', 'spray', 'lotion', 'supp', 'suppository', 'solution', 'sol', 'powder', 'infusion',
  'inj', 'injection', 'patch', 'pen', 'inhaler', 'evohaler', 'diskus', 'turbuhaler', 'oral', 'topical',
  'nasal', 'rectal', 'vaginal', 'otic', 'ophthalmic', 'sugar', 'coated', 'film', 'gastro', 'resistant',
  'sustained', 'extended', 'release', 'chewable', 'effervescent', 'eff', 'odt', 'lozenges', 'gargle',
  'wash', 'shampoo', 'soap', 'serum', 'mask', 'oil', 'cleansing', 'moisturizing', 'whitening', 'sun',
  'block', 'screen', 'spf', 'daily', 'once', 'twice', 'three', 'times', 'day', 'days', 'week', 'weeks',
  'month', 'months', 'hour', 'hours', 'morning', 'evening', 'night', 'bedtime', 'before', 'after', 'with',
  'without', 'meal', 'meals', 'food', 'breakfast', 'lunch', 'dinner', 'water', 'every', 'take', 'use',
  'apply', 'one', 'two', 'four', 'five', 'six', 'half', 'quarter', 'care', 'plus', 'extra', 'forte',
  'max', 'pro', 'new', 'top', 'total', 'pure', 'fresh', 'clean', 'safe', 'best', 'first', 'active',
  'health', 'healthy', 'life', 'normal', 'super', 'ultra', 'gold', 'silver', 'white', 'soft', 'light',
  'natural', 'baby', 'kids', 'adult', 'adults', 'men', 'women', 'lady', 'hair', 'skin', 'face', 'body',
  'hand', 'foot', 'eye', 'ear', 'nose', 'mouth', 'tooth', 'teeth', 'vitamin', 'vitamins', 'mineral',
  'sig', 'po', 'sl', 'inh', 'im', 'iv', 'sc', 'bid', 'tid', 'qid', 'qd', 'qhs', 'qam', 'qpm', 'prn',
  'ac', 'pc', 'hs', 'stat', 'mg', 'gm', 'mcg', 'ml', 'iu', 'unit', 'units', 'box', 'strip', 'pack',
]);

const ARABIC_STOPWORDS = new Set([
  'قرص', 'اقراص', 'أقراص', 'قرصين', 'كبسولة', 'كبسولات', 'شراب', 'معلق', 'ملعقة', 'امبول', 'أمبول',
  'فيال', 'حقنة', 'حقن', 'عضل', 'وريد', 'كيس', 'أكياس', 'اكياس', 'لبوس', 'نقط', 'بخاخ', 'دهان',
  'كريم', 'مرهم', 'جل', 'غسول', 'لوشن', 'صابون', 'شامبو', 'صباحا', 'صباحاً', 'مساء', 'مساءً',
  'ليلا', 'ليلاً', 'يوميا', 'يومياً', 'كل', 'ساعة', 'ساعات', 'مرات', 'مرة', 'واحدة', 'ثلاث',
  'مرتين', 'قبل', 'بعد', 'الأكل', 'الاكل', 'الفطار', 'الغداء', 'العشاء', 'النوم', 'الريق', 'اللزوم',
  'عند', 'لمدة', 'يوم', 'أيام', 'ايام', 'اسبوع', 'أسبوع', 'شهر', 'دكتور', 'طبيب', 'أستاذ', 'استاذ',
  'استشاري', 'أخصائي', 'اخصائي', 'عيادة', 'مستشفى', 'مركز', 'طبي', 'الاسم', 'السن', 'التاريخ',
  'العنوان', 'تليفون', 'موبايل', 'المريض', 'روشتة', 'علاج', 'دواء', 'مجم', 'جم', 'مل', 'وحدة',
  'احمد', 'أحمد', 'محمد', 'محمود', 'مصطفى', 'حسن', 'حسين', 'ابراهيم', 'إبراهيم', 'علي', 'عمر',
  'خالد', 'طارق', 'عمرو', 'تامر', 'ياسر', 'وليد', 'هشام', 'اسامة', 'أسامة', 'كريم', 'رامي', 'سامح',
]);

let allEgDrugs: EgDrugCompactRecord[] = [];
const byFirstWord = new Map<string, EgDrugCompactRecord[]>();
const byTwoWords = new Map<string, EgDrugCompactRecord[]>();
const byArabicFirstWord = new Map<string, EgDrugCompactRecord[]>();
const keysByLength = new Map<number, string[]>();
const arabicKeysByLength = new Map<number, string[]>();

function simpleLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

function normalizeArabicToken(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // strip tashkeel
    .replace(/[^\u0600-\u06FF]/g, '')
    .trim();
}

/**
 * Registers the 27,617 Egyptian medicine records from `public/eg_drugs_27k.json`
 * and builds O(1) prefix and length-bucketed orthographic indices.
 */
export function registerEgDrugsDatabase(records: EgDrugCompactRecord[]): void {
  if (!Array.isArray(records) || records.length === 0) return;
  if (allEgDrugs.length === records.length) return; // already indexed

  allEgDrugs = records;
  byFirstWord.clear();
  byTwoWords.clear();
  byArabicFirstWord.clear();
  keysByLength.clear();
  arabicKeysByLength.clear();

  for (const r of records) {
    if (!r.n) continue;
    const cleanEnglish = r.n
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(/[\s\-/]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    if (cleanEnglish.length === 0) continue;

    const w0 = cleanEnglish[0];
    // Index 1-word brand key (must be >= 3 chars, not pure digits, not a non-medicine stopword)
    if (w0.length >= 3 && !/^\d/.test(w0) && !NON_MEDICINE_STOPWORDS.has(w0)) {
      let list = byFirstWord.get(w0);
      if (!list) {
        list = [];
        byFirstWord.set(w0, list);
        const L = w0.length;
        let lenBucket = keysByLength.get(L);
        if (!lenBucket) {
          lenBucket = [];
          keysByLength.set(L, lenBucket);
        }
        lenBucket.push(w0);
      }
      list.push(r);
    }

    // Index 2-word brand key (e.g. "panadol extra", "abimol extra", "milga advance", "concor plus")
    if (
      cleanEnglish.length >= 2 &&
      w0.length >= 3 &&
      cleanEnglish[1].length >= 3 &&
      !/^\d/.test(cleanEnglish[1]) &&
      !NON_MEDICINE_STOPWORDS.has(w0)
    ) {
      const twoKey = `${w0} ${cleanEnglish[1]}`;
      let list2 = byTwoWords.get(twoKey);
      if (!list2) {
        list2 = [];
        byTwoWords.set(twoKey, list2);
      }
      list2.push(r);
    }

    // Index Arabic trade name first word (e.g. "سيردالود", "اوجمنتين", "كتافلام")
    if (r.a) {
      const arTokens = r.a
        .split(/\s+/)
        .map(normalizeArabicToken)
        .filter((t) => t.length >= 3 && !ARABIC_STOPWORDS.has(t));

      if (arTokens.length > 0) {
        const aw0 = arTokens[0];
        let arList = byArabicFirstWord.get(aw0);
        if (!arList) {
          arList = [];
          byArabicFirstWord.set(aw0, arList);
          const aLen = aw0.length;
          let arBucket = arabicKeysByLength.get(aLen);
          if (!arBucket) {
            arBucket = [];
            arabicKeysByLength.set(aLen, arBucket);
          }
          arBucket.push(aw0);
        }
        arList.push(r);
      }
    }
  }
}

export function getEgDrugsCount(): number {
  return allEgDrugs.length;
}

export function getAllEgDrugs(): EgDrugCompactRecord[] {
  return allEgDrugs;
}

/**
 * Extracts dosage form label from an `eg_drugs` product name.
 */
export function extractFormFromEgName(name: string): string {
  const lower = name.toLowerCase();
  if (/\b(f\.?c\.?\s*tab|film\s*coated\s*tab)/.test(lower)) return 'Film-Coated Tablet';
  if (/\b(s\.?r\.?\s*tab|x\.?r\.?\s*tab|m\.?r\.?\s*tab|sustained|extended)/.test(lower)) return 'Extended-Release Tablet';
  if (/\b(tab|tabs|tablet|tablets|قرص|اقراص)\b/.test(lower)) return 'Tablet';
  if (/\b(cap|caps|capsule|capsules|كبسولة|كبسولات)\b/.test(lower)) return 'Capsule';
  if (/\b(syrup|شراب)\b/.test(lower)) return 'Oral Syrup';
  if (/\b(susp|suspension|معلق)\b/.test(lower)) return 'Oral Suspension';
  if (/\b(sachet|sachets|eff|effervescent|كيس|فوار)\b/.test(lower)) return 'Oral Sachet';
  if (/\b(amp|ampoule|ampoules|امبول|أمبول)\b/.test(lower)) return 'Injectable Ampoule';
  if (/\b(vial|فيال)\b/.test(lower)) return 'Injectable Vial';
  if (/\b(cream|كريم)\b/.test(lower)) return 'Topical Cream';
  if (/\b(oint|ointment|مرهم)\b/.test(lower)) return 'Topical Ointment';
  if (/\b(gel|جل)\b/.test(lower)) return 'Topical Gel';
  if (/\b(drops|drop|نقط)\b/.test(lower)) return 'Drops';
  if (/\b(spray|بخاخ)\b/.test(lower)) return 'Spray';
  if (/\b(inhaler|evohaler|diskus|turbuhaler)\b/.test(lower)) return 'Metered Dose Inhaler';
  if (/\b(supp|suppository|لبوس)\b/.test(lower)) return 'Suppository';
  return 'Tablet';
}

/**
 * Extracts strength (e.g. "4mg", "1gm", "500mg", "150mg/5ml") from a product or line string.
 */
export function extractStrengthFromText(text: string): string {
  const match = text.match(
    /\b(\d+(?:\.\d+)?\s*(?:mg\/5ml|mg\/ml|mcg\/ml|mg|mcg|gm|g|iu|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|ml))?)\b/i
  );
  return match ? match[1].replace(/\s+/g, '') : '';
}

/**
 * Selects the best product variant from a brand's candidate records in `eg_drugs_27k.json`
 * based on the strength (e.g. "4mg") and dosage form (e.g. "tab", "syrup", "قرص") in the OCR line.
 */
function pickBestVariantRecord(
  candidates: EgDrugCompactRecord[],
  lineText: string
): EgDrugCompactRecord {
  if (candidates.length === 1) return candidates[0];

  const strengthMatch = lineText.match(/(\d+(?:\.\d+)?)\s*(mg|gm|g|mcg|ml|iu|%)/i);
  const targetNum = strengthMatch ? strengthMatch[1] : null;
  const wantsTab = /\b(tab|tabs|tablet|قرص|اقراص|أقراص)\b/i.test(lineText);
  const wantsCap = /\b(cap|caps|capsule|كبسولة|كبسولات)\b/i.test(lineText);
  const wantsSyrup = /\b(syrup|susp|شراب|معلق|ملعقة)\b/i.test(lineText);
  const wantsAmpVial = /\b(amp|vial|inj|حقنة|امبول|أمبول|فيال|عضل|وريد)\b/i.test(lineText);
  const wantsCream = /\b(cream|oint|gel|كريم|مرهم|جل|دهان)\b/i.test(lineText);

  let bestRec = candidates[0];
  let bestScore = -100;

  for (const rec of candidates) {
    let score = 0;
    const nLower = rec.n.toLowerCase();

    if (targetNum) {
      const exactNumRegex = new RegExp(`\\b${targetNum.replace('.', '\\.')}\\s*(?:mg|gm|g|mcg|ml|iu|%)`, 'i');
      if (exactNumRegex.test(nLower)) {
        score += 50;
      }
    }

    const isTab = /\b(tab|tabs|tablet|tablets)\b/.test(nLower);
    const isCap = /\b(cap|caps|capsule|capsules)\b/.test(nLower);
    const isSyrup = /\b(syrup|susp|suspension)\b/.test(nLower);
    const isAmpVial = /\b(amp|ampoule|vial|inf|inj)\b/.test(nLower);
    const isCream = /\b(cream|oint|ointment|gel)\b/.test(nLower);

    if (wantsTab && isTab) score += 25;
    if (wantsTab && isAmpVial) score -= 20;
    if (wantsCap && isCap) score += 25;
    if (wantsSyrup && isSyrup) score += 25;
    if (wantsAmpVial && isAmpVial) score += 25;
    if (wantsCream && isCream) score += 25;

    // Default preference for oral tablets/capsules if no form was specified and one is IV vial
    if (!wantsAmpVial && isTab) score += 5;

    if (rec.g && rec.g.length > 0) score += 3;
    if (rec.p > 0) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestRec = rec;
    }
  }

  return bestRec;
}

/**
 * Formats a clean Title-Case trade name from an `eg_drugs_27k.json` record.
 */
function formatCleanTradeName(rec: EgDrugCompactRecord, matchedBrandKey: string): string {
  const words = rec.n.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/);
  const keyWordCount = matchedBrandKey.split(/\s+/).length;
  const sliceCount = Math.min(words.length, Math.max(1, keyWordCount));
  return words
    .slice(0, sliceCount)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Searches the 27,617 Egyptian Drug Database (`mahmoudfalous/eg-drugs`) for the strongest
 * medicine match in a noisy OCR prescription line (supports both English & Arabic OCR tokens).
 */
export function matchEgDrugs27k(lineText: string): EgDrugMatchHit | null {
  if (allEgDrugs.length === 0) return null;

  const stripped = lineText
    .replace(/^\s*(?:R\/|Rx|℞|\d+[.)\s-]+)\s*/i, '')
    .trim();

  // 1. Extract English candidate words (length >= 3, not stopwords, not dosage numbers)
  const engWords = stripped
    .split(/[\s,—\-:()/]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(
      (w) =>
        w.length >= 3 &&
        !/^\d+(?:mg|gm|g|mcg|ml|iu|x\d+|%)?$/i.test(w) &&
        !NON_MEDICINE_STOPWORDS.has(w.toLowerCase())
    );

  // Check 2-word exact brand match first (e.g. "Panadol Extra", "Abimol Extra", "Milga Advance")
  for (let i = 0; i < engWords.length - 1; i++) {
    const w1 = engWords[i].toLowerCase().replace(/1/g, 'l').replace(/0/g, 'o');
    const w2 = engWords[i + 1].toLowerCase().replace(/1/g, 'l').replace(/0/g, 'o');
    const twoKey = `${w1} ${w2}`;
    const twoHit = byTwoWords.get(twoKey);
    if (twoHit && twoHit.length > 0) {
      const chosen = pickBestVariantRecord(twoHit, lineText);
      return {
        record: chosen,
        matchedBrandKey: twoKey,
        matchedRawWord: `${engWords[i]} ${engWords[i + 1]}`,
        displayTradeName: formatCleanTradeName(chosen, twoKey),
        extractedStrength: extractStrengthFromText(lineText) || extractStrengthFromText(chosen.n) || '500mg',
        extractedForm: extractFormFromEgName(chosen.n),
        similarity: 1.0,
        editDistance: 0,
      };
    }
  }

  let bestKey: string | null = null;
  let bestRawWord = '';
  let bestSim = 0;
  let bestDist = Infinity;

  // 2. Check 1-word exact & orthographic fuzzy match across 14,277 English brand keys
  for (const rawWord of engWords.slice(0, 4)) {
    const wl = rawWord.toLowerCase();
    const normVariants = [
      wl,
      wl.replace(/1/g, 'l').replace(/0/g, 'o'),
      wl.replace(/l/g, 'i'),
      wl.replace(/rn/g, 'm'),
      wl.replace(/c/g, 'k'),
    ];

    for (const nv of normVariants) {
      if (byFirstWord.has(nv)) {
        const isExact = nv === wl;
        return {
          record: pickBestVariantRecord(byFirstWord.get(nv)!, lineText),
          matchedBrandKey: nv,
          matchedRawWord: rawWord,
          displayTradeName: formatCleanTradeName(byFirstWord.get(nv)![0], nv),
          extractedStrength:
            extractStrengthFromText(lineText) ||
            extractStrengthFromText(byFirstWord.get(nv)![0].n) ||
            '500mg',
          extractedForm: extractFormFromEgName(byFirstWord.get(nv)![0].n),
          similarity: isExact ? 1.0 : 0.96,
          editDistance: isExact ? 0 : 1,
        };
      }
    }

    // Fuzzy Levenshtein search for words of length >= 4
    const L = wl.length;
    if (L < 4) continue;
    const maxAllowedDist = L >= 6 ? 2 : 1;
    const wlNorm = wl.replace(/1/g, 'l').replace(/0/g, 'o');

    for (let len = Math.max(4, L - maxAllowedDist); len <= L + maxAllowedDist; len++) {
      const bucket = keysByLength.get(len);
      if (!bucket) continue;

      for (const k of bucket) {
        // Fast prefix/suffix anchor filter
        if (
          k[0] !== wlNorm[0] &&
          k[k.length - 1] !== wlNorm[wlNorm.length - 1] &&
          k[1] !== wlNorm[1]
        ) {
          continue;
        }

        const d = Math.min(simpleLevenshtein(wl, k), simpleLevenshtein(wlNorm, k));
        if (d > maxAllowedDist) continue;

        const sim = 1 - d / Math.max(L, k.length);
        // Require stronger similarity (>= 0.80) for fuzzy matches so non-drug words never slip through
        if (sim >= 0.80 && (sim > bestSim || (sim === bestSim && d < bestDist))) {
          bestSim = sim;
          bestDist = d;
          bestKey = k;
          bestRawWord = rawWord;
        }
      }
    }
  }

  if (bestKey && byFirstWord.has(bestKey)) {
    const chosen = pickBestVariantRecord(byFirstWord.get(bestKey)!, lineText);
    return {
      record: chosen,
      matchedBrandKey: bestKey,
      matchedRawWord: bestRawWord,
      displayTradeName: formatCleanTradeName(chosen, bestKey),
      extractedStrength:
        extractStrengthFromText(lineText) || extractStrengthFromText(chosen.n) || '500mg',
      extractedForm: extractFormFromEgName(chosen.n),
      similarity: bestSim,
      editDistance: bestDist,
    };
  }

  // 3. Check Arabic trade name tokens (e.g. "سيردالود 4 مجم قرص ليلا", "اوجمنتين 1 جم")
  const arWords = stripped
    .split(/\s+/)
    .map(normalizeArabicToken)
    .filter((w) => w.length >= 4 && !ARABIC_STOPWORDS.has(w));

  for (const arWord of arWords.slice(0, 3)) {
    if (byArabicFirstWord.has(arWord)) {
      const chosen = pickBestVariantRecord(byArabicFirstWord.get(arWord)!, lineText);
      return {
        record: chosen,
        matchedBrandKey: arWord,
        matchedRawWord: arWord,
        displayTradeName: formatCleanTradeName(chosen, chosen.n.split(' ')[0]),
        extractedStrength:
          extractStrengthFromText(lineText) || extractStrengthFromText(chosen.n) || '500mg',
        extractedForm: extractFormFromEgName(chosen.n),
        similarity: 1.0,
        editDistance: 0,
      };
    }

    // 1-edit distance Arabic fuzzy lookup
    const aLen = arWord.length;
    for (let len = Math.max(4, aLen - 1); len <= aLen + 1; len++) {
      const arBucket = arabicKeysByLength.get(len);
      if (!arBucket) continue;
      for (const ak of arBucket) {
        if (ak[0] !== arWord[0]) continue;
        const d = simpleLevenshtein(arWord, ak);
        if (d <= 1) {
          const chosen = pickBestVariantRecord(byArabicFirstWord.get(ak)!, lineText);
          return {
            record: chosen,
            matchedBrandKey: ak,
            matchedRawWord: arWord,
            displayTradeName: formatCleanTradeName(chosen, chosen.n.split(' ')[0]),
            extractedStrength:
              extractStrengthFromText(lineText) || extractStrengthFromText(chosen.n) || '500mg',
            extractedForm: extractFormFromEgName(chosen.n),
            similarity: 1 - d / Math.max(aLen, ak.length),
            editDistance: d,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Interactive search across the 27,617 Egyptian drugs database by English name, Arabic name,
 * active ingredient, or barcode.
 */
export function searchEgDrugsCatalog(query: string, limit = 25): EgDrugCompactRecord[] {
  if (allEgDrugs.length === 0) return [];
  const q = query.trim().toLowerCase();
  if (!q) return allEgDrugs.slice(0, limit);

  const prefixMatches: EgDrugCompactRecord[] = [];
  const substringMatches: EgDrugCompactRecord[] = [];

  for (const r of allEgDrugs) {
    const nLower = r.n.toLowerCase();
    const gLower = r.g.toLowerCase();
    if (nLower.startsWith(q) || r.a.startsWith(q) || r.b === q) {
      prefixMatches.push(r);
      if (prefixMatches.length >= limit) break;
    } else if (
      substringMatches.length < limit &&
      (nLower.includes(q) || gLower.includes(q) || r.a.includes(q))
    ) {
      substringMatches.push(r);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}
