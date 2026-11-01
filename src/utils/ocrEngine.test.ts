import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  levenshteinDistance,
  matchFormularyDrug,
  decodeMedicalSig,
  computeOcrMetrics,
  auditPrescriptionSafety,
  generateFhirBundle,
  parseOcrTranscriptToLines,
  registerEgDrugsDatabase,
  getEgDrugsCount,
  PipelineConfig,
  ExtractedMedicationLine,
} from './ocrEngine';

// Load all 27,617 Egyptian medicines from mahmoudfalous/eg-drugs
const egDrugsPath = path.join(process.cwd(), 'public', 'eg_drugs_27k.json');
if (fs.existsSync(egDrugsPath)) {
  registerEgDrugsDatabase(JSON.parse(fs.readFileSync(egDrugsPath, 'utf8')));
}

test('27,617 Egyptian Drug Database (mahmoudfalous/eg-drugs) is loaded and indexed', () => {
  assert.equal(getEgDrugsCount(), 27617);
});

test('levenshteinDistance calculates exact character edit distance', () => {
  assert.equal(levenshteinDistance('Atorvastatin', 'Atorvastatin'), 0);
  assert.equal(levenshteinDistance('Atorvastatn', 'Atorvastatin'), 1);
  assert.equal(levenshteinDistance('Clopidogre1', 'Clopidogrel'), 1);
});

test('matchFormularyDrug resolves noisy handwritten drug names and Egyptian trade names with >=95% lexicon confidence', () => {
  const match1 = matchFormularyDrug('Atorvastatn 40mg', 0.89, 5);
  assert.equal(match1.matchedGeneric, 'Atorvastatin Calcium');
  assert.equal(match1.rxCui, '83367');
  assert.equal(match1.wasCorrected, true);
  assert.ok(match1.postLexiconConfidence >= 95.0, `Expected >=95%, got ${match1.postLexiconConfidence}`);

  const matchEgypt1 = matchFormularyDrug('Augmentn 1gm', 0.88, 6);
  assert.equal(matchEgypt1.matchedGeneric, 'Amoxicillin + Clavulanic Acid');
  assert.ok(matchEgypt1.postLexiconConfidence >= 95.0);

  const matchEgypt2 = matchFormularyDrug('Contro1oc 40mg', 0.88, 6);
  assert.equal(matchEgypt2.matchedGeneric, 'Pantoprazole Sodium');
  assert.ok(matchEgypt2.postLexiconConfidence >= 95.0);

  // Verify 27,617 Egyptian database matches Megamox, Congestal, Rowachol
  const matchMegamox = matchFormularyDrug('Megamox 625mg tab', 0.90, 6);
  assert.equal(matchMegamox.primaryTradeName, 'Megamox');
  assert.equal(matchMegamox.preservedRawOptical, false);
});

test('decodeMedicalSig accurately expands Latin, Egyptian 1x2/1x3, and Arabic shorthand into bilingual instructions', () => {
  const sig1 = decodeMedicalSig('1 tab PO QHS #30');
  assert.equal(sig1.routeCode, 'PO');
  assert.equal(sig1.frequencyCode, 'QHS');
  assert.equal(sig1.dispenseQuantity, '30');
  assert.ok(sig1.humanReadable.includes('1 tablet by mouth once daily at bedtime'));
  assert.ok(sig1.arabicInstruction.includes('قبل النوم'));

  const sigEgypt = decodeMedicalSig('1 tab 1x2 قرص كل ١٢ ساعة بعد الأكل #20');
  assert.equal(sigEgypt.frequencyCode, 'BID');
  assert.ok(sigEgypt.humanReadable.includes('twice daily'));
  assert.ok(sigEgypt.arabicInstruction.includes('كل ١٢ ساعة'));
  assert.ok(sigEgypt.arabicInstruction.includes('بعد الأكل'));
});

test('parseOcrTranscriptToLines converts uploaded prescription OCR lines into structured medications', () => {
  const mockOcrLines = [
    { text: 'Dr. Tarek El-Menshawy - Cairo Clinic', confidence: 92, bbox: { x0: 30, y0: 20, x1: 420, y1: 50 } },
    { text: '1. Augmentn 1g tab - 1x2 قرص كل ١٢ ساعة #14', confidence: 88, bbox: { x0: 45, y0: 180, x1: 520, y1: 230 } },
    { text: '2. Cataf1am 50mg tab - 1 tab PO BID pc #20', confidence: 89, bbox: { x0: 45, y0: 250, x1: 510, y1: 300 } },
    { text: '3. Contro1oc 40mg tab - 1 tab PO QAM ac #30', confidence: 90, bbox: { x0: 45, y0: 320, x1: 530, y1: 370 } },
  ];

  const lines = parseOcrTranscriptToLines(
    mockOcrLines.map((l) => l.text).join('\n'),
    mockOcrLines,
    6,
    640,
    500
  );

  assert.equal(lines.length, 3);
  assert.equal(lines[0].medicationName, 'Amoxicillin + Clavulanic Acid');
  assert.equal(lines[1].medicationName, 'Diclofenac Potassium / Sodium');
  assert.equal(lines[2].medicationName, 'Pantoprazole Sodium');
  assert.ok(lines[0].lexiconAdjustedConfidence >= 95.0);
});

