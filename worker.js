// --- CORE GAME LOGIC ---
const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

class Deck {
    constructor() { this.cards = []; this.discardPile = []; this.createDeck(); this.shuffle(); }
    createDeck() { this.cards = []; for (const suit of SUITS) for (const rank in RANKS) this.cards.push({ rank: RANKS[rank], suit, name: `${rank}${suit}` }); }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    draw(count = 1) { const d = this.cards.splice(-count); this.discardPile.push(...d); return d; }
    reset() { this.createDeck(); this.shuffle(); this.discardPile = []; }
}

// --- SIMULATION LOGIC ---
let simulationState = {};
let shouldHalt = false;
let shouldTerminate = false;
let haltResolver = null;

self.onmessage = function(e) {
    const { type, config, checked } = e.data;
    console.log(`[Worker] Received message: ${type}`, e.data);

    switch (type) {
        case 'start':
            shouldHalt = config.shouldHaltInitially;
            shouldTerminate = false;
            runSimulation(config);
            break;
        case 'halt':
            console.log(`[Worker] Setting shouldHalt to ${checked}`);
            shouldHalt = checked;
            if (!checked && haltResolver) {
                console.log('[Worker] Resuming simulation...');
                haltResolver();
                haltResolver = null;
            }
            break;
        case 'nextTurn':
            console.log('[Worker] Advancing to next turn...');
            if (haltResolver) {
                haltResolver();
                haltResolver = null;
            }
            break;
        case 'terminate':
            console.log('[Worker] Terminating simulation...');
            shouldTerminate = true;
            if (haltResolver) {
                haltResolver();
                haltResolver = null;
            }
            break;
    }
};

async function pauseIfHalted() {
    if (shouldHalt) {
        console.log('[Worker] Simulation halted. Awaiting nextTurn or resume...');
        self.postMessage({ type: 'readyForNextTurn' });
        await new Promise(resolve => {
            haltResolver = resolve;
        });
        console.log('[Worker] Resumed from halt.');
    }
}

function runSimulation(config) {
    const { players: playerConfigs, game: gameConfig, simulationCount } = config;
    simulationState.config = config;
    simulationState.currentGameIndex = 0;

    const theoreticalStats = calculateTheoreticalStats();
    self.postMessage({ type: 'ready', data: { theoreticalStats } });

    gameLoop();
}

