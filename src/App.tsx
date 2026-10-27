import { useEffect, useMemo, useRef, useState } from 'react';

type Model = 'balanced' | 'diversified' | 'random';
type Game = { id: number; numbers: number[] };
type PrizeBand = 11 | 12 | 13 | 14 | 15;
type GameResult = { hits: number; prize: number; winningTickets: number };
type ContestInfo = { number: number; date: string };
type CaixaPrize = { faixa?: number; descricaoFaixa?: string; valorPremio?: number };
type CaixaContest = {
  numero?: number;
  dataApuracao?: string;
  listaDezenas?: string[];
  listaRateioPremio?: CaixaPrize[];
};
type HistoricalContest = {
  number: number;
  date: string;
  numbers: number[];
  prizes: Record<PrizeBand, number>;
};
type BacktestHitBucket = { games: number; winningTickets: number; prize: number };
type BacktestResult = {
  contests: number;
  averagePrizes: Record<PrizeBand, number>;
  costPerContest: number;
  totalCost: number;
  totalPrize: number;
  net: number;
  roi: number;
  profitableContests: number;
  hitSummary: BacktestHitBucket[];
  bestContest: { number: number; net: number } | null;
  worstContest: { number: number; net: number } | null;
};

const BASE_PRICE = 3.5;
const MAX_GAMES = 10_000;
const GAME_LIST_HEIGHT = 510;
const GAME_CARD_HEIGHT = 104;
const GAME_ROW_GAP = 9;
const GAME_ROW_SIZE = GAME_CARD_HEIGHT + GAME_ROW_GAP;
const GAME_LIST_OVERSCAN = 2;
const PRIZE_BANDS: PrizeBand[] = [11, 12, 13, 14, 15];
const PRIZE_LABELS: Record<PrizeBand, string> = {
  11: '11 acertos',
  12: '12 acertos',
  13: '13 acertos',
  14: '14 acertos',
  15: '15 acertos',
};

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - i + 1)) / i;
  return Math.round(result);
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseDraw(value: string): number[] | null {
  const parts = value.split(/[\s,;.-]+/).filter(Boolean);
  const numbers = parts.map(Number);
  if (
    numbers.length !== 15 ||
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 25) ||
    new Set(numbers).size !== 15
  ) {
    return null;
  }
  return numbers;
}

function getContestPrize(prizes: CaixaPrize[], band: PrizeBand): number | undefined {
  const prize = prizes.find((item) => {
    const descriptionBand = Number(item.descricaoFaixa?.match(/\d+/)?.[0]);
    return descriptionBand === band || item.faixa === 16 - band;
  })?.valorPremio;
  return typeof prize === 'number' && Number.isFinite(prize) && prize >= 0
    ? prize
    : undefined;
}

function calculateGameResult(
  game: Game,
  draw: number[],
  prizes: Record<PrizeBand, number>,
): GameResult {
  const hits = game.numbers.reduce(
    (total, number) => total + (draw.includes(number) ? 1 : 0),
    0,
  );
  let prize = 0;
  let winningTickets = 0;

  for (const band of PRIZE_BANDS) {
    const winningTicketsInBand =
      choose(hits, band) * choose(game.numbers.length - hits, 15 - band);
    winningTickets += winningTicketsInBand;
    prize += winningTicketsInBand * prizes[band];
  }

  return { hits, prize, winningTickets };
}

function getOfficialContest(
  contestNumber: number,
  data: CaixaContest,
): HistoricalContest | null {
  if (
    data.numero !== contestNumber ||
    !Array.isArray(data.listaDezenas) ||
    !Array.isArray(data.listaRateioPremio)
  ) {
    return null;
  }
  const numbers = parseDraw(data.listaDezenas.join(','));
  if (!numbers) return null;
  const contestPrizes = Object.fromEntries(
    PRIZE_BANDS.map((band) => [band, getContestPrize(data.listaRateioPremio!, band)]),
  ) as Partial<Record<PrizeBand, number>>;
  if (PRIZE_BANDS.some((band) => contestPrizes[band] === undefined)) return null;
  return {
    number: contestNumber,
    date: data.dataApuracao ?? '',
    numbers,
    prizes: contestPrizes as Record<PrizeBand, number>,
  };
}

function getTheoreticalExpectedValue(
  numberCount: number,
  unitPrice: number,
  prizes: Record<PrizeBand, number>,
) {
  const possibleDraws = choose(25, 15);
  let expectedPrizePerSimpleBet = 0;
  let winningDraws = 0;
  for (const band of PRIZE_BANDS) {
    const drawOutcomes = choose(15, band) * choose(10, 15 - band);
    winningDraws += drawOutcomes;
    expectedPrizePerSimpleBet += (drawOutcomes / possibleDraws) * prizes[band];
  }
  const simpleBetsPerGame = choose(numberCount, 15);
  const costPerGame = simpleBetsPerGame * unitPrice;
  const expectedPrizePerGame = simpleBetsPerGame * expectedPrizePerSimpleBet;
  return {
    expectedPrizePerGame,
    expectedNetPerGame: expectedPrizePerGame - costPerGame,
    roi: costPerGame > 0 ? ((expectedPrizePerGame - costPerGame) / costPerGame) * 100 : 0,
    chanceOfPrize: winningDraws / possibleDraws,
    expectedPrizePerSimpleBet,
    costPerGame,
  };
}

