import { ADM1_FEATURESERVER, ADM2_FEATURESERVER, ADM1_MAPSERVER, ADM2_MAPSERVER } from '$lib/utils/url';
import simplify from '@turf/simplify';
import polygonToLine from '@turf/polygon-to-line';

async function queryFeatureServerLayer(base: string, value: string, outFields = '*', field = 'pcode') {
  if (!base || !value) return null;
  const endpoint = String(base).replace(/\/+$/, '') + '/0/query';
  const esc = (s: string) => String(s).replace(/'/g, "''");
  const where = `${field} = '${esc(value)}'`;
  const params = new URLSearchParams({ where, outFields, f: 'geojson', outSR: '4326' });
  const res = await fetch(endpoint, { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`feature query failed ${res.status}`);
  return res.json();
}

// Fetch ADM1 and/or ADM2 features according to analyzed decision.
export async function fetchAdminsForCountry(pcode: string, level: 'ADM1' | 'ADM2' | 'MIXED') {
  let adm1: any = null;
  let adm2: any = null;
  // If the provided identifier looks like a pcode (letters+digits), try field-based queries.
  const looksLikeP = /^[A-Z]{2,3}\d+/i.test(String(pcode));
  if (looksLikeP) {
    // Minimal flow: find iso3 from exact source-code match, then fetch all by iso3.
    // Try ADM2 exact match on adm2_source_code
    let match: any = null;
    try {
      match = await queryFeatureServerLayer(ADM2_FEATURESERVER, pcode, '*', 'adm2_source_code');
    } catch (e) {
      match = null;
    }
    // If not found, try ADM1 exact match on adm1_source_code
    if (!match || !match.features || match.features.length === 0) {
      try {
        match = await queryFeatureServerLayer(ADM1_FEATURESERVER, pcode, '*', 'adm1_source_code');
      } catch (e) {
        match = null;
      }
    }

    if (!match || !match.features || match.features.length === 0) {
      throw new Error(`no exact-match found for pcode ${pcode}`);
    }

    // derive iso3 from the first matched feature
    const iso3 = match.features[0].properties?.iso3;
    if (!iso3) {
      throw new Error(`iso3 not found from matched feature for pcode ${pcode}`);
    }

    // fetch all ADM1 by iso3 and ADM2 if requested
    if (level === 'ADM2') {
      try {
        adm2 = await queryFeatureServerLayer(ADM2_FEATURESERVER, iso3, '*', 'iso3');
      } catch (e:any) {
        adm2 = { error: String(e) };
      }
      // Fetch ADM1 polygons directly and convert to lines — avoids topology issues
      // that arise from trying to derive ADM1 boundaries by unioning ADM2 geometries.
      let adm1Polygons: any = null;
      try {
        adm1Polygons = await queryFeatureServerLayer(ADM1_FEATURESERVER, iso3, '*', 'iso3');
      } catch (e:any) {
        adm1Polygons = null;
      }
      if (adm1Polygons) {
        adm1Polygons = simplify(adm1Polygons, { tolerance: 0.01, highQuality: false, mutate: true });
        const adm1Lines: any[] = [];
        for (const feature of adm1Polygons.features) {
          const line = polygonToLine(feature);
          // polygonToLine returns a Feature when input is a Polygon,
          // but a FeatureCollection when input is a MultiPolygon (e.g. ADM1 with islands).
          if (line.type === 'FeatureCollection') {
            for (const f of line.features) {
              f.properties = { adm1_pcode: feature.properties?.adm1_pcode };
              adm1Lines.push(f);
            }
          } else {
            line.properties = { adm1_pcode: feature.properties?.adm1_pcode };
            adm1Lines.push(line);
          }
        }
        adm1 = { type: 'FeatureCollection', features: adm1Lines };
      }
      if (adm2?.type === 'FeatureCollection') adm2 = simplify(adm2, { tolerance: 0.005, highQuality: false, mutate: true });
    } else if (level === 'MIXED') {
      // Fetch ADM2 polygons (for coloring ADM2-level UoAs)
      try {
        adm2 = await queryFeatureServerLayer(ADM2_FEATURESERVER, iso3, '*', 'iso3');
      } catch (e:any) {
        adm2 = { error: String(e) };
      }
      if (adm2?.type === 'FeatureCollection') adm2 = simplify(adm2, { tolerance: 0.005, highQuality: false, mutate: true });

      // Fetch ADM1 polygons — kept as polygons for coloring ADM1-level UoAs
      let adm1Polygons: any = null;
      try {
        adm1Polygons = await queryFeatureServerLayer(ADM1_FEATURESERVER, iso3, '*', 'iso3');
      } catch (e:any) {
        adm1Polygons = null;
      }
      if (adm1Polygons?.type === 'FeatureCollection') {
        adm1Polygons = simplify(adm1Polygons, { tolerance: 0.01, highQuality: false, mutate: true });
      }

      // Also convert ADM1 polygons to lines for the outline overlay
      if (adm1Polygons?.features) {
        const adm1Lines: any[] = [];
        for (const feature of adm1Polygons.features) {
          const line = polygonToLine(feature);
          if (line.type === 'FeatureCollection') {
            for (const f of line.features) {
              f.properties = { adm1_pcode: feature.properties?.adm1_pcode };
              adm1Lines.push(f);
            }
          } else {
            line.properties = { adm1_pcode: feature.properties?.adm1_pcode };
            adm1Lines.push(line);
          }
        }
        adm1 = { type: 'FeatureCollection', features: adm1Lines };
      }

      return { adm1, adm2, adm1Polygons };
    } else {
      try {
        adm1 = await queryFeatureServerLayer(ADM1_FEATURESERVER, iso3, '*', 'iso3');
      } catch (e:any) {
        adm1 = { error: String(e) };
      }
      if (adm1?.type === 'FeatureCollection') adm1 = simplify(adm1, { tolerance: 0.01, highQuality: false, mutate: true });
      adm2 = { type: 'FeatureCollection', features: [] };
    }
    return { adm1, adm2 };
  }

}

export { ADM1_MAPSERVER, ADM2_MAPSERVER, ADM1_FEATURESERVER, ADM2_FEATURESERVER };
