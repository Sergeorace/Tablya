/**
 * Calcul de bulletin de paie — fonction pure, bigint uniquement.
 *
 * brut        = salaire de base + primes + heures sup
 * cotisations = brut × cotisationSalarialeBp / 10000
 * impôt       = (brut − cotisations) × impotBp / 10000
 * net         = brut − cotisations − impôt − retenues (plancher 0)
 *
 * Taux en points de base (5500 = 55 %) — jamais de float pour la paie.
 */
export interface ParametresPaie {
  cotisationSalarialeBp: number;
  impotBp: number;
  heuresSupBp: number;
  minutesMensuelles: number;
}

export interface OptionsBulletin {
  primesCentimes?: number;
  retenuesCentimes?: number;
  heuresSupMinutes?: number;
}

export interface BulletinCalcule {
  brutCentimes: bigint;
  cotisationsCentimes: bigint;
  impotsCentimes: bigint;
  primesCentimes: bigint;
  retenuesCentimes: bigint;
  heuresSupCentimes: bigint;
  heuresSupMinutes: number;
  netCentimes: bigint;
}

export function calculerBulletin(
  salaireBaseCentimes: bigint,
  params: ParametresPaie,
  opts: OptionsBulletin = {},
): BulletinCalcule {
  const primes = BigInt(opts.primesCentimes ?? 0);
  const retenues = BigInt(opts.retenuesCentimes ?? 0);
  const hsMinutes = BigInt(opts.heuresSupMinutes ?? 0);
  const hsCentimes = hsMinutes > 0n
    ? (salaireBaseCentimes * hsMinutes * BigInt(10000 + params.heuresSupBp))
      / (BigInt(params.minutesMensuelles) * 10000n)
    : 0n;
  const brut = salaireBaseCentimes + primes + hsCentimes;
  const cotisations = (brut * BigInt(params.cotisationSalarialeBp)) / 10000n;
  const impots = ((brut - cotisations) * BigInt(params.impotBp)) / 10000n;
  const net = brut - cotisations - impots - retenues;
  return {
    brutCentimes: brut,
    cotisationsCentimes: cotisations,
    impotsCentimes: impots,
    primesCentimes: primes,
    retenuesCentimes: retenues,
    heuresSupCentimes: hsCentimes,
    heuresSupMinutes: Number(hsMinutes),
    netCentimes: net < 0n ? 0n : net,
  };
}
