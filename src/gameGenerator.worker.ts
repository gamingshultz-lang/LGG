type Model = 'balanced' | 'diversified' | 'random';
type Game = { id: number; numbers: number[] };
type GeneratorRequest = { quantity: number; count: number; model: Model };

function pickNumbers(count: number): number[] {
  const numbers = Array.from({ length: 25 }, (_, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }
  return numbers.slice(0, count).sort((a, b) => a - b);
}

function balancedScore(numbers: number[]): number {
  const odds = numbers.filter((number) => number % 2 !== 0).length;
  const low = numbers.filter((number) => number <= 13).length;
  const sum = numbers.reduce((total, number) => total + number, 0);
  const expectedOdds = numbers.length / 2;
  const expectedLow = (numbers.length * 13) / 25;
  const expectedSum = (numbers.length * 26) / 2;
  return (
    Math.abs(odds - expectedOdds) * 2 +
    Math.abs(low - expectedLow) * 1.5 +
    Math.abs(sum - expectedSum) / 14
  );
}

function createGames(quantity: number, count: number, model: Model): Game[] {
  const games: Game[] = [];
  const used = new Set<string>();
  const numberFrequency = new Uint32Array(25);

  for (let gameIndex = 0; gameIndex < quantity; gameIndex += 1) {
    let best: number[] | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    const attempts = model === 'random' ? 1 : 28;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const candidate = pickNumbers(count);
      const key = candidate.join(',');
      if (used.has(key)) continue;

      let score = model === 'balanced' ? balancedScore(candidate) : 0;
      if (model === 'diversified') {
        score = candidate.reduce((total, number) => total + numberFrequency[number - 1], 0);
        score += Math.random() * 0.1;
      }

      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (model === 'random') break;
    }

    if (!best) {
      let fallback: number[];
      let key: string;
      do {
        fallback = pickNumbers(count);
        key = fallback.join(',');
      } while (used.has(key));
      best = fallback;
    }

    used.add(best.join(','));
    for (const number of best) numberFrequency[number - 1] += 1;
    games.push({ id: gameIndex + 1, numbers: best });
  }

  return games;
}

const workerGlobal = self as unknown as {
  onmessage: ((event: MessageEvent<GeneratorRequest>) => void) | null;
  postMessage: (games: Game[]) => void;
};

workerGlobal.onmessage = (event) => {
  const { quantity, count, model } = event.data;
  workerGlobal.postMessage(createGames(quantity, count, model));
};