async function gameLoop() {
    for (let i = simulationState.currentGameIndex; i < simulationState.config.simulationCount; i++) {
        if (shouldTerminate) break;

        simulationState.currentGameIndex = i;
        const startTime = performance.now();
        const deck = new Deck();
        if (simulationState.config.showLiveDeck) {
            self.postMessage({ type: 'deckShuffled', data: { deck: [...deck.cards] } });
        }
        let pot = simulationState.config.game.startingPot;

        let playersAsJson = JSON.stringify(simulationState.config.players, (k, v) => v === Infinity ? "Infinity" : v);
        let playersConfigForGame = JSON.parse(playersAsJson, (k, v) => v === "Infinity" ? Infinity : v);
        let players = playersConfigForGame.map(p => ({ ...p, money: p.startMoney, isActive: true, buyInUsed: 0, rebuyAmountUsed: 0 }));

        let playerContributions = players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {});

        let currentGameStats = {
            gameNum: i + 1,
            potHistory: [],
            playerPotHistory: {},
            spreads: {},
            playerBets: {},
            length: 0,
            shuffles: 0,
            antesMade: 0,
            playersGaveUp: 0,
            playerFinalFinancials: {},
            aggregatedContextualOccurrences: Array(13).fill(0),
            totalHandsForContextual: 0
        };
        players.forEach(p => {
            currentGameStats.playerPotHistory[p.id] = [];
            currentGameStats.playerBets[p.id] = [];
        });

        function handleRebuyIfNeeded(player, amountNeeded, gameLog) {
            while (player.money < amountNeeded) {
                if (!player.rebuy || player.rebuy.strategy === 'none' || (player.rebuy.count !== Infinity && player.buyInUsed >= player.rebuy.count)) {
                    break;
                }
                let rebuyAmount = player.rebuy.strategy === 'cover_bet' ? amountNeeded - player.money : player.rebuy.amount;
                if (rebuyAmount <= 0) rebuyAmount = player.rebuy.amount;
                player.money += rebuyAmount;
                player.rebuyAmountUsed += rebuyAmount;
                if (player.rebuy.count !== Infinity) {
                    player.buyInUsed++;
                }
                gameLog.push({ type: 'rebuy', playerName: player.name, amount: rebuyAmount, remaining: player.rebuy.count !== Infinity ? player.rebuy.count - player.buyInUsed : 'Unlimited' });
            }
        }

        function anteUp(gameLog) {
            let activePlayers = players.filter(p => p.isActive);
            if (activePlayers.length === 0) return false;
            activePlayers.forEach(player => {
                handleRebuyIfNeeded(player, simulationState.config.game.ante, gameLog);
                if (player.money >= simulationState.config.game.ante) {
                    player.money -= simulationState.config.game.ante;
                    pot += simulationState.config.game.ante;
                    playerContributions[player.id] += simulationState.config.game.ante;
                } else {
                    if (player.isActive) {
                        player.isActive = false;
                        currentGameStats.playersGaveUp++;
                    }
                }
            });
            currentGameStats.antesMade++;
            return players.some(p => p.isActive);
        }

        let gameLogForTurn = [];
        if (!anteUp(gameLogForTurn)) {
            // No one can ante, end game
        }

        let currentPlayerIndex = -1;
        let gameRunning = true;
        let consecutiveZeroBets = 0;

        while (gameRunning) {
            await pauseIfHalted();
            if (shouldTerminate) {
                gameRunning = false;
                break;
            }

            currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
            let currentPlayer = players[currentPlayerIndex];

            if (!currentPlayer.isActive) {
                if (players.every(p => !p.isActive)) gameRunning = false;
                continue;
            }

            if (deck.cards.length < 3) {
                deck.reset();
                currentGameStats.shuffles++;
                if (simulationState.config.showLiveDeck) {
                    self.postMessage({ type: 'deckShuffled', data: { deck: [...deck.cards] } });
                }
            }

            const contextualOccurrences = calculateContextualOccurrence(deck.cards);
            currentGameStats.totalHandsForContextual++;
            contextualOccurrences.forEach((p, i) => currentGameStats.aggregatedContextualOccurrences[i] += p);

            const [card1, card2] = deck.draw(2);
            const highRank = Math.max(card1.rank, card2.rank);
            const lowRank = Math.min(card1.rank, card2.rank);
            const spread = highRank - lowRank - 1;
            const userSpread = spread + 1;

            const betDecision = getPlayerBet(currentPlayer, spread, pot, simulationState.config.game.ante, deck);
            const betAmount = Math.max(betDecision.bet, 0);

            let turnDetails = {
                playerName: currentPlayer.name,
                card1, card2, spread, betAmount,
                card3: null, outcome: 'pending',
                log: gameLogForTurn,
                playerMoneyBefore: currentPlayer.money
            };

            if (betAmount > 0) {
                consecutiveZeroBets = 0;
            } else {
                consecutiveZeroBets++;
            }

            if (consecutiveZeroBets > players.length * 5) {
                gameRunning = false;
            }

            if (gameRunning) {
                currentGameStats.length++;
                handleRebuyIfNeeded(currentPlayer, betAmount, gameLogForTurn);

                if (betAmount > 0 && currentPlayer.money >= betAmount) {
                    currentGameStats.playerBets[currentPlayer.id].push(betAmount);
                    currentPlayer.money -= betAmount;
                    const contextualOutcomes = calculateContextualOutcomes(deck);
                    const [card3] = deck.draw(1);
                    turnDetails.card3 = card3;
                    let outcome;
                    if (card3.rank === highRank || card3.rank === lowRank) {
                        outcome = 'dloss';
                        pot += betAmount * 2;
                        playerContributions[currentPlayer.id] += betAmount * 2;
                    } else if (card3.rank > lowRank && card3.rank < highRank) {
                        outcome = 'win';
                        const winnings = betAmount;
                        pot -= winnings;
                        currentPlayer.money += betAmount + winnings;
                        playerContributions[currentPlayer.id] -= winnings;
                        if (!currentGameStats.spreads[userSpread]) currentGameStats.spreads[userSpread] = {};
                        currentGameStats.spreads[userSpread].maxWin = Math.max(currentGameStats.spreads[userSpread].maxWin || 0, winnings / simulationState.config.game.ante);
                    } else {
                        outcome = 'loss';
                        pot += betAmount;
                        playerContributions[currentPlayer.id] += betAmount;
                    }
                    turnDetails.outcome = outcome;
                    if (!currentGameStats.spreads[userSpread]) currentGameStats.spreads[userSpread] = { occurrences: 0, wins: 0, losses: 0, dlosses: 0, sumEVContextual: 0, sumCtxWin: 0, sumCtxLoss: 0, sumCtxDloss: 0 };
                    const s = currentGameStats.spreads[userSpread];
                    s.occurrences++;
                    s[outcome + 'es'] = (s[outcome + 'es'] || 0) + 1;
                    s.sumCtxWin += contextualOutcomes.win;
                    s.sumCtxLoss += contextualOutcomes.loss;
                    s.sumCtxDloss += contextualOutcomes.dloss;
                    const ev_contextual = calculateEVsForBet(betAmount, spread, deck, deck.cards).observed;
                    s.sumEVContextual += ev_contextual;
                } else {
                    if (betAmount > 0) {
                        currentPlayer.isActive = false;
                        currentGameStats.playersGaveUp++;
                        turnDetails.outcome = 'quit';
                    } else {
                        turnDetails.outcome = 'pass';
                    }
                }

                currentGameStats.potHistory.push(pot);
                players.forEach(p => currentGameStats.playerPotHistory[p.id].push(playerContributions[p.id]));

                if (currentPlayer.stopLoss !== null && (currentPlayer.startMoney + currentPlayer.rebuyAmountUsed - currentPlayer.money) > currentPlayer.stopLoss && currentPlayer.isActive) {
                    gameLogForTurn.push({ type: 'stoploss', playerName: currentPlayer.name, threshold: currentPlayer.stopLoss });
                    currentGameStats.playersGaveUp++;
                    currentPlayer.isActive = false;
                }

                if (pot <= 0) {
                    if (currentGameStats.length >= simulationState.config.game.minTotalBets || Math.abs(pot) >= simulationState.config.game.minPotClearValue) gameRunning = false;
                    else {
                        if (!anteUp(gameLogForTurn)) gameRunning = false;
                        playerContributions = players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {});
                        players.forEach(p => currentGameStats.playerPotHistory[p.id] = []);
                    }
                }

                if (players.every(p => !p.isActive)) gameRunning = false;

                let tickData = { ...currentGameStats, latestPot: pot, spreads: currentGameStats.spreads, playerPots: playerContributions, playerBets: currentGameStats.playerBets };
                delete tickData.potHistory;
                delete tickData.playerPotHistory;
                if (simulationState.config.showLiveDeck) tickData.deck = deck.cards;
                if (simulationState.config.showLiveTurn) {
                    tickData.turnDetails = turnDetails;
                }
                self.postMessage({ type: 'tick', data: tickData });
                gameLogForTurn = [];
            }
            // Force a yield to the event loop to allow messages to be processed.
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        if (shouldTerminate) break;

        currentGameStats.duration = (performance.now() - startTime) / 1000;
        players.forEach(p => {
            currentGameStats.playerFinalFinancials[p.id] = { finalMoney: p.money, rebuyAmountUsed: p.rebuyAmountUsed, startMoney: p.startMoney };
        });

        self.postMessage({ type: 'gameComplete', data: { finalStats: currentGameStats, progress: (i + 1) / simulationState.config.simulationCount, gameNum: i + 1, totalGames: simulationState.config.simulationCount } });
    }

    if (!shouldTerminate) {
        self.postMessage({ type: 'complete' });
    } else {
        self.close();
    }
}

