import { calculerBulletin, ParametresPaie } from './calcul-paie';

const PARAMS: ParametresPaie = {
  cotisationSalarialeBp: 5500, // 55 %
  impotBp: 1000,               // 10 %
  heuresSupBp: 5000,           // +50 %
  minutesMensuelles: 12480,    // 26 j × 8 h × 60
};

describe('calculerBulletin', () => {
  it('calcule brut = base, cotisations, impôt sur (brut − cotisations), net', () => {
    const r = calculerBulletin(100_000n, PARAMS);
    // brut = 100 000 ; cotis = 55 000 ; impôt = 45 000 × 10 % = 4 500 ; net = 40 500
    expect(r.brutCentimes).toBe(100_000n);
    expect(r.cotisationsCentimes).toBe(55_000n);
    expect(r.impotsCentimes).toBe(4_500n);
    expect(r.netCentimes).toBe(40_500n);
  });

  it('ajoute primes et retenues correctement', () => {
    const r = calculerBulletin(100_000n, PARAMS, {
      primesCentimes: 10_000, retenuesCentimes: 5_000,
    });
    // brut = 110 000 ; cotis = 60 500 ; base impôt = 49 500 → impôt 4 950 ; net = 110000-60500-4950-5000 = 39 550
    expect(r.brutCentimes).toBe(110_000n);
    expect(r.netCentimes).toBe(39_550n);
  });

  it('calcule les heures sup majorées de heuresSupBp', () => {
    // 60 min HS : 100 000 × 60 × 15000 / (12480 × 10000) = 721 (arrondi bigint)
    const r = calculerBulletin(100_000n, PARAMS, { heuresSupMinutes: 60 });
    expect(r.heuresSupCentimes).toBe(721n);
    expect(r.heuresSupMinutes).toBe(60);
    expect(r.brutCentimes).toBe(100_721n);
  });

  it('plafonne le net à 0 si retenues > brut', () => {
    const r = calculerBulletin(10_000n, PARAMS, { retenuesCentimes: 1_000_000 });
    expect(r.netCentimes).toBe(0n);
  });

  it('gère un salaire de base nul sans division par zéro', () => {
    const r = calculerBulletin(0n, PARAMS, { heuresSupMinutes: 120 });
    expect(r.brutCentimes).toBe(0n);
    expect(r.netCentimes).toBe(0n);
  });

  it('aucun taux → net = brut − retenues', () => {
    const r = calculerBulletin(50_000n, {
      cotisationSalarialeBp: 0, impotBp: 0, heuresSupBp: 0, minutesMensuelles: 12480,
    }, { retenuesCentimes: 2_000 });
    expect(r.netCentimes).toBe(48_000n);
  });
});
