type Game = { id: number; numbers: number[] };
type PrizeBand = 11 | 12 | 13 | 14 | 15;
type HistoricalContest = {
  number: number;
  date: string;
  numbers: number[];
  prizes: Record<PrizeBand, number>;
};
type AnalysisRequest = {
  games: Game[];
  contests: HistoricalContest[];
  unitPrice: number;
};
type HitBucket = { games: number; winningTickets: number; prize: number };
type AnalysisResult = {
  contests: number;
  averagePrizes: Record<PrizeBand, number>;
  costPerContest: number;
  totalCost: number;
  totalPrize: number;
  net: number;
  roi: number;
  profitableContests: number;
  hitSummary: HitBucket[];
  bestContest: { number: number; net: number } | null;
  worstContest: { number: number; net: number } | null;
};

const PRIZE_BANDS: PrizeBand[] = [11, 12, 13, 14, 15];

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - index + 1)) / index;
  }
  return Math.round(result);
}

function analyze(
  games: Game[],
  contests: HistoricalContest[],
  unitPrice: number,
): AnalysisResult {
  const hitSummary = Array.from({ length: 16 }, () => ({
    games: 0,
    winningTickets: 0,
    prize: 0,
  }));
  const ticketCount = games[0] ? choose(games[0].numbers.length, 15) : 0;
  const costPerContest = games.length * ticketCount * unitPrice;
  const prizeTotals: Record<PrizeBand, number> = { 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };
  let totalPrize = 0;
  let profitableContests = 0;
  let bestContest: AnalysisResult['bestContest'] = null;
  let worstContest: AnalysisResult['worstContest'] = null;

  for (const contest of contests) {
    for (const band of PRIZE_BANDS) prizeTotals[band] += contest.prizes[band];
    const drawn = new Uint8Array(26);
    for (const number of contest.numbers) drawn[number] = 1;
    let contestPrize = 0;

    for (const game of games) {
      let hits = 0;
      for (const number of game.numbers) hits += drawn[number];
      const bucket = hitSummary[hits];
      if (!bucket) continue;

      bucket.games += 1;
      for (const band of PRIZE_BANDS) {
        const winningTickets =
          choose(hits, band) * choose(game.numbers.length - hits, 15 - band);
        if (winningTickets === 0) continue;
        const prize = winningTickets * contest.prizes[band];
        bucket.winningTickets += winningTickets;
        bucket.prize += prize;
        contestPrize += prize;
      }
    }

    totalPrize += contestPrize;
    const net = contestPrize - costPerContest;
    if (net > 0) profitableContests += 1;
    if (!bestContest || net > bestContest.net) {
      bestContest = { number: contest.number, net };
    }
    if (!worstContest || net < worstContest.net) {
      worstContest = { number: contest.number, net };
    }
  }

  const totalCost = costPerContest * contests.length;
  const net = totalPrize - totalCost;
  const averagePrizes = { ...prizeTotals };
  for (const band of PRIZE_BANDS) {
    averagePrizes[band] /= contests.length;
  }
  return {
    contests: contests.length,
    averagePrizes,
    costPerContest,
    totalCost,
    totalPrize,
    net,
    roi: totalCost > 0 ? (net / totalCost) * 100 : 0,
    profitableContests,
    hitSummary,
    bestContest,
    worstContest,
  };
}

const workerGlobal = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (result: AnalysisResult) => void;
};

workerGlobal.onmessage = (event) => {
  const { games, contests, unitPrice } = event.data;
  workerGlobal.postMessage(analyze(games, contests, unitPrice));
};
