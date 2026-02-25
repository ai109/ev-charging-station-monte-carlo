export class RNG {
  private state: number;

  // Mulberry32 - fast, decent for simulation
  constructor(seed: number) {
    // force to uint32
    this.state = seed >>> 0;
  }

  nextU32(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  // Uniform [0,1)
  uniform(): number {
    return this.nextU32() / 4294967296; // 2^32
  }

  // Uniform [a,b)
  uniformRange(a: number, b: number): number {
    return a + (b - a) * this.uniform();
  }

  // Standard normal via Box-Muller
  normal01(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = this.uniform();
    while (v === 0) v = this.uniform();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  normal(mean: number, std: number): number {
    return mean + std * this.normal01();
  }

  // Exponential with rate lambda (events per unit time)
  exponential(lambda: number): number {
    if (lambda <= 0) return Infinity;
    let u = 0;
    while (u === 0) u = this.uniform();
    return -Math.log(u) / lambda;
  }

  // Poisson via Knuth (ok for small lambda; we’ll use per-hour small-ish)
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= this.uniform();
    } while (p > L);
    return k - 1;
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const x of arr) s += x;
  return s / arr.length;
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}