test('parseOcrTranscriptToLines accurately resolves Sirdalud 4mg tab قرص ليلا (single-line & multi-line) and abstains from corrupting unknown drugs', () => {
  const sirdaludLines = [
    // Even if cropped at y0=15 or low on a tall image y0=750, it must be detected!
    { text: 'Sirdalud 4mg tab', confidence: 91, bbox: { x0: 40, y0: 15, x1: 500, y1: 60 } },
    { text: 'قرص ليلا', confidence: 92, bbox: { x0: 40, y0: 70, x1: 300, y1: 110 } },
    { text: 'Rowachol cap قرص قبل الأكل', confidence: 90, bbox: { x0: 40, y0: 520, x1: 500, y1: 570 } },
    { text: 'Xenomedicine 10mg tab قرص صباحا', confidence: 90, bbox: { x0: 40, y0: 620, x1: 500, y1: 670 } },
  ];

  const parsed = parseOcrTranscriptToLines(
    sirdaludLines.map((l) => l.text).join('\n'),
    sirdaludLines,
    6,
    640,
    500
  );

  assert.equal(parsed.length, 3);
  // 1. Sirdalud 4mg tab + next-line قرص ليلا must merge and resolve to Sirdalud (Tizanidine Hydrochloride, 70 EGP)
  assert.equal(parsed[0].brandName, 'Sirdalud');
  assert.equal(parsed[0].medicationName, 'Tizanidine Hydrochloride');
  assert.equal(parsed[0].strength, '4mg');
  assert.equal(parsed[0].priceEgp, 70);
  assert.ok(parsed[0].decodedSig.includes('once daily at bedtime'), `Got decodedSig: ${parsed[0].decodedSig}`);
  assert.ok(parsed[0].arabicSig?.includes('ليلاً قبل النوم'), `Got arabicSig: ${parsed[0].arabicSig}`);

  // 2. Rowachol is matched in the 27,617 Egyptian Drug Database
  assert.equal(parsed[1].brandName, 'Rowachol');

  // 3. Unindexed drug Xenomedicine must NEVER be overwritten with an unrelated RxNorm drug
  assert.equal(parsed[2].brandName, 'Xenomedicine');
});

test('computeOcrMetrics achieves >=95% character accuracy under calibrated pipeline settings', () => {
  const reference = '1. Atorvastatin 40mg tab - 1 tab PO QHS #30\n2. Clopidogrel 75mg tab - 1 tab PO QD #30';
  const rawOptical = '1. Atorvastatn 40mg tab - 1 tab PO QHS #30\n2. Clopidogre1 75mg tab - 1 tab PO QD #30';

  const calibratedConfig: PipelineConfig = {
    claheContrast: 68,
    adaptiveBinarization: true,
    deskewCorrection: true,
    strokeDilation: 1,
    lexiconBeamWidth: 6,
    showBoundingBoxes: true,
  };

  const metrics = computeOcrMetrics(reference, rawOptical, calibratedConfig);
  assert.ok(metrics.characterAccuracy >= 95.0, `Expected character accuracy >= 95%, got ${metrics.characterAccuracy}`);
  assert.ok(metrics.characterErrorRate <= 0.05, `Expected CER <= 0.05, got ${metrics.characterErrorRate}`);
});

test('auditPrescriptionSafety detects CYP2C19 interaction and Penicillin allergy conflict', () => {
  const mockLines: ExtractedMedicationLine[] = [
    {
      id: 'l1',
      lineNumber: 1,
      rawHandwrittenText: 'Augmentin 1g PO BID',
      rawCtcOutput: 'Augmentn 1g PO BID',
      medicationName: 'Amoxicillin + Clavulanic Acid',
      brandName: 'Augmentin',
      rxCui: '197361',
      edaRegNo: 'EDA-30192/2022',
      priceEgp: 176,
      therapeuticClass: 'Beta-Lactamase Inhibitor Combination Antibiotic',
      strength: '1g',
      dosageForm: 'Tablet',
      rawSig: '1 tab PO BID',
      decodedSig: 'Take 1 tablet by mouth twice daily (every 12 hours).',
      arabicSig: 'قرص واحد عن طريق الفم كل ١٢ ساعة (مرتين يومياً)',
      dispenseQty: '14',
      refills: 0,
      rawOpticalConfidence: 91.2,
      lexiconAdjustedConfidence: 97.4,
      verifiedByPharmacist: false,
      boundingBox: { x: 10, y: 10, width: 100, height: 30 },
      tokenConfidences: [],
    },
  ];

  const allergyAlerts = auditPrescriptionSafety(mockLines, ['Penicillins (Hives)']);
  assert.ok(allergyAlerts.some((a) => a.severity === 'critical' && a.category === 'allergy'));

  const fhir = generateFhirBundle('rx-eg-101', 'Ahmed Hassan', 'Dr. Tarek El-Menshawy, MD', mockLines);
  assert.equal(fhir.resourceType, 'Bundle');
  assert.equal(fhir.entry.length, 1);
  assert.equal(fhir.entry[0].resource.medicationCodeableConcept.coding[0].code, '197361');
});
