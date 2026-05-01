export function looksLikePcode(s: string) {
  if (!s || typeof s !== 'string') return false;
  // Treat only compact forms as valid pcodes: letters immediately followed by digits.
  // Examples: AFG01, SD02114, SD01001. Do NOT accept separators like '_' or '-'.
  return /^[A-Z]{2,3}\d{2,}$/i.test(s);
}

export function parsePcode(s: string) {
  if (!s || typeof s !== 'string') return { isPcode: false, raw: s, country: null, code: null, level: null };
  const raw = s.trim();
  if (!looksLikePcode(raw)) return { isPcode: false, raw, country: null, code: null, level: null };
  // compact form like SD01001 -> letters then digits (no separators)
  const compactMatch = raw.match(/^([A-Z]{2,3})(\d+)$/i);
  if (compactMatch) {
    const country = compactMatch[1].toUpperCase();
    const digits = compactMatch[2];
    // heuristic: short numeric part (~2) -> ADM1, longer -> ADM2
    const level = digits.length <= 2 ? 'ADM1' : 'ADM2';
    return { isPcode: true, country, code: raw, level };
  }
  return { isPcode: false, raw, country: null, code: null, level: null };
}

type Analysis = {
  action: 'none' | 'error' | 'adm1' | 'adm2' | 'mixed';
  message?: string;
  pcode?: string | null;
  level?: 'ADM1' | 'ADM2' | 'MIXED' | '';
  parsed?: any[];
};

// Analyze an array of UOAs and decide what to fetch next.
export function analyzeUoas(uoas: string[]): Analysis {
  const parsed = uoas.map((u) => ({ raw: u, parsed: parsePcode(u) }));
  const pcodeParsed = parsed.filter((p) => p.parsed?.isPcode);

  if (pcodeParsed.length === 0) {
    return { action: 'none', message: 'no pcode-like UOAs found', parsed };
  }

  const pcodes = Array.from(new Set(pcodeParsed.map((p) => p.parsed.country).filter(Boolean)));
  if (pcodes.length > 1) return { action: 'error', message: 'multiple countries detected', parsed };
  const pcode = pcodes[0];

  const levels = Array.from(new Set(pcodeParsed.map((p) => p.parsed.level).filter(Boolean)));
  if (levels.length > 1) {
    const isAdm1AndAdm2 = levels.length === 2 && levels.includes('ADM1') && levels.includes('ADM2');
    if (!isAdm1AndAdm2) return { action: 'error', message: 'unsupported mixed admin levels detected', parsed };

    // Reject overlap: an ADM1 UoA whose code is a prefix of an ADM2 UoA in the same dataset.
    // e.g. SD01 (ADM1) + SD01001 (ADM2) → the ADM1 area and its own sub-areas both appear.
    const adm1Codes = pcodeParsed.filter((p) => p.parsed.level === 'ADM1').map((p) => p.parsed.code as string);
    const adm2Codes = pcodeParsed.filter((p) => p.parsed.level === 'ADM2').map((p) => p.parsed.code as string);
    const overlapping = adm1Codes.find((a1) => adm2Codes.some((a2) => a2.startsWith(a1)));
    if (overlapping) {
      return { action: 'error', message: `ADM1 UoA ${overlapping} overlaps with ADM2 sub-areas in the same dataset`, parsed };
    }

    return { action: 'mixed', pcode, level: 'MIXED', parsed };
  }
  const level = (levels[0] || 'ADM1') as 'ADM1' | 'ADM2';

  return { action: level === 'ADM1' ? 'adm1' : 'adm2', pcode, level, parsed };
}