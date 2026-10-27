import { useEffect, useMemo, useRef, useState } from 'react';

type Model = 'balanced' | 'diversified' | 'random';
type Game = { id: number; numbers: number[] };
type PrizeBand = 11 | 12 | 13 | 14 | 15;

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
  const [unitPrice, setUnitPrice] = useState(BASE_PRICE);
  const [games, setGames] = useState<Game[]>([]);
  const [drawText, setDrawText] = useState('');
  const [drawSubmitted, setDrawSubmitted] = useState<number[] | null>(null);
  const [prizes, setPrizes] = useState<Record<PrizeBand, number>>({
    11: 6,
    12: 12,
    13: 30,
    14: 0,
    15: 0,
  });
  const [error, setError] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [listWidth, setListWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const gameListRef = useRef<HTMLDivElement>(null);
  const generationWorkerRef = useRef<Worker | null>(null);
  const parsedDraw = useMemo(() => parseDraw(drawText), [drawText]);
  const ticketCount = choose(numberCount, 15);
  const gameCost = unitPrice * ticketCount;
  const totalCost = gameCost * games.length;
  const currentModel = {
    balanced: 'Equilibrado',
    diversified: 'Diversificado',
    random: 'Aleatório',
  }[model];
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
  useEffect(() => {
    generate();
  }, []);

  function generate() {
    generationWorkerRef.current?.terminate();
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
  }

  function exportGames() {
    const data = {
      loteria: 'Lotofácil',
      geradoEm: new Date().toISOString(),
      estrategia: currentModel,
      quantidadeDeApostas: games.length,
      numerosPorAposta: numberCount,
      precoDaApostaSimples: unitPrice,
      custoPorJogo: gameCost,
      custoTotal: totalCost,
      resultadoConferido: drawSubmitted,
      premiosPorFaixa: prizes,
      jogos: games.map((game) => {
        const hits = drawSubmitted
          ? game.numbers.filter((number) => drawSubmitted.includes(number)).length
          : null;
        return {
          jogo: game.id,
          numeros: game.numbers,
          acertos: hits,
          premio: hits && hits >= 11 ? prizes[hits as PrizeBand] : hits === null ? null : 0,
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
                <div><span>Custo por jogo</span><strong>{formatCurrency(gameCost)}</strong></div>
                <div><span>Investimento do lote</span><strong className="total-cost">{formatCurrency(totalCost)}</strong></div>
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
              <span><Icon name="ticket" size={15} /> {games.length * ticketCount} combinações simples</span>
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
                          const hits = drawSubmitted
                            ? game.numbers.filter((number) => drawSubmitted.includes(number)).length
                            : null;
                          const prize = hits !== null && hits >= 11 ? prizes[hits as PrizeBand] : 0;
                          return (
                            <article className={`game-card${hits !== null && hits >= 11 ? ' winner-card' : ''}`} key={game.id}>
                              <div className="game-card-head">
                                <div className="game-name"><span className="ticket-icon"><Icon name="ticket" size={15} /></span><strong>Jogo {String(game.id).padStart(2, '0')}</strong><span className="game-meta">{numberCount} dezenas</span></div>
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
                                {hits !== null
                                  ? <span className={`result-pill${hits >= 11 ? ' prize-pill' : ''}`}>{hits} acertos <b>{hits >= 11 ? `· ${formatCurrency(prize)}` : ''}</b></span>
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
            <p>Insira as 15 dezenas sorteadas para conferir automaticamente cada combinação.</p>
          </div>
          <div className="check-panel">
            <div className="draw-input-area">
              <label className="field-label" htmlFor="drawNumbers">Dezenas sorteadas</label>
              <textarea id="drawNumbers" rows={2} placeholder="Ex.: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15" value={drawText} onChange={(event) => { setDrawText(event.target.value); setError(''); }} />
              <div className={`input-status${drawText && parsedDraw ? ' valid' : ''}`}>{drawText && parsedDraw ? <><Icon name="check" size={14} /> 15 dezenas válidas</> : 'Separe os números por vírgula ou espaço (01–25).'}</div>
              {error && <div className="error-message" role="alert">{error}</div>}
              <button className="primary-button check-button" type="button" onClick={checkGames}><Icon name="check" size={17} /> Conferir {games.length} jogos</button>
            </div>
            <div className="prize-area">
              <div className="prize-heading"><div><span className="section-kicker">RATEIO DO CONCURSO</span><h3>Prêmio por faixa</h3></div><span className="edit-tag">EDITÁVEL</span></div>
              <div className="prize-fields">
                {PRIZE_BANDS.map((band) => (
                  <label key={band} className="prize-field" htmlFor={`prize-${band}`}>
                    <span>{PRIZE_LABELS[band]}</span>
                    <span className="prize-value"><small>R$</small><input id={`prize-${band}`} type="number" min={0} step={band <= 13 ? 1 : 100} value={prizes[band]} onChange={(event) => setPrizes({ ...prizes, [band]: Math.max(0, Number(event.target.value) || 0) })} /></span>
                  </label>
                ))}
              </div>
              <p className="prize-footnote">Atualize os valores conforme o rateio oficial do concurso. As faixas de 14 e 15 acertos variam.</p>
            </div>
          </div>
          {drawSubmitted && (
            <div className="check-result-bar" role="status">
              <div><span className="success-check"><Icon name="check" size={17} /></span><strong>Conferência concluída</strong><span>Resultado aplicado aos {games.length} jogos.</span></div>
              <button type="button" className="text-button" onClick={() => { setDrawSubmitted(null); setDrawText(''); }}>Limpar resultado <Icon name="refresh" size={14} /></button>
            </div>
          )}
        </section>

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