function Icon({
  name,
  size = 18,
}: {
  name: 'spark' | 'dice' | 'check' | 'download' | 'arrow' | 'info' | 'ticket' | 'plus' | 'refresh';
  size?: number;
}) {
  const shared = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  const paths = {
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    dice: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" /></>,
    check: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    ticket: <><path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3Z" /><path d="M13 5v2M13 11v2M13 17v2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function App() {
  const [quantity, setQuantity] = useState(8);
  const [numberCount, setNumberCount] = useState(15);
  const [model, setModel] = useState<Model>('diversified');
  const [generatedModel, setGeneratedModel] = useState<Model | null>(null);
  const [unitPrice, setUnitPrice] = useState(BASE_PRICE);
  const [games, setGames] = useState<Game[]>([]);
  const [drawText, setDrawText] = useState('');
  const [drawSubmitted, setDrawSubmitted] = useState<number[] | null>(null);
  const [contestNumber, setContestNumber] = useState('');
  const [contestInfo, setContestInfo] = useState<ContestInfo | null>(null);
  const [contestError, setContestError] = useState('');
  const [isLoadingContest, setIsLoadingContest] = useState(false);
  const [prizes, setPrizes] = useState<Record<PrizeBand, number>>({
    11: 6,
    12: 12,
    13: 30,
    14: 0,
    15: 0,
  });
  const [error, setError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [contestPrizeError, setContestPrizeError] = useState('');
  const [isOfficialPrizeRate, setIsOfficialPrizeRate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [backtestCount, setBacktestCount] = useState(25);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [backtestError, setBacktestError] = useState('');
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [listWidth, setListWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const gameListRef = useRef<HTMLDivElement>(null);
  const generationWorkerRef = useRef<Worker | null>(null);
  const contestRequestRef = useRef<AbortController | null>(null);
  const backtestRequestRef = useRef<AbortController | null>(null);
  const backtestWorkerRef = useRef<Worker | null>(null);
  const contestCacheRef = useRef(new Map<number, HistoricalContest>());
  const parsedDraw = useMemo(() => parseDraw(drawText), [drawText]);
  const ticketCount = choose(numberCount, 15);
  const selectedGameCost = unitPrice * ticketCount;
  const selectedBatchCost = selectedGameCost * quantity;
  const generatedNumberCount = games[0]?.numbers.length ?? numberCount;
  const gameTicketCount = choose(generatedNumberCount, 15);
  const gameCost = unitPrice * gameTicketCount;
  const totalCost = gameCost * games.length;
  const currentModel = {
    balanced: 'Equilibrado',
    diversified: 'Diversificado',
    random: 'Aleatório',
  }[generatedModel ?? model];
  const gameResults = useMemo(
    () =>
      drawSubmitted
        ? games.map((game) => calculateGameResult(game, drawSubmitted, prizes))
        : [],
    [drawSubmitted, games, prizes],
  );
  const totalPrize = gameResults.reduce((total, result) => total + result.prize, 0);
  const gamesWithHitsCount = gameResults.filter((result) => result.hits > 0).length;
  const winningGameCount = gameResults.filter((result) => result.winningTickets > 0).length;
  const totalWinningTickets = gameResults.reduce(
    (total, result) => total + result.winningTickets,
    0,
  );
  const finalBalance = totalPrize - totalCost;
  const theoreticalValue = useMemo(
    () =>
      getTheoreticalExpectedValue(
        generatedNumberCount,
        unitPrice,
        backtestResult?.averagePrizes ?? prizes,
      ),
    [backtestResult?.averagePrizes, generatedNumberCount, prizes, unitPrice],
  );
  const hitSummary = useMemo(() => {
    const summary = Array.from({ length: Math.min(generatedNumberCount, 15) + 1 }, (_, hits) => ({
      hits,
      games: 0,
      winningTickets: 0,
      prize: 0,
    }));
    for (const result of gameResults) {
      const bucket = summary[result.hits];
      if (!bucket) continue;
      bucket.games += 1;
      bucket.winningTickets += result.winningTickets;
      bucket.prize += result.prize;
    }
    return summary;
  }, [gameResults, generatedNumberCount]);
  const columns = listWidth < 560 ? 1 : 2;
  const totalRows = Math.ceil(games.length / columns);
  const firstVisibleRow = Math.max(
    0,
    Math.floor(scrollTop / GAME_ROW_SIZE) - GAME_LIST_OVERSCAN,
  );
  const lastVisibleRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + GAME_LIST_HEIGHT) / GAME_ROW_SIZE) + GAME_LIST_OVERSCAN,
  );
  const visibleRows = Array.from(
    { length: Math.max(0, lastVisibleRow - firstVisibleRow) },
    (_, offset) => {
      const rowIndex = firstVisibleRow + offset;
      return games.slice(rowIndex * columns, (rowIndex + 1) * columns);
    },
  );
  const firstVisibleGame = games.length
    ? Math.min(games.length, Math.floor(scrollTop / GAME_ROW_SIZE) * columns + 1)
    : 0;
  const lastVisibleGame = games.length
    ? Math.min(
        games.length,
        Math.ceil((scrollTop + GAME_LIST_HEIGHT) / GAME_ROW_SIZE) * columns,
      )
    : 0;

  useEffect(() => {
    const list = gameListRef.current;
    if (!list) return;

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      setListWidth((currentWidth) => {
        if ((nextWidth < 560) !== (currentWidth < 560)) {
          list.scrollTop = 0;
          setScrollTop(0);
        }
        return nextWidth;
      });
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => generationWorkerRef.current?.terminate(), []);
  useEffect(() => () => contestRequestRef.current?.abort(), []);
  useEffect(() => () => backtestRequestRef.current?.abort(), []);
  useEffect(() => () => backtestWorkerRef.current?.terminate(), []);
  useEffect(() => {
    generate();
  }, []);

  function generate() {
    generationWorkerRef.current?.terminate();
    backtestRequestRef.current?.abort();
    backtestWorkerRef.current?.terminate();
    backtestWorkerRef.current = null;
    setBacktestResult(null);
    setIsRunningBacktest(false);
    setBacktestProgress(0);
    setBacktestError('');
    setIsGenerating(true);
    setDrawSubmitted(null);
    setError('');
    setGenerationError('');
    setScrollTop(0);
    if (gameListRef.current) gameListRef.current.scrollTop = 0;

    try {
      const worker = new Worker(new URL('./gameGenerator.worker.ts', import.meta.url), {
        type: 'module',
      });
      generationWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<Game[]>) => {
        setGames(event.data);
        setGeneratedModel(model);
        setIsGenerating(false);
        generationWorkerRef.current = null;
        worker.terminate();
      };
      worker.onerror = (event) => {
        event.preventDefault();
        setGenerationError(`Falha ao gerar os jogos: ${event.message || 'erro no processo de geração.'}`);
        setIsGenerating(false);
        generationWorkerRef.current = null;
        worker.terminate();
      };
      worker.postMessage({ quantity, count: numberCount, model });
    } catch (generationError) {
      setGenerationError(
        generationError instanceof Error
          ? `Falha ao iniciar a geração: ${generationError.message}`
          : 'Falha ao iniciar a geração dos jogos.',
      );
      setIsGenerating(false);
      generationWorkerRef.current = null;
    }
  }

  function checkGames() {
    if (!parsedDraw) {
      setError('Informe 15 números diferentes, entre 1 e 25.');
      setDrawSubmitted(null);
      return;
    }
    setError('');
    setDrawSubmitted(parsedDraw);
    setContestNumber('');
    setContestInfo(null);
  }

  async function loadContest() {
    const normalizedContestNumber = contestNumber.trim();
    if (!/^\d{1,5}$/.test(normalizedContestNumber) || Number(normalizedContestNumber) < 1) {
      setContestError('Digite um número de concurso válido.');
      return;
    }

    contestRequestRef.current?.abort();
    const controller = new AbortController();
    contestRequestRef.current = controller;
    setIsLoadingContest(true);
    setContestError('');
    setContestPrizeError('');
    setError('');
    setBacktestResult(null);
    setDrawSubmitted(null);
    setDrawText('');
    setContestInfo(null);
    setIsOfficialPrizeRate(false);

    try {
      const response = await fetch(
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil/${normalizedContestNumber}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'Concurso não encontrado. Confira o número e tente novamente.'
            : `A Caixa retornou o erro ${response.status} ao consultar o concurso.`,
        );
      }

      const data = (await response.json()) as CaixaContest;
      if (
        data.numero !== Number(normalizedContestNumber) ||
        !Array.isArray(data.listaDezenas)
      ) {
        throw new Error('A resposta da Caixa não contém um resultado válido para esse concurso.');
      }

      const result = parseDraw(data.listaDezenas.join(','));
      if (!result) {
        throw new Error('O concurso foi localizado, mas as dezenas sorteadas são inválidas.');
      }

      setDrawSubmitted(result);
      setDrawText(result.map((number) => String(number).padStart(2, '0')).join(', '));
      setContestNumber(String(data.numero));
      setContestInfo({ number: data.numero, date: data.dataApuracao ?? '' });
      const historicalContest = getOfficialContest(data.numero, data);
      if (historicalContest) contestCacheRef.current.set(data.numero, historicalContest);

      const officialPrizes = data.listaRateioPremio ?? [];
      const officialPrizeValues = PRIZE_BANDS.map((band) => getContestPrize(officialPrizes, band));
      if (officialPrizeValues.every((value) => value !== undefined)) {
        const nextPrizes = { ...prizes };
        PRIZE_BANDS.forEach((band, index) => {
          const value = officialPrizeValues[index];
          if (value !== undefined) nextPrizes[band] = value;
        });
        setPrizes(nextPrizes);
        setIsOfficialPrizeRate(true);
        setContestPrizeError('');
      } else {
        setIsOfficialPrizeRate(false);
        setContestPrizeError(
          'O resultado foi encontrado, mas o rateio oficial não está disponível. Informe os valores manualmente.',
        );
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setContestError(
        loadError instanceof Error
          ? loadError.message
          : 'Não foi possível consultar esse concurso. Tente novamente.',
      );
    } finally {
      if (contestRequestRef.current === controller) {
        contestRequestRef.current = null;
        setIsLoadingContest(false);
      }
    }
  }

  async function fetchOfficialContest(
    contestNumberToFetch: number,
    signal: AbortSignal,
  ): Promise<HistoricalContest> {
    const cached = contestCacheRef.current.get(contestNumberToFetch);
    if (cached) return cached;

    const response = await fetch(
      `https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil/${contestNumberToFetch}`,
      { signal },
    );
    if (!response.ok) {
      throw new Error(
        `Não foi possível carregar o concurso ${contestNumberToFetch} (erro ${response.status}).`,
      );
    }

    const data = (await response.json()) as CaixaContest;
    const contest = getOfficialContest(contestNumberToFetch, data);
    if (!contest) {
      throw new Error(`O concurso ${contestNumberToFetch} não retornou dezenas e rateio válidos.`);
    }
    contestCacheRef.current.set(contestNumberToFetch, contest);
    return contest;
  }

  async function runBacktest() {
    if (games.length === 0) {
      setBacktestError('Gere os jogos antes de iniciar a análise.');
      return;
    }

    backtestRequestRef.current?.abort();
    backtestWorkerRef.current?.terminate();
    const controller = new AbortController();
    backtestRequestRef.current = controller;
    setIsRunningBacktest(true);
    setBacktestProgress(0);
    setBacktestError('');
    setBacktestResult(null);
    let analysisWorker: Worker | null = null;

    try {
      let endContestNumber = contestInfo?.number;
      if (!endContestNumber) {
        const latestResponse = await fetch(
          'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil',
          { signal: controller.signal },
        );
        if (!latestResponse.ok) {
          throw new Error(`A Caixa retornou o erro ${latestResponse.status} ao consultar o último concurso.`);
        }
        const latestData = (await latestResponse.json()) as CaixaContest;
        endContestNumber = latestData.numero;
        if (!endContestNumber) {
          throw new Error('A Caixa não informou o número do concurso mais recente.');
        }
        const latestContest = getOfficialContest(endContestNumber, latestData);
        if (!latestContest) {
          throw new Error('O último concurso não retornou dezenas e rateio válidos.');
        }
        contestCacheRef.current.set(endContestNumber, latestContest);
      }

      const contestNumbers = Array.from(
        { length: backtestCount },
        (_, index) => endContestNumber! - index,
      ).filter((number) => number > 0);
      const contests: HistoricalContest[] = [];
      const batchSize = 3;

      for (let index = 0; index < contestNumbers.length; index += batchSize) {
        const batch = contestNumbers.slice(index, index + batchSize);
        const results = await Promise.all(
          batch.map((number) => fetchOfficialContest(number, controller.signal)),
        );
        contests.push(...results);
        setBacktestProgress(contests.length);
      }

      contests.sort((left, right) => left.number - right.number);
      const worker = new Worker(new URL('./historicalAnalysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      analysisWorker = worker;
      backtestWorkerRef.current = worker;
      const result = await new Promise<BacktestResult>((resolve, reject) => {
        const handleAbort = () => reject(new DOMException('Análise cancelada.', 'AbortError'));
        controller.signal.addEventListener('abort', handleAbort, { once: true });
        worker.onmessage = (event: MessageEvent<BacktestResult>) => {
          controller.signal.removeEventListener('abort', handleAbort);
          resolve(event.data);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          controller.signal.removeEventListener('abort', handleAbort);
          reject(new Error(event.message || 'Falha ao calcular o backtest.'));
        };
        worker.postMessage({ games, contests, unitPrice });
      });
      if (controller.signal.aborted) return;
      setBacktestResult(result);
    } catch (backtestFailure) {
      if (backtestFailure instanceof DOMException && backtestFailure.name === 'AbortError') return;
      controller.abort();
      setBacktestError(
        backtestFailure instanceof Error
          ? backtestFailure instanceof TypeError
            ? 'A Caixa não respondeu. Verifique a conexão, aguarde um pouco e tente novamente.'
            : backtestFailure.message
          : 'Não foi possível concluir o backtest.',
      );
    } finally {
      analysisWorker?.terminate();
      if (backtestWorkerRef.current === analysisWorker) {
        backtestWorkerRef.current = null;
      }
      if (backtestRequestRef.current === controller) {
        backtestRequestRef.current = null;
        setIsRunningBacktest(false);
      }
    }
  }

  function exportGames() {
    const data = {
      loteria: 'Lotofácil',
      geradoEm: new Date().toISOString(),
      estrategia: currentModel,
      quantidadeDeApostas: games.length,
      numerosPorAposta: generatedNumberCount,
      precoDaApostaSimples: unitPrice,
      custoPorJogo: gameCost,
      custoTotal: totalCost,
      resultadoConferido: drawSubmitted,
      concurso: contestInfo?.number ?? null,
      dataApuracao: contestInfo?.date || null,
      premiosPorFaixa: prizes,
      resumo:
        drawSubmitted && gameResults.length
          ? {
              custoTotal: totalCost,
              premioTotal: totalPrize,
              saldoFinal: finalBalance,
              jogosPremiados: winningGameCount,
              jogosComAcertos: gamesWithHitsCount,
              apostasPremiadas: totalWinningTickets,
              resumoPorAcertos: hitSummary,
            }
          : null,
      jogos: games.map((game, index) => {
        const result = gameResults[index];
        return {
          jogo: game.id,
          numeros: game.numbers,
          acertos: result?.hits ?? null,
          apostasPremiadas: result?.winningTickets ?? null,
          premio: result?.prize ?? null,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lotofacil-jogos.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="LotoLab início">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span className="brand-copy"><strong>loto<span>lab</span></strong><small>LOTOFÁCIL</small></span>
        </a>
        <nav className="topnav" aria-label="Navegação principal">
          <a className="active" href="#gerador">Gerador</a>
          <a href="#conferir">Conferir jogos</a>
          <a href="#metodo">Como funciona</a>
        </nav>
        <div className="topbar-right"><span className="live-dot" />LOTOFÁCIL</div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> LOTOFÁCIL</div>
            <h1>Monte seus jogos<br /><span>da Lotofácil.</span></h1>
            <p>Escolha como gerar as combinações, confira os resultados e acompanhe o custo antes de apostar.</p>
            <a className="hero-link" href="#gerador">Ir para o gerador <Icon name="arrow" size={16} /></a>
          </div>
        </section>

        <section className="workspace" id="gerador">
          <aside className="settings-column">
            <div className="section-heading">
              <div><span className="section-kicker">GERADOR</span><h2>Monte seus jogos</h2></div>
              <span className="step-count">01</span>
            </div>

            <div className="control-card">
              <label className="field-label" htmlFor="quantity">Quantidade de jogos</label>
              <div className="stepper">
                <button type="button" disabled={isGenerating} aria-label="Diminuir quantidade" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                <input id="quantity" type="number" min={1} max={MAX_GAMES} disabled={isGenerating} value={quantity} onChange={(event) => setQuantity(Math.min(MAX_GAMES, Math.max(1, Number(event.target.value) || 1)))} />
                <button type="button" disabled={isGenerating} aria-label="Aumentar quantidade" onClick={() => setQuantity(Math.min(MAX_GAMES, quantity + 1))}><Icon name="plus" size={15} /></button>
              </div>
              <div className="field-hint">Gere de 1 a {MAX_GAMES.toLocaleString('pt-BR')} combinações por vez.</div>

              <label className="field-label spaced-label" htmlFor="model">Modelo matemático</label>
              <div className="select-wrap">
                <select id="model" disabled={isGenerating} value={model} onChange={(event) => setModel(event.target.value as Model)}>
                  <option value="diversified">Cobertura diversificada</option>
                  <option value="balanced">Distribuição equilibrada</option>
                  <option value="random">Aleatório</option>
                </select>
                <span className="select-caret">⌄</span>
              </div>
              <div className="model-note">
                <Icon name="info" size={15} />
                <span>{model === 'diversified'
                  ? 'Distribui a frequência das dezenas para reduzir repetições no lote.'
                  : model === 'balanced'
                    ? 'Favorece equilíbrio entre pares/ímpares, baixas/altas e soma.'
                    : 'Sorteia cada combinação sem filtros além de evitar jogos repetidos.'}</span>
              </div>

              <div className="inline-fields">
                <div>
                  <label className="field-label" htmlFor="numberCount">Dezenas por jogo</label>
                  <div className="select-wrap compact-select">
                    <select id="numberCount" disabled={isGenerating} value={numberCount} onChange={(event) => setNumberCount(Number(event.target.value))}>
                      {Array.from({ length: 6 }, (_, index) => index + 15).map((count) => <option key={count} value={count}>{count} dezenas</option>)}
                    </select>
                    <span className="select-caret">⌄</span>
                  </div>
                </div>
                <div>
                  <label className="field-label" htmlFor="unitPrice">Aposta simples</label>
                  <div className="price-input"><span>R$</span><input id="unitPrice" type="number" min={0} step={0.5} disabled={isGenerating} value={unitPrice} onChange={(event) => setUnitPrice(Math.max(0, Number(event.target.value) || 0))} /></div>
                </div>
              </div>
              <div className="field-hint price-hint">Valor editável por combinação de 15 dezenas.</div>

              <div className="cost-preview">
                <div><span>Custo por jogo</span><strong>{formatCurrency(selectedGameCost)}</strong></div>
                <div><span>Investimento do lote</span><strong className="total-cost">{formatCurrency(selectedBatchCost)}</strong></div>
                {ticketCount > 1 && <small>{ticketCount} combinações simples por jogo de {numberCount} dezenas</small>}
              </div>

              {generationError && <div className="error-message" role="alert">{generationError}</div>}
              <button className="primary-button" type="button" onClick={generate} disabled={isGenerating}>
                <Icon name={isGenerating ? 'refresh' : 'spark'} size={17} />
                {isGenerating ? 'Gerando jogos...' : `Gerar ${quantity} ${quantity === 1 ? 'jogo' : 'jogos'}`}
              </button>
            </div>

            <div className="method-card">
              <span className="method-icon"><Icon name="dice" size={17} /></span>
              <div><strong>Combinações, não previsões</strong><p>Cada combinação simples tem a mesma chance. Mais jogos cobrem mais combinações, mas também aumentam o custo.</p></div>
            </div>
          </aside>

          <section className="games-column" aria-label="Jogos gerados">
            <div className="games-header">
              <div className="section-heading games-title">
                <div><span className="section-kicker">SUAS APOSTAS</span><h2>Jogos gerados <span className="count-badge">{games.length}</span></h2></div>
              </div>
              <button className="secondary-button" type="button" onClick={exportGames} disabled={isGenerating || !games.length}><Icon name="download" size={16} /> Exportar JSON</button>
            </div>
            <div className="games-summary">
              <span><span className="summary-dot" /> Método: <strong>{currentModel}</strong></span>
              <span><Icon name="ticket" size={15} /> {games.length * gameTicketCount} combinações simples</span>
              <span className="summary-range">{games.length ? `${firstVisibleGame}–${lastVisibleGame} de ${games.length} jogos` : 'Nenhum jogo gerado'}</span>
              <span className="summary-total">Total <strong>{formatCurrency(totalCost)}</strong></span>
            </div>

            <div
              className="game-list"
              ref={gameListRef}
              role="region"
              aria-label="Lista de jogos gerados"
              aria-busy={isGenerating}
              tabIndex={0}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              {games.length ? (
                <div
                  className="game-list-spacer"
                  style={{ height: Math.max(0, totalRows * GAME_ROW_SIZE - GAME_ROW_GAP) }}
                >
                  <div
                    className="game-list-window"
                    style={{ transform: `translateY(${firstVisibleRow * GAME_ROW_SIZE}px)` }}
                  >
                    {visibleRows.map((row, rowOffset) => (
                      <div className={`game-row ${columns === 1 ? 'one-column' : 'two-columns'}`} key={firstVisibleRow + rowOffset}>
                        {row.map((game) => {
                          const result = drawSubmitted ? gameResults[game.id - 1] : null;
                          return (
                            <article className={`game-card${result && result.prize > 0 ? ' winner-card' : ''}`} key={game.id}>
                              <div className="game-card-head">
                                <div className="game-name"><span className="ticket-icon"><Icon name="ticket" size={15} /></span><strong>Jogo {String(game.id).padStart(2, '0')}</strong><span className="game-meta">{game.numbers.length} dezenas</span></div>
                                <span className="game-price">{formatCurrency(gameCost)}</span>
                              </div>
                              <div className="number-grid" aria-label={`Números escolhidos do jogo ${game.id}`}>
                                {Array.from({ length: 25 }, (_, index) => index + 1).map((number) => {
                                  const selected = game.numbers.includes(number);
                                  const matched = Boolean(selected && drawSubmitted?.includes(number));
                                  return <span key={number} className={`number-ball${selected ? ' selected' : ''}${matched ? ' matched' : ''}`} title={`${String(number).padStart(2, '0')}${selected ? ' — selecionado' : ''}${matched ? ' — sorteado' : ''}`}>{String(number).padStart(2, '0')}</span>;
                                })}
                              </div>
                              <div className="game-card-foot">
                                <span>{game.numbers.length} dezenas selecionadas</span>
                                {result
                                  ? <>
                                      <span>{result.hits} dezenas sorteadas · {result.winningTickets} premiadas</span>
                                      <strong className={`game-prize-total${result.prize > 0 ? ' prize-pill' : ''}`}>Prêmio {formatCurrency(result.prize)}</strong>
                                    </>
                                  : <span className="waiting-pill">Aguardando conferência</span>}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="game-empty">{isGenerating ? 'Preparando suas combinações...' : 'Defina a quantidade e gere os jogos para começar.'}</div>
              )}
            </div>
          </section>
        </section>

        <section className="check-section" id="conferir">
          <div className="check-intro">
            <span className="section-kicker">CONFERÊNCIA</span>
            <h2>Confira seus jogos</h2>
            <p>Digite o número do concurso para carregar o resultado e o rateio oficiais.</p>
          </div>
          <div className="check-panel">
            <div className="draw-input-area">
              <label className="field-label" htmlFor="contestNumber">Número do concurso</label>
              <div className="contest-lookup">
                <input
                  id="contestNumber"
                  type="number"
                  min={1}
                  max={99999}
                  placeholder="Ex.: 3814"
                  value={contestNumber}
                  disabled={isLoadingContest}
                  onChange={(event) => {
                    setContestNumber(event.target.value);
                    setContestError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void loadContest();
                  }}
                />
                <button className="primary-button" type="button" onClick={() => void loadContest()} disabled={isLoadingContest}>
                  <Icon name={isLoadingContest ? 'refresh' : 'check'} size={16} />
                  {isLoadingContest ? 'Buscando...' : 'Buscar concurso'}
                </button>
              </div>
              {contestError && <div className="error-message" role="alert">{contestError}</div>}
              {contestInfo && (
                <div className="contest-loaded" role="status">
                  <Icon name="check" size={14} />
                  Concurso {contestInfo.number}{contestInfo.date ? ` · ${contestInfo.date}` : ''} carregado
                </div>
              )}
              {drawSubmitted && (
                <div className="loaded-numbers">
                  <span className="field-label">Dezenas sorteadas</span>
                  {drawSubmitted.map((number) => (
                    <span key={number}>{String(number).padStart(2, '0')}</span>
                  ))}
                </div>
              )}
              <details className="manual-draw">
                <summary>Ou informar o resultado manualmente</summary>
                <label className="field-label" htmlFor="drawNumbers">15 dezenas sorteadas</label>
                <textarea id="drawNumbers" rows={2} placeholder="Ex.: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15" value={drawText} onChange={(event) => {
                  setDrawText(event.target.value);
                  setDrawSubmitted(null);
                  setContestNumber('');
                  setContestInfo(null);
                  setIsOfficialPrizeRate(false);
                  setContestPrizeError('');
                  setError('');
                }} />
                <div className={`input-status${drawText && parsedDraw ? ' valid' : ''}`}>{drawText && parsedDraw ? <><Icon name="check" size={14} /> 15 dezenas válidas</> : 'Separe os números por vírgula ou espaço (01–25).'}</div>
                {error && <div className="error-message" role="alert">{error}</div>}
                <button className="primary-button check-button" type="button" onClick={checkGames}><Icon name="check" size={17} /> Conferir manualmente</button>
              </details>
            </div>
            <div className="prize-area">
              <div className="prize-heading"><div><span className="section-kicker">RATEIO DO CONCURSO</span><h3>Prêmio por faixa</h3></div><span className="edit-tag">{isOfficialPrizeRate ? 'RATEIO OFICIAL' : contestInfo ? 'EDITADO' : 'EDITÁVEL'}</span></div>
              <div className="prize-fields">
                {PRIZE_BANDS.map((band) => (
                  <label key={band} className="prize-field" htmlFor={`prize-${band}`}>
                    <span>{PRIZE_LABELS[band]}</span>
                    <span className="prize-value"><small>R$</small><input id={`prize-${band}`} type="number" min={0} step={band <= 13 ? 1 : 100} value={prizes[band]} onChange={(event) => {
                      setPrizes({ ...prizes, [band]: Math.max(0, Number(event.target.value) || 0) });
                      setIsOfficialPrizeRate(false);
                    }} /></span>
                  </label>
                ))}
              </div>
              <p className="prize-footnote">{contestPrizeError || (isOfficialPrizeRate ? 'Valores carregados do rateio oficial da Caixa. Você pode editá-los se necessário.' : contestInfo ? 'Resultado oficial carregado. Os valores do rateio foram editados manualmente.' : 'Sem rateio oficial carregado: informe os valores do concurso para calcular os prêmios.')}</p>
            </div>
          </div>
          {drawSubmitted && (
            <div className="check-result-bar" role="status">
              <div><span className="success-check"><Icon name="check" size={17} /></span><strong>Conferência concluída</strong><span>Resultado aplicado aos {games.length} jogos.</span></div>
              <button type="button" className="text-button" onClick={() => { setDrawSubmitted(null); setDrawText(''); }}>Limpar resultado <Icon name="refresh" size={14} /></button>
            </div>
          )}
        </section>

        {drawSubmitted && (
          <section className="final-result" aria-label="Resultado final da conferência">
            <div className="final-result-heading">
              <div>
                <span className="section-kicker">RESULTADO FINAL</span>
                <h2>{contestInfo ? `Concurso ${contestInfo.number}` : 'Resumo da conferência'}{contestInfo?.date ? ` · ${contestInfo.date}` : ''}</h2>
              </div>
              <span className="result-games-count">{winningGameCount} de {games.length} jogos premiados</span>
            </div>
            <div className="final-totals">
              <div><span>Jogos com acertos</span><strong>{gamesWithHitsCount.toLocaleString('pt-BR')} de {games.length.toLocaleString('pt-BR')}</strong></div>
              <div><span>Jogos premiados (11+)</span><strong>{winningGameCount.toLocaleString('pt-BR')}</strong></div>
              <div><span>Valor apostado</span><strong>{formatCurrency(totalCost)}</strong></div>
              <div><span>Prêmios recebidos</span><strong>{formatCurrency(totalPrize)}</strong></div>
              <div className={finalBalance >= 0 ? 'positive-balance' : 'negative-balance'}>
                <span>{finalBalance >= 0 ? 'Lucro / saldo positivo' : 'Prejuízo / saldo negativo'}</span>
                <strong>{formatCurrency(finalBalance)}</strong>
              </div>
            </div>
            <p className="balance-note">O saldo é calculado subtraindo o custo total dos prêmios apurados nos jogos.</p>
            <div className="hit-breakdown">
              <div className="hit-breakdown-heading">
                <h3>Jogos separados por acertos</h3>
                <span>{games.length.toLocaleString('pt-BR')} jogos conferidos</span>
              </div>
              <div className="hit-breakdown-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Acertos</th>
                      <th scope="col">Jogos</th>
                      <th scope="col">Apostas premiadas</th>
                      <th scope="col">Prêmio total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hitSummary.map((summary) => (
                      <tr key={summary.hits} className={summary.winningTickets > 0 ? 'winning-tier' : ''}>
                        <th scope="row">{summary.hits} acertos</th>
                        <td>{summary.games.toLocaleString('pt-BR')}</td>
                        <td>{summary.winningTickets.toLocaleString('pt-BR')}</td>
                        <td>{formatCurrency(summary.prize)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="balance-note">Nas apostas com mais de 15 dezenas, uma aposta pode conter várias combinações premiadas de 15 dezenas.</p>
            </div>
          </section>
        )}

        {games.length > 0 && (
          <section className="strategy-analysis" aria-label="Análise matemática e backtest">
            <div className="analysis-heading">
              <div>
                <span className="section-kicker">EXPECTATIVA E HISTÓRICO</span>
                <h2>Essa estratégia dá retorno?</h2>
                <p>Compare o valor esperado matemático com o resultado real em concursos anteriores.</p>
              </div>
              <span className="analysis-model">{currentModel} · {games.length.toLocaleString('pt-BR')} jogos</span>
            </div>

            <div className="expected-value-panel">
              <div className="analysis-subheading">
                <div>
                  <h3>Valor esperado por concurso</h3>
                  <span>{backtestResult ? `Baseado no rateio médio dos últimos ${backtestResult.contests} concursos` : isOfficialPrizeRate ? `Usando o rateio oficial do concurso ${contestInfo?.number}` : 'Usando os valores de prêmio informados manualmente'}</span>
                </div>
                <span className="probability-note">{(theoreticalValue.chanceOfPrize * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de chance de prêmio por combinação simples</span>
              </div>
              <div className="expected-value-stats">
                <div><span>Custo dos jogos</span><strong>{formatCurrency(theoreticalValue.costPerGame * games.length)}</strong></div>
                <div><span>Prêmio esperado</span><strong>{formatCurrency(theoreticalValue.expectedPrizePerGame * games.length)}</strong></div>
                <div className={theoreticalValue.expectedNetPerGame >= 0 ? 'positive-balance' : 'negative-balance'}>
                  <span>Saldo esperado</span>
                  <strong>{formatCurrency(theoreticalValue.expectedNetPerGame * games.length)}</strong>
                </div>
                <div><span>Retorno estimado</span><strong>{theoreticalValue.roi.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong></div>
              </div>
              <p className="analysis-caveat">O valor esperado é uma média matemática, não uma previsão. As dezenas escolhidas não mudam as probabilidades; valores de 14 e 15 acertos podem variar ou acumular.</p>
            </div>

            <div className="backtest-panel">
              <div className="backtest-controls">
                <div>
                  <h3>Backtest nos concursos anteriores</h3>
                  <p>Reaplica os mesmos jogos nos resultados oficiais e soma o custo e os prêmios de cada concurso.</p>
                </div>
                <div className="backtest-actions">
                  <label className="sr-only" htmlFor="backtestCount">Quantidade de concursos</label>
                  <select id="backtestCount" value={backtestCount} disabled={isRunningBacktest} onChange={(event) => setBacktestCount(Number(event.target.value))}>
                    <option value={25}>25 concursos</option>
                    <option value={50}>50 concursos</option>
                    <option value={100}>100 concursos</option>
                  </select>
                  <button type="button" className="primary-button" onClick={() => void runBacktest()} disabled={isRunningBacktest || isGenerating}>
                    <Icon name={isRunningBacktest ? 'refresh' : 'dice'} size={16} />
                    {isRunningBacktest ? 'Analisando...' : 'Executar backtest'}
                  </button>
                </div>
              </div>

              {isRunningBacktest && (
                <div className="backtest-progress" role="status">
                  <div className="progress-track"><span style={{ width: `${backtestCount ? (backtestProgress / backtestCount) * 100 : 0}%` }} /></div>
                  <span>{backtestProgress} de {backtestCount} concursos carregados{backtestProgress === backtestCount ? ' · calculando resultados' : ''}</span>
                </div>
              )}
              {backtestError && <p className="backtest-error" role="alert">{backtestError}</p>}

              {backtestResult && (
                <div className="backtest-results">
                  <div className="backtest-result-heading">
                    <h3>Resultado do backtest</h3>
                    <span>{backtestResult.contests} concursos · {(backtestResult.contests * games.length).toLocaleString('pt-BR')} análises de jogo</span>
                  </div>
                  <div className="expected-value-stats backtest-stats">
                    <div><span>Total investido</span><strong>{formatCurrency(backtestResult.totalCost)}</strong></div>
                    <div><span>Prêmios históricos</span><strong>{formatCurrency(backtestResult.totalPrize)}</strong></div>
                    <div className={backtestResult.net >= 0 ? 'positive-balance' : 'negative-balance'}>
                      <span>{backtestResult.net >= 0 ? 'Lucro histórico' : 'Prejuízo histórico'}</span>
                      <strong>{formatCurrency(backtestResult.net)}</strong>
                    </div>
                    <div className={backtestResult.roi >= 0 ? 'positive-balance' : 'negative-balance'}>
                      <span>Retorno líquido</span>
                      <strong>{backtestResult.roi.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>
                    </div>
                  </div>
                  <div className="backtest-period-summary">
                    <span><strong>{backtestResult.profitableContests}</strong> de {backtestResult.contests} concursos deram saldo positivo</span>
                    {backtestResult.bestContest && <span>Melhor: <strong>#{backtestResult.bestContest.number}</strong> · {formatCurrency(backtestResult.bestContest.net)}</span>}
                    {backtestResult.worstContest && <span>Pior: <strong>#{backtestResult.worstContest.number}</strong> · {formatCurrency(backtestResult.worstContest.net)}</span>}
                  </div>
                  <div className="hit-breakdown backtest-breakdown">
                    <div className="hit-breakdown-heading">
                      <h3>Frequência de acertos no histórico</h3>
                      <span>{(backtestResult.contests * games.length).toLocaleString('pt-BR')} resultados de jogo</span>
                    </div>
                    <div className="hit-breakdown-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Acertos</th>
                            <th scope="col">Ocorrências</th>
                            <th scope="col">Apostas premiadas</th>
                            <th scope="col">Prêmio total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResult.hitSummary.slice(0, generatedNumberCount + 1).map((summary, hits) => (
                            <tr key={hits} className={summary.winningTickets > 0 ? 'winning-tier' : ''}>
                              <th scope="row">{hits} acertos</th>
                              <td>{summary.games.toLocaleString('pt-BR')}</td>
                              <td>{summary.winningTickets.toLocaleString('pt-BR')}</td>
                              <td>{formatCurrency(summary.prize)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="analysis-disclaimer">Backtest é uma avaliação retrospectiva: resultados passados não alteram as chances nem indicam lucro futuro. A API oficial da Caixa é necessária para carregar o histórico.</p>
          </section>
        )}

        <section className="responsible-note">
          <div className="responsible-icon"><Icon name="info" size={17} /></div>
          <div><strong>Jogue com responsabilidade</strong><p>Loterias envolvem risco e não são uma forma confiável de obter renda. Nenhum método de seleção prevê os resultados ou garante retorno financeiro. Aposte apenas o que pode perder.</p></div>
          <span className="note-number">25 <small>DEZENAS</small></span>
        </section>
      </main>
      <footer className="footer"><span>LOTOLAB <span className="footer-separator">/</span> GERADOR DE APOSTAS</span><span>Confira o custo antes de apostar.</span></footer>
    </div>
  );
}

export default App;