function getPlayerBet(player, spread, pot, ante, deck) {
    const strategy = player.bettingStrategy[spread + 1];
    let bet = 0;

    let perceivedDeck = [...deck.cards];
    if (player.cardCounting === 'none') {
        perceivedDeck = []; for (const suit of SUITS) for (const rank in RANKS) perceivedDeck.push({ rank: RANKS[rank], suit });
    } else if (player.cardCounting === 'custom') {
        const customRanksToTrack = player.customRanks.map(r => RANKS[r.toUpperCase()]).filter(Boolean);
        const knownDiscards = deck.discardPile.filter(c => customRanksToTrack.includes(c.rank));
        const fullDeckCards = []; for (const suit of SUITS) for (const rank in RANKS) fullDeckCards.push({ rank: RANKS[rank], suit, name: `${rank}${suit}` });
        perceivedDeck = fullDeckCards.filter(card => !knownDiscards.some(d => d.name === card.name));
    }

    switch (strategy.type) {
        case 'min': bet = ante; break;
        case 'ante': bet = ante * strategy.value; break;
        case 'pot': bet = pot * (strategy.value / 100); break;
    }

    bet = Math.max(0, Math.min(bet, pot));
    bet = Math.round(bet);

    const evs = calculateEVsForBet(bet, spread, deck, perceivedDeck);
    return { bet, evs };
}

function calculateEVsForBet(betAmount, spread, actualDeck, perceivedDeck) {
    const lastTwoCards = actualDeck.discardPile.slice(-2);
    if (lastTwoCards.length < 2) return { theoretical: 0, observed: 0 };
    const highRank = Math.max(lastTwoCards[0].rank, lastTwoCards[1].rank);
    const lowRank = Math.min(lastTwoCards[0].rank, lastTwoCards[1].rank);

    function calculate(deck, bet) {
        if (bet === 0) return 0;
        let wins = 0, losses = 0, dlosses = 0;
        deck.forEach(card => {
            if (card.rank === highRank || card.rank === lowRank) dlosses++;
            else if (card.rank > lowRank && card.rank < highRank) wins++;
            else losses++;
        });
        const total = deck.length;
        if(total === 0) return 0;
        const pWin = wins / total, pLoss = losses / total, pDLoss = dlosses / total;
        return (pWin * bet) - (pLoss * bet) - (pDLoss * 2 * bet);
    }

    const theoreticalDeck = [];
    for (const suit of SUITS) for (const rank in RANKS) {
        const card = { rank: RANKS[rank], suit, name: `${rank}${suit}` };
        if (!lastTwoCards.some(c => c.name === card.name)) theoreticalDeck.push(card);
    }

    return { theoretical: calculate(theoreticalDeck, betAmount), observed: calculate(perceivedDeck, betAmount) };
}

function calculateContextualOccurrence(deck) {
    const occurrences = Array(13).fill(0);
    const n = deck.length;
    if (n < 2) return occurrences;
    const totalPairs = n * (n - 1) / 2;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const spread = Math.abs(deck[i].rank - deck[j].rank);
            if (spread > 0 && spread <= 13) {
                occurrences[spread-1]++;
            }
        }
    }
    return occurrences.map(count => (count / totalPairs) * 100);
}

function calculateContextualOutcomes(deck) {
    const lastTwoCards = deck.discardPile.slice(-2);
    const highRank = Math.max(lastTwoCards[0].rank, lastTwoCards[1].rank);
    const lowRank = Math.min(lastTwoCards[0].rank, lastTwoCards[1].rank);
    let wins = 0, losses = 0, dlosses = 0;
    deck.cards.forEach(card => {
        if (card.rank === highRank || card.rank === lowRank) dlosses++;
        else if (card.rank > lowRank && card.rank < highRank) wins++;
        else losses++;
    });
    const total = deck.cards.length;
    return {
        win: total > 0 ? (wins/total)*100 : 0,
        loss: total > 0 ? (losses/total)*100 : 0,
        dloss: total > 0 ? (dlosses/total)*100 : 0
    };
}

function calculateTheoreticalStats() {
    const stats = { occurrence: [], outcomes: [], ev: [] };
    const totalPairs = (52 * 51) / 2;
    for (let userSpread = 0; userSpread <= 12; userSpread++) {
        let pairCount = 0;
        if (userSpread === 0) pairCount = 13 * (4 * 3 / 2);
        else { const rankDistance = userSpread; pairCount = (13 - rankDistance) * 4 * 4; }
        stats.occurrence[userSpread] = (pairCount / totalPairs) * 100;

        let win_ranks = userSpread > 0 ? userSpread - 1 : 0;
        let dloss_ranks = userSpread > 0 ? 2 : 1;
        let loss_ranks = 13 - win_ranks - dloss_ranks;
        stats.outcomes[userSpread] = { win: (win_ranks/13)*100, loss: (loss_ranks/13)*100, dloss: (dloss_ranks/13)*100 };
        stats.ev[userSpread] = (win_ranks/13 * 1) - (loss_ranks/13 * 1) - (dloss_ranks/13 * 2);
    }
    return stats;
}
