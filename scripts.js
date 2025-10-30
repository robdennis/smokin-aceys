// --- UI & STATE MANAGEMENT ---
let players = [];
let simulationWorker = null;
let simulationTimer = null;
let simulationStartTime = 0;
const simulationTimings = [];
let isSimulationHalted = false; // State for the checkbox

let allCompletedGamesData = [];
let currentLiveGameData = null;
let currentLiveGamePotHistory = [];
let currentLivePlayerPotHistory = {};
let currentLivePlayerBets = {};
let theoreticalStats = null;
let playerColors = {};


function calculateTheoreticalStatsForUI() {
    const stats = [];
    for (let userSpread = 0; userSpread <= 12; userSpread++) {
        let win_ranks = userSpread > 0 ? userSpread - 1 : 0;
        let dloss_ranks = userSpread > 0 ? 2 : 1;
        let loss_ranks = 13 - win_ranks - dloss_ranks;
        let ev = (win_ranks/13 * 1) - (loss_ranks/13 * 1) - (dloss_ranks/13 * 2);
         let pairCount = 0;
        const totalPairs = (52 * 51) / 2;
        if (userSpread === 0) pairCount = 13 * (4 * 3 / 2);
        else { const rankDistance = userSpread; pairCount = (13 - rankDistance) * 4 * 4; }

        stats[userSpread] = {
            win: (win_ranks/13) * 100, loss: (loss_ranks/13) * 100,
            dloss: (dloss_ranks/13) * 100, ev: ev,
            occur: (pairCount / totalPairs) * 100
        };
    }
    return stats;
}

const DOM = {
    mainGrid: document.getElementById('main-grid'),
    configPanel: document.getElementById('config-panel'),
    resultsPanel: document.getElementById('results-panel'),
    toggleConfigBtnContainer: document.getElementById('toggle-config-btn-container'),
    toggleConfigBtn: document.getElementById('toggle-config-btn'),
    playerList: document.getElementById('player-list'),
    addPlayerBtn: document.getElementById('add-player-btn'),
    playerModal: document.getElementById('player-modal'),
    modalTitle: document.getElementById('modal-title'),
    savePlayerBtn: document.getElementById('save-player-btn'),
    cancelPlayerBtn: document.getElementById('cancel-player-btn'),
    playerId: document.getElementById('player-id'),
    playerName: document.getElementById('player-name'),
    startMoney: document.getElementById('start-money'),
    stopLoss: document.getElementById('stop-loss'),
    rebuyStrategy: document.getElementById('rebuy-strategy'),
    rebuyAmountContainer: document.getElementById('rebuy-amount-container'),
    buyInAmount: document.getElementById('buy-in-amount'),
    buyInCount: document.getElementById('buy-in-count'),
    buyInUnlimited: document.getElementById('buy-in-unlimited'),
    cardCounting: document.getElementById('card-counting'),
    customRanksContainer: document.getElementById('custom-ranks-container'),
    customRanks: document.getElementById('custom-ranks'),
    bettingStrategyTable: document.getElementById('betting-strategy-table'),
    startSimBtn: document.getElementById('start-simulation-btn'),
    stopSimBtn: document.getElementById('stop-simulation-btn'),
    haltSimCheckbox: document.getElementById('halt-simulation-checkbox'), // New checkbox
    nextTurnBtn: document.getElementById('next-turn-btn'),
    nextTurnBtnContainer: document.getElementById('next-turn-btn-container'),
    simCountInput: document.getElementById('simulation-count'),
    progressContainer: document.getElementById('progress-container'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    progressPercentage: document.getElementById('progress-percentage'),
    elapsedTimeText: document.getElementById('elapsed-time-text'),
    etaText: document.getElementById('eta-text'),
    resultsContainer: document.getElementById('results-container'),
    anteAmount: document.getElementById('ante-amount'),
    startingPot: document.getElementById('starting-pot'),
    minTotalBets: document.getElementById('min-total-bets'),
    minPotClearValue: document.getElementById('min-pot-clear-value'),
    showLiveDeck: document.getElementById('show-live-deck'),
    showLiveTurn: document.getElementById('show-live-turn'),
    liveDeckDisplay: document.getElementById('live-deck-display'),
    liveTurnDisplay: document.getElementById('live-turn-display'),
    importConfigBtn: document.getElementById('import-config-btn'),
    exportConfigBtn: document.getElementById('export-config-btn'),
    importFileInput: document.getElementById('import-file-input'),
    spreadAnalysisTable: document.getElementById('spread-analysis-table'),
    playerWinLossContainer: document.getElementById('player-win-loss-container'),
    playerBetAmountContainer: document.getElementById('player-bet-amount-container'),
    playerPotHistoryContainer: document.getElementById('player-pot-history-container'),
    gaveUpHeatmapContainer: document.getElementById('gave-up-heatmap-container'),
    gameLengthHeatmapContainer: document.getElementById('game-length-heatmap-container'),
    antesMadeHeatmapContainer: document.getElementById('antes-made-heatmap-container'),
    shufflesHeatmapContainer: document.getElementById('shuffles-heatmap-container'),
    gameTimeHeatmapContainer: document.getElementById('game-time-heatmap-container'),
    playerStatsDetails: document.getElementById('player-stats-details'),
};

const elementsToHideDuringSim = [
    'game-length-heatmap-container',
    'antes-made-heatmap-container',
    'shuffles-heatmap-container',
    'game-time-heatmap-container',
    'player-stats-details',
    'player-pot-history-container'
];


function initialize() {
    setupEventListeners();
    createBettingStrategyTable();
    addDefaultPlayers();
    updatePlayerColors();
    renderPlayerList();
}

function setupEventListeners() {
    DOM.addPlayerBtn.addEventListener('click', () => openPlayerModal());
    DOM.savePlayerBtn.addEventListener('click', savePlayer);
    DOM.cancelPlayerBtn.addEventListener('click', closePlayerModal);
    DOM.buyInUnlimited.addEventListener('change', (e) => {
        DOM.buyInCount.disabled = e.target.checked;
    });
    DOM.rebuyStrategy.addEventListener('change', (e) => {
        const strategy = e.target.value;
        DOM.rebuyAmountContainer.classList.toggle('hidden', strategy === 'none');
        DOM.buyInCount.closest('div').classList.toggle('hidden', strategy === 'none');
    });
    DOM.cardCounting.addEventListener('change', (e) => {
        DOM.customRanksContainer.classList.toggle('hidden', e.target.value !== 'custom');
    });
    DOM.startSimBtn.addEventListener('click', startSimulation); // Changed back
    DOM.stopSimBtn.addEventListener('click', stopSimulation);   // Back to original stop
    DOM.haltSimCheckbox.addEventListener('change', (e) => {     // Listener for checkbox
         isSimulationHalted = e.target.checked;
         if (simulationWorker) {
            simulationWorker.postMessage({ type: 'halt', checked: isSimulationHalted });
         }
         DOM.nextTurnBtnContainer.classList.toggle('hidden', !isSimulationHalted);
    });
    DOM.nextTurnBtn.addEventListener('click', () => {
        DOM.nextTurnBtn.disabled = true; // Disable until worker confirms ready
        simulationWorker.postMessage({ type: 'nextTurn' });
    });
    DOM.exportConfigBtn.addEventListener('click', exportConfig);
    DOM.importConfigBtn.addEventListener('click', () => DOM.importFileInput.click());
    DOM.importFileInput.addEventListener('change', importConfig);
    DOM.toggleConfigBtn.addEventListener('click', toggleConfigPanel);
}

function toggleConfigPanel() {
    const isVisible = !DOM.configPanel.classList.contains('hidden');
    DOM.configPanel.classList.toggle('hidden');

    if(isVisible) { // it was visible, now it's hidden
        DOM.mainGrid.classList.remove('lg:grid-cols-3');
        DOM.resultsPanel.classList.remove('lg:col-span-2');
        DOM.toggleConfigBtn.textContent = 'Show Config';
    } else { // it was hidden, now it's visible
        DOM.mainGrid.classList.add('lg:grid-cols-3');
        DOM.resultsPanel.classList.add('lg:col-span-2');
        DOM.toggleConfigBtn.textContent = 'Hide Config';
    }

    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
}

function createBettingStrategyTable() {
    const tbody = DOM.bettingStrategyTable;
    const theoreticalStats = calculateTheoreticalStatsForUI();
    tbody.innerHTML = '';
    for (let i = 0; i <= 12; i++) {
        const stats = theoreticalStats[i];
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-700'; row.style.verticalAlign = 'middle';
        row.innerHTML = `
            <td class="px-4 py-2 font-medium">${i}</td>
            <td class="px-4 py-2"><select data-spread="${i}" class="strategy-type"><option value="min">Min Bet (Ante)</option><option value="ante"># of Antes</option><option value="pot">% of Pot</option></select></td>
            <td class="px-4 py-2"><div class="value-container"><input type="number" data-spread="${i}" class="strategy-value" min="0" value="1"></div></td>
            <td class="px-2 py-2 text-center text-sm">${stats.occur.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-sm ${stats.win > 0 ? 'text-green-400' : 'text-gray-400'}">${stats.win.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-sm ${stats.loss > 0 ? 'text-yellow-400' : 'text-gray-400'}">${stats.loss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-sm ${stats.dloss > 0 ? 'text-red-400' : 'text-gray-400'}">${stats.dloss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-sm font-mono ${stats.ev >= 0 ? 'text-green-400' : 'text-red-400'}">${stats.ev.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    }
    tbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('strategy-type')) {
            e.target.closest('tr').querySelector('.value-container').classList.toggle('hidden', e.target.value === 'min');
        }
    });
}

function addDefaultPlayers(){
     const defaultPlayers = [
        {
            "id": "player-1759696538976",
            "name": "Nathan",
            "startMoney": 20,
            "stopLoss": 50,
            "rebuy": { "strategy": "cover_bet", "amount": 50, "count": Infinity },
            "cardCounting": "none", "customRanks": [],
            "bettingStrategy": [
                { "type": "min", "value": 1 }, { "type": "min", "value": 1 }, { "type": "min", "value": 1 },
                { "type": "min", "value": 1 }, { "type": "min", "value": 1 }, { "type": "min", "value": 1 },
                { "type": "min", "value": 1 }, { "type": "min", "value": 1 }, { "type": "ante", "value": 5 },
                { "type": "ante", "value": 5 }, { "type": "ante", "value": 5 }, { "type": "ante", "value": 5 },
                { "type": "ante", "value": 5 }
            ]
        },
        {
            "id": "player-1759696864616",
            "name": "Rob",
            "startMoney": 20,
            "stopLoss": 50,
            "rebuy": { "strategy": "cover_bet", "amount": 50, "count": Infinity },
            "cardCounting": "none", "customRanks": [],
            "bettingStrategy": [
                { "type": "min", "value": 1 }, { "type": "min", "value": 1 }, { "type": "min", "value": 1 },
                { "type": "min", "value": 1 }, { "type": "min", "value": 1 }, { "type": "min", "value": 1 },
                { "type": "min", "value": 1 }, { "type": "ante", "value": 1 }, { "type": "pot", "value": 100 },
                { "type": "pot", "value": 100 }, { "type": "pot", "value": 100 }, { "type": "pot", "value": 100 },
                { "type": "pot", "value": 100 }
            ]
        }
    ];
    players.push(...defaultPlayers);
}

function updatePlayerColors() {
    const colorPalette = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    players.forEach((p, i) => {
        if (!playerColors[p.id]) {
            playerColors[p.id] = colorPalette[Object.keys(playerColors).length % colorPalette.length];
        }
    });
}

function openPlayerModal(playerId = null) {
    const isEditing = !!playerId;
    DOM.modalTitle.textContent = isEditing ? 'Edit Player' : 'Add Player';
    DOM.playerId.value = isEditing ? playerId : `player-${Date.now()}`;

    const player = isEditing ? players.find(p => p.id === playerId) : null;
    const rebuy = player?.rebuy || { strategy: 'cover_bet', count: Infinity, amount: 50 };

    DOM.playerName.value = player?.name || '';
    DOM.startMoney.value = player?.startMoney || 100;
    DOM.stopLoss.value = player?.stopLoss || '';

    DOM.rebuyStrategy.value = rebuy.strategy;
    DOM.buyInAmount.value = rebuy.amount;
    DOM.rebuyAmountContainer.classList.toggle('hidden', rebuy.strategy === 'none');
    DOM.buyInCount.closest('div').classList.toggle('hidden', rebuy.strategy === 'none');

    if (rebuy.count === Infinity || rebuy.count === 'Infinity') {
        DOM.buyInUnlimited.checked = true; DOM.buyInCount.disabled = true; DOM.buyInCount.value = 1;
    } else {
        DOM.buyInUnlimited.checked = false; DOM.buyInCount.disabled = false; DOM.buyInCount.value = rebuy.count || 1;
    }

    DOM.cardCounting.value = player?.cardCounting || 'none';
    DOM.customRanks.value = player?.customRanks?.join(', ') || '';
    DOM.customRanksContainer.classList.toggle('hidden', (player?.cardCounting || 'none') !== 'custom');

    const strategies = player?.bettingStrategy || Array(13).fill({ type: 'min', value: 1 });
    for(let i=0; i<=12; i++){
        const row = DOM.bettingStrategyTable.rows[i];
        if (!row) continue;
        row.querySelector(`.strategy-type`).value = strategies[i].type;
        row.querySelector(`.strategy-value`).value = strategies[i].value;
        row.querySelector('.value-container').classList.toggle('hidden', strategies[i].type === 'min');
    }
    DOM.playerModal.classList.remove('hidden');
}

function closePlayerModal() {
    DOM.playerModal.classList.add('hidden');
}

function savePlayer() {
    const id = DOM.playerId.value;
    const isEditing = players.some(p => p.id === id);

    const player = {
        id,
        name: DOM.playerName.value || `Player ${players.length + 1}`,
        startMoney: parseFloat(DOM.startMoney.value),
        stopLoss: DOM.stopLoss.value ? parseFloat(DOM.stopLoss.value) : null,
        rebuy: {
            strategy: DOM.rebuyStrategy.value,
            amount: parseFloat(DOM.buyInAmount.value),
            count: DOM.buyInUnlimited.checked ? Infinity : parseInt(DOM.buyInCount.value)
        },
        cardCounting: DOM.cardCounting.value,
        customRanks: DOM.customRanks.value.split(',').map(r => r.trim().toUpperCase()).filter(Boolean),
        bettingStrategy: []
    };
    if(player.rebuy.strategy === 'none') player.rebuy.count = 0;

    for (let i = 0; i <= 12; i++) {
        player.bettingStrategy[i] = {
            type: DOM.bettingStrategyTable.querySelector(`select[data-spread="${i}"]`).value,
            value: parseFloat(DOM.bettingStrategyTable.querySelector(`input[data-spread="${i}"]`).value)
        };
    }

    if(isEditing) {
        players = players.map(p => p.id === id ? player : p);
    } else {
        players.push(player);
    }
    updatePlayerColors();
    renderPlayerList();
    closePlayerModal();
}

function renderPlayerList() {
    DOM.playerList.innerHTML = '';
    if (players.length === 0) DOM.playerList.innerHTML = `<p class="text-gray-400">No players yet. Add one to begin.</p>`;
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'flex justify-between items-center bg-gray-700 p-2 rounded-lg';
        playerDiv.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="w-4 h-4 rounded-full" style="background-color: ${playerColors[player.id]}"></span>
                <span class="font-medium">${player.name}</span>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary btn-sm" data-id="${player.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-id="${player.id}">Delete</button>
            </div>`;
        playerDiv.querySelector('button.btn-secondary').addEventListener('click', (e) => openPlayerModal(e.target.dataset.id));
        playerDiv.querySelector('button.btn-danger').addEventListener('click', (e) => {
            players = players.filter(p => p.id !== e.target.dataset.id);
            updatePlayerColors();
            renderPlayerList();
        });
        DOM.playerList.appendChild(playerDiv);
    });
}

// --- SIMULATION HANDLING ---

function initWorker() {
    if (simulationWorker) simulationWorker.postMessage({type: 'terminate'});
    simulationWorker = new Worker('worker.js');
    simulationWorker.onmessage = handleWorkerMessage;
}

function handleWorkerMessage(e) {
    const { type, data } = e.data;
    switch(type) {
        case 'ready':
            theoreticalStats = data.theoreticalStats;
            break;
        case 'deckShuffled':
            renderInitialDeck(data.deck);
            break;
        case 'tick':
            currentLiveGamePotHistory.push(data.latestPot);
            Object.keys(data.playerPots).forEach(pId => {
                if (!currentLivePlayerPotHistory[pId]) currentLivePlayerPotHistory[pId] = [];
                currentLivePlayerPotHistory[pId].push(data.playerPots[pId]);
            });
            currentLivePlayerBets = data.playerBets;

            const { latestPot, playerPots, playerBets, deck, turnDetails, ...rest } = data;
            currentLiveGameData = rest;

            if (deck) renderLiveDeck(deck);
            if (turnDetails) renderLiveTurn(turnDetails);

            redrawAllCharts();
            break;
        case 'gameComplete':
            allCompletedGamesData.push(data.finalStats);
            currentLiveGameData = null;
            currentLiveGamePotHistory = [];
            currentLivePlayerPotHistory = {};
            currentLivePlayerBets = {};
            simulationTimings.push(data.finalStats.duration);
            updateProgress(data);
            redrawAllCharts();
            if(DOM.liveTurnDisplay) DOM.liveTurnDisplay.innerHTML = '';
            break;
        case 'complete':
            finalizeSimulation();
            break;
        case 'paused': // Worker is paused due to halt checkbox
             // No UI change needed here, handled by checkbox listener
            break;
        case 'readyForNextTurn': // Worker is halted and ready
            DOM.nextTurnBtn.disabled = false;
            break;
         // 'resumed' message is no longer needed as checkbox handles resume
    }
}

function startSimulation() {
     // --- Start new simulation ---
    if (players.length === 0) { alert('Please add at least one player.'); return; }

    if (DOM.configPanel.classList.contains('hidden') === false) {
         toggleConfigPanel();
    }
    DOM.toggleConfigBtnContainer.classList.remove('hidden');
    DOM.startSimBtn.disabled = true; // Disable Start button
    DOM.stopSimBtn.disabled = false; // Enable Stop button
    DOM.stopSimBtn.classList.remove('hidden');
    DOM.resultsContainer.classList.remove('hidden');
    DOM.progressContainer.classList.remove('hidden');
    DOM.haltSimCheckbox.disabled = false; // Enable checkbox
    isSimulationHalted = DOM.haltSimCheckbox.checked; // Get initial state
    DOM.nextTurnBtnContainer.classList.toggle('hidden', !isSimulationHalted); // Show Next Turn if starting halted


    elementsToHideDuringSim.forEach(id => document.getElementById(id)?.classList.add('hidden'));

    const showDeck = DOM.showLiveDeck.checked;
    DOM.liveDeckDisplay.classList.toggle('hidden', !showDeck);
    const showTurn = DOM.showLiveTurn.checked;
    DOM.liveTurnDisplay.classList.toggle('hidden', !showTurn);

    allCompletedGamesData = []; currentLiveGameData = null; simulationTimings.length = 0; theoreticalStats = null; currentLiveGamePotHistory = []; currentLivePlayerPotHistory = {}; currentLivePlayerBets = {};

    updatePlayerColors();

    const toCents = val => Math.round(val * 100);
    const gameConfig = { ante: toCents(parseFloat(DOM.anteAmount.value)), startingPot: toCents(parseFloat(DOM.startingPot.value)), minTotalBets: parseInt(DOM.minTotalBets.value), minPotClearValue: toCents(parseFloat(DOM.minPotClearValue.value)) };
    const playersConfig = JSON.parse(JSON.stringify(players, (k,v) => v === Infinity ? "Infinity" : v)).map(p => {
        p.startMoney = toCents(p.startMoney);
        if (p.rebuy && p.rebuy.amount) p.rebuy.amount = toCents(p.rebuy.amount);
        if (p.stopLoss !== null) p.stopLoss = toCents(p.stopLoss);
        if (p.rebuy) p.rebuy.count = p.rebuy.count === "Infinity" ? Infinity : p.rebuy.count;
        return p;
    });

    const config = {
        players: playersConfig,
        game: gameConfig,
        simulationCount: parseInt(DOM.simCountInput.value),
        showLiveDeck: showDeck,
        showLiveTurn: showTurn,
        shouldHaltInitially: isSimulationHalted // Pass initial halt state
    };

    initWorker();
    setupPlayerWinLossCharts();
    setupPlayerBetAmountCharts();
    setupPlayerPotHistoryCharts();
    simulationStartTime = performance.now();
    updateProgress({progress: 0, gameNum: -1, totalGames: config.simulationCount});
    startTimer();
    simulationWorker.postMessage({ type: 'start', config });
}

// Original stop behavior: terminate the worker
function stopSimulation() {
    if (simulationWorker) {
        simulationWorker.postMessage({ type: 'terminate' });
        simulationWorker = null; // Worker is terminated
    }
     // Reset UI to initial state
    clearInterval(simulationTimer);
    DOM.startSimBtn.disabled = false;
    DOM.stopSimBtn.disabled = true;
    DOM.stopSimBtn.classList.add('hidden');
    DOM.haltSimCheckbox.checked = false;
    DOM.haltSimCheckbox.disabled = true; // Disable checkbox until sim starts
    isSimulationHalted = false;
    DOM.nextTurnBtnContainer.classList.add('hidden');
    DOM.progressText.textContent = "Stopped by user.";
     // Potentially keep charts visible, but clear live data indicators if desired
     // redrawAllCharts(); // Might want to call redraw to update status
}


function startTimer() {
    const simulationCount = parseInt(DOM.simCountInput.value);
    clearInterval(simulationTimer);
    simulationTimer = setInterval(() => {
        const elapsedSeconds = Math.round((performance.now() - simulationStartTime) / 1000);
        DOM.elapsedTimeText.textContent = `Elapsed: ${elapsedSeconds}s`;
         if (simulationTimings.length > 0) {
            const avgTime = simulationTimings.reduce((a, b) => a + b, 0) / simulationTimings.length;
            const etaSeconds = Math.round(avgTime * (simulationCount - allCompletedGamesData.length));
            DOM.etaText.textContent = `ETA: ${etaSeconds}s`;
        } else if (allCompletedGamesData.length > 0) {
            const elapsed = (performance.now() - simulationStartTime) / 1000;
            const timePerGame = elapsed / allCompletedGamesData.length;
            const etaSeconds = Math.round(timePerGame * (simulationCount - allCompletedGamesData.length));
             DOM.etaText.textContent = `ETA: ${etaSeconds}s`;
        }
    }, 1000);
}

function finalizeSimulation() {
    clearInterval(simulationTimer);
    DOM.startSimBtn.disabled = false;
    DOM.stopSimBtn.disabled = true;
    DOM.stopSimBtn.classList.add('hidden');
    DOM.haltSimCheckbox.checked = false;
    DOM.haltSimCheckbox.disabled = true; // Disable checkbox until sim starts
    isSimulationHalted = false;
    DOM.nextTurnBtnContainer.classList.add('hidden');

    DOM.progressText.textContent = "Finished!";
    const elapsedSeconds = Math.round((performance.now() - simulationStartTime) / 1000);
    DOM.elapsedTimeText.textContent = `Total Time: ${elapsedSeconds}s`;
    DOM.etaText.textContent = `ETA: 0s`;
    elementsToHideDuringSim.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    redrawAllCharts(); // Final redraw to show all stats
    DOM.liveDeckDisplay.classList.add('hidden');
}

function updateProgress(data) {
    const { progress, gameNum, totalGames } = data;
    const percentage = Math.round(progress * 100);
    DOM.progressBar.style.width = `${percentage}%`;
    DOM.progressPercentage.textContent = `${percentage}%`;
    DOM.progressText.textContent = `Simulating game ${gameNum + 1} of ${totalGames}...`;
}

function redrawAllCharts() {
    if(!allCompletedGamesData.length && !currentLiveGameData) {
         [...document.querySelectorAll('.h-96, .h-80')].forEach(el => Plotly.purge(el.id));
        return;
    }

    const isSimulatingOrHalted = !DOM.stopSimBtn.classList.contains('hidden'); // True if running or halted

    plotPotHistoryChart(allCompletedGamesData, currentLiveGameData);
    if(theoreticalStats) updateSpreadAnalysisTable();

    // Show final stats only when completely finished (not just halted)
    if (!isSimulatingOrHalted) {
        elementsToHideDuringSim.forEach(id => document.getElementById(id)?.classList.remove('hidden'));

        plotHeatmap('game-length-heatmap', 'Game Length (# of Bets)', allCompletedGamesData.map(g => g.length), currentLiveGameData?.length);
        plotHeatmap('antes-made-heatmap', '# of Antes Made', allCompletedGamesData.map(g => g.antesMade), currentLiveGameData?.antesMade);
        plotHeatmap('shuffles-heatmap', '# of Shuffles per Game', allCompletedGamesData.map(g => g.shuffles), currentLiveGameData?.shuffles);
        plotHeatmap('game-time-heatmap', 'Game Simulation Time (s)', allCompletedGamesData.map(g => g.duration), null);

        const anyGaveUp = allCompletedGamesData.some(g => g.playersGaveUp > 0) || (currentLiveGameData && currentLiveGameData.playersGaveUp > 0);
        DOM.gaveUpHeatmapContainer.classList.toggle('hidden', !anyGaveUp);
        if (anyGaveUp) {
            plotHeatmap('gave-up-heatmap', '# of Players Who Gave Up', allCompletedGamesData.map(g => g.playersGaveUp), currentLiveGameData?.playersGaveUp);
        }

        plotPlayerPotHistoryCharts();
        plotPlayerWinLossCharts();
        plotPlayerBetAmountCharts();
    } else {
         // Hide detailed stats while running or halted
         elementsToHideDuringSim.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    }
}

function formatCard(card) {
    if (!card) return '';
    const suitSymbols = { H: '♥', D: '♦', C: '♣', S: '♠' };
    const rankSymbols = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
    const color = (card.suit === 'H' || card.suit === 'D') ? 'text-red-400' : 'text-gray-300';
    return `<span class="${color} font-mono">${rankSymbols[card.rank]}${suitSymbols[card.suit]}</span>`;
}

const turnLog = [];
let lastTurnPlayer = null;

function renderLiveTurn(turnData) {
    const { playerName, card1, card2, spread, betAmount, card3, outcome, log, playerMoneyBefore } = turnData;

    if (lastTurnPlayer !== playerName) {
        if(turnLog.length > 0) turnLog.push(`<hr class="border-gray-600 my-2">`);
        lastTurnPlayer = playerName;
    }

    let html = `<div><b>Turn for ${playerName} ($${(playerMoneyBefore/100).toFixed(2)}):</b></div>`;

    (log || []).forEach(logEntry => {
        switch(logEntry.type) {
            case 'rebuy':
                html += `<div class="text-blue-400 pl-2">↪ Rebuy: +$${(logEntry.amount/100).toFixed(2)} for ${logEntry.playerName}. (${logEntry.remaining} left)</div>`;
                break;
            case 'stoploss':
                 html += `<div class="text-red-500 font-bold pl-2">🛑 Stop-Loss hit for ${logEntry.playerName} at $${(logEntry.threshold/100).toFixed(2)}.</div>`;
                break;
        }
    });

    html += `<div class="pl-2">Offered: ${formatCard(card1)} ${formatCard(card2)} (Sprd: ${spread})</div>`;

    if (outcome === 'pending') {
        html += `<div class="pl-2">Betting $${(betAmount / 100).toFixed(2)}...</div>`;
    } else if (outcome === 'quit') {
        html += `<div class="text-red-500 font-bold pl-2">QUIT (can't cover bet of $${(betAmount / 100).toFixed(2)})</div>`;
    } else if (betAmount > 0) {
        let outcomeText = '';
        let outcomeColor = '';
        switch(outcome) {
            case 'win': outcomeText = `WIN (+$${(betAmount/100).toFixed(2)})`; outcomeColor = 'text-green-400'; break;
            case 'loss': outcomeText = `LOSS (-$${(betAmount/100).toFixed(2)})`; outcomeColor = 'text-yellow-400'; break;
            case 'dloss': outcomeText = `D-LOSS (-$${(betAmount*2/100).toFixed(2)})`; outcomeColor = 'text-red-400'; break;
        }
        html += `<div class="pl-2">Bet $${(betAmount/100).toFixed(2)} -> Result: ${formatCard(card3)} <b class="${outcomeColor}">${outcomeText}</b></div>`;

    } else {
        html += `<div class="pl-2">Bet: $0.00 (Pass)</div>`;
    }

    turnLog.push(html);
    if (turnLog.length > 100) turnLog.shift(); // Keep log from getting too long

    DOM.liveTurnDisplay.innerHTML = turnLog.join('');
    DOM.liveTurnDisplay.scrollTop = DOM.liveTurnDisplay.scrollHeight;
}

function renderInitialDeck(deck) {
    let html = '<div class="mb-2"><b>Initial Deck:</b><div class="flex flex-wrap gap-1">';
    html += deck.map(formatCard).join(' ');
    html += '</div></div>';
    DOM.liveDeckDisplay.innerHTML = html;
}

function renderLiveDeck(deck) {
    let html = DOM.liveDeckDisplay.querySelector('.mb-2')?.outerHTML || ''; // Keep initial deck if present
    html += '<div><b>Remaining Cards:</b><div class="flex flex-wrap gap-1">';
    html += deck.map(formatCard).join(' ');
    html += '</div></div>';
    DOM.liveDeckDisplay.innerHTML = html;
}

// --- PLOTTING ---
const PLOTLY_LAYOUT_CONFIG = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: '#d1d5db' }, xaxis: { gridcolor: '#374151' }, yaxis: { gridcolor: '#374151' }, margin: { l: 60, r: 20, b: 50, t: 60 } };

function simplifyData(data, maxPoints = 1000) {
    if (!data || data.length <= maxPoints) {
        return data;
    }

    const simplified = [data[0]];
    const bucketSize = (data.length - 2) / (maxPoints - 2);

    for (let i = 0; i < maxPoints - 2; i++) {
        const bucketStartIndex = Math.floor(i * bucketSize) + 1;
        const bucketEndIndex = Math.floor((i + 1) * bucketSize) + 1;
        const bucket = data.slice(bucketStartIndex, bucketEndIndex);

        if (bucket.length === 0) continue;

        let minVal = Infinity, maxVal = -Infinity;
        for (const val of bucket) {
            if (val < minVal) minVal = val;
            if (val > maxVal) maxVal = val;
        }
        simplified.push(minVal);
        if (minVal !== maxVal) {
            simplified.push(maxVal);
        }
    }

    simplified.push(data[data.length - 1]);
    return simplified;
}

function getHistogramData(data, numBins = 40) {
    if (!data || data.length < 1) return { centers: [], counts: [] };
    if (data.length < 2) return { centers: data, counts: data.map(() => 1) };
    const maxVal = Math.max(...data), minVal = Math.min(...data);
    if (maxVal === minVal) return { centers: [minVal], counts: [data.length] };
    const binSize = (maxVal - minVal) / numBins;
    if (binSize === 0) return { centers: [minVal], counts: [data.length] };
    const centers = []; const counts = Array(numBins).fill(0);
    for (let i = 0; i < numBins; i++) centers.push(minVal + (i + 0.5) * binSize);
    for (const value of data) {
        let binIndex = Math.floor((value - minVal) / binSize);
        if (binIndex === numBins) binIndex--;
        if (binIndex >= 0 && binIndex < numBins) counts[binIndex]++;
    }
    return { centers, counts };
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

function createColorScale(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 'Blues';
    return [[0, `rgba(${rgb}, 0)`], [1, `rgba(${rgb}, 1)`]];
}

function plotPotHistoryChart(completedGames, liveGame) {
    const traces = [];

    let maxGameLength = 0;
    completedGames.forEach(game => {
        if (game.potHistory.length > maxGameLength) maxGameLength = game.potHistory.length;
    });
    if (liveGame && currentLiveGamePotHistory.length > maxGameLength) {
        maxGameLength = currentLiveGamePotHistory.length;
    }
    if (maxGameLength === 0) maxGameLength = 1;

    const layout = { ...PLOTLY_LAYOUT_CONFIG, title: 'Pot Size History', yaxis: { ...PLOTLY_LAYOUT_CONFIG.yaxis, tickprefix: '$', tickformat: ',.2f' }, xaxis: {title: 'Bet Number', range: [0, maxGameLength]}, showlegend: false };

    if (completedGames.length > 0) {
        const yBins = 50;
        const z = Array(yBins).fill(0).map(() => Array(maxGameLength).fill(0));

        let maxPot = 0;
        completedGames.forEach(game => {
            const gameMaxPot = Math.max(...game.potHistory, 0);
            if (gameMaxPot > maxPot) maxPot = gameMaxPot;
        });
        if (maxPot === 0) maxPot = 1;

        completedGames.forEach(game => {
            game.potHistory.forEach((potValue, step) => {
                const yBin = Math.min(yBins - 1, Math.floor((potValue / maxPot) * yBins));
                if (step < maxGameLength && yBin >= 0) {
                    z[yBin][step]++;
                }
            });
        });

        traces.push({
            z: z,
            type: 'heatmap',
            colorscale: 'Blues',
            reversescale: true,
            showscale: false,
            y: Array.from({length: yBins}, (_, i) => i * (maxPot / yBins / 100)),
            hovertemplate: 'Bet #: %{x}<br>Pot Size: ~%{y:$.2f}<br>Frequency: %{z}<extra></extra>',
            name: 'Historical Density'
        });
    }

    if(liveGame) {
        const livePotHistory = simplifyData(currentLiveGamePotHistory.map(p => p/100));
        traces.push({
            x: livePotHistory.map((_, i) => i),
            y: livePotHistory,
            mode: 'lines',
            line: { width: 2.5, color: '#ef4444' },
            name: `Live Pot (Game ${liveGame.gameNum})`
        });

        players.forEach(player => {
            if (currentLivePlayerPotHistory[player.id]) {
                const liveHistory = (currentLivePlayerPotHistory[player.id] || []).map(p => p/100);
                traces.push({
                    x: liveHistory.map((_, i) => i),
                    y: liveHistory,
                    mode: 'lines',
                    line: { width: 1.5, color: playerColors[player.id] },
                    name: player.name
                });
            }
        });
    }

    Plotly.react('pot-size-chart', traces, layout, {responsive: true});
}

function setupPlayerPotHistoryCharts() {
    DOM.playerPotHistoryContainer.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.id = `player-pot-history-${player.id}`;
        div.className = 'h-96';
        DOM.playerPotHistoryContainer.appendChild(div);
    });
}

function plotPlayerPotHistoryCharts() {
    let maxGameLength = 0;
    allCompletedGamesData.forEach(game => {
        Object.values(game.playerPotHistory).forEach(history => {
            if (history.length > maxGameLength) maxGameLength = history.length;
        });
    });
     if (maxGameLength === 0) maxGameLength = 1;

    players.forEach(player => {
        const yBins = 25;
        const z = Array(yBins).fill(0).map(() => Array(maxGameLength).fill(0));
        let maxPlayerPot = 0;

        allCompletedGamesData.forEach(game => {
            const history = game.playerPotHistory[player.id] || [];
            const gameMax = Math.max(...history, 0);
            if (gameMax > maxPlayerPot) maxPlayerPot = gameMax;
        });
        if(maxPlayerPot === 0) maxPlayerPot = 1;

        allCompletedGamesData.forEach(game => {
            const history = game.playerPotHistory[player.id] || [];
            history.forEach((val, step) => {
                const yBin = Math.min(yBins - 1, Math.floor((val / maxPlayerPot) * yBins));
                if(step < maxGameLength && yBin >=0) z[yBin][step]++;
            });
        });

        const trace = {
            z: z,
            type: 'heatmap',
            colorscale: createColorScale(playerColors[player.id]),
            showscale: false,
            y: Array.from({length: yBins}, (_, i) => i * (maxPlayerPot / yBins / 100)),
            hovertemplate: 'Bet #: %{x}<br>Pot Share: ~%{y:$.2f}<br>Frequency: %{z}<extra></extra>'
        };

        const layout = { ...PLOTLY_LAYOUT_CONFIG, title: `${player.name}: Pot Contribution History`, yaxis: { ...PLOTLY_LAYOUT_CONFIG.yaxis, tickprefix: '$' }, xaxis: {title: 'Bet Number', range: [0, maxGameLength]} };
        Plotly.react(`player-pot-history-${player.id}`, [trace], layout, {responsive: true});
    });
}

function setupPlayerWinLossCharts() {
    DOM.playerWinLossContainer.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.id = `player-win-loss-${player.id}`;
        div.className = 'h-96';
        DOM.playerWinLossContainer.appendChild(div);
    });
}

function plotPlayerWinLossCharts() {
    players.forEach(player => {
        const playerData = allCompletedGamesData.map(game => {
            const financial = game.playerFinalFinancials[player.id];
            if (!financial) return 0;
            return (financial.finalMoney - financial.startMoney - financial.rebuyAmountUsed) / 100;
        });
        plotHeatmap(`player-win-loss-${player.id}`, `${player.name}: Win/Loss ($)`, playerData, null, '$');
    });
}

function setupPlayerBetAmountCharts() {
     DOM.playerBetAmountContainer.innerHTML = '';
    players.forEach(player => {
        const div = document.createElement('div');
        div.id = `player-bet-amount-${player.id}`;
        div.className = 'h-96';
        DOM.playerBetAmountContainer.appendChild(div);
    });
}

function plotPlayerBetAmountCharts() {
    players.forEach(player => {
        const allBets = allCompletedGamesData.flatMap(g => g.playerBets[player.id] || []).map(b => b/100);
        let liveBet = null;
        if(currentLivePlayerBets[player.id] && currentLivePlayerBets[player.id].length > 0){
            liveBet = currentLivePlayerBets[player.id].slice(-1)[0] / 100;
        }
        plotHeatmap(`player-bet-amount-${player.id}`, `${player.name}: Bet Amounts ($)`, allBets, liveBet, '$');
    });
}

function plotHeatmap(elementId, title, completedData, liveValue, tickPrefix = '') {
    const { centers, counts } = getHistogramData(completedData);
    const trace = {
        x: centers, y: [''], z: [counts], type: 'heatmap',
        colorscale: [[0, 'rgba(59, 130, 246, 0.2)'], [1, 'rgba(59, 130, 246, 1)']],
        showscale: false, hoverinfo: 'x+z', hovertemplate: `Value: %{x:.2f}<br>Count: %{z}<extra></extra>`
    };
    const shapes = [];
    if (liveValue !== null && liveValue !== undefined) {
         shapes.push({ type: 'line', yref: 'paper', x0: liveValue, x1: liveValue, y0: 0, y1: 1, line: { color: '#ef4444', width: 2, dash: 'dash' } });
    }
    const layout = { ...PLOTLY_LAYOUT_CONFIG, title, shapes, yaxis: { showticklabels: false }, xaxis: {...PLOTLY_LAYOUT_CONFIG.xaxis, tickprefix: tickPrefix} };
    Plotly.react(elementId, [trace], layout, {responsive: true});
}


function updateSpreadAnalysisTable() {
    const getColorStyle = (value, baseline, cap) => {
        if (baseline === 0 && value === 0) return { style: '', title: '' };
        const diff = value - baseline;
        const opacity = Math.min(1, Math.abs(diff) / cap);
        if (opacity < 0.1) return { style: '', title: `Baseline: ${baseline.toFixed(2)}` };
        const color = diff > 0 ? `rgba(0, 150, 0, ${opacity})` : `rgba(150, 0, 0, ${opacity})`;
        return {
            style: `background-color: ${color};`,
            title: `Baseline: ${baseline.toFixed(2)}`
        };
    };

    const allGames = [...allCompletedGamesData];
    if(currentLiveGameData) allGames.push(currentLiveGameData);

    const observed = { occurrences: Array(13).fill(0), wins: Array(13).fill(0), losses: Array(13).fill(0), dlosses: Array(13).fill(0), sumEVContextual: Array(13).fill(0), maxWins: Array(13).fill(0), sumCtxWin: Array(13).fill(0), sumCtxLoss: Array(13).fill(0), sumCtxDloss: Array(13).fill(0), sumCtxOccur: Array(13).fill(0) };
    let totalSpreads = 0;
    let totalHandsForContextual = 0;

    allGames.forEach(game => {
        totalHandsForContextual += game.totalHandsForContextual || 0;
        (game.aggregatedContextualOccurrences || []).forEach((p, i) => observed.sumCtxOccur[i] += p);
        for(const spreadKey in game.spreads) {
            const spreadData = game.spreads[spreadKey];
            const spreadIdx = parseInt(spreadKey);
            if(spreadIdx >= 0 && spreadIdx <= 12 && spreadData.occurrences) {
                const s = observed;
                s.occurrences[spreadIdx] += spreadData.occurrences;
                s.wins[spreadIdx] += spreadData.wins || 0;
                s.losses[spreadIdx] += spreadData.losses || 0;
                s.dlosses[spreadIdx] += spreadData.dlosses || 0;
                totalSpreads += spreadData.occurrences;
                s.sumEVContextual[spreadIdx] += spreadData.sumEVContextual || 0;
                s.maxWins[spreadIdx] = Math.max(observed.maxWins[spreadIdx], spreadData.maxWin || 0);
                s.sumCtxWin[spreadIdx] += spreadData.sumCtxWin || 0;
                s.sumCtxLoss[spreadIdx] += spreadData.sumCtxLoss || 0;
                s.sumCtxDloss[spreadIdx] += spreadData.sumCtxDloss || 0;
            }
        }
    });

    const tbody = DOM.spreadAnalysisTable;
    tbody.innerHTML = '';

    const formatEV = (ev) => `<span class="font-mono ${ev >= 0 ? 'text-green-400' : 'text-red-400'}">${ev.toFixed(2)}</span>`;

    for (let i = 0; i <= 12; i++) {
        const totalOutcomes = observed.wins[i] + observed.losses[i] + observed.dlosses[i];
        const measuredOccurPct = totalSpreads > 0 ? (observed.occurrences[i] / totalSpreads) * 100 : 0;
        const measuredWinPct = totalOutcomes > 0 ? (observed.wins[i] / totalOutcomes) * 100 : 0;
        const measuredLossPct = totalOutcomes > 0 ? (observed.losses[i] / totalOutcomes) * 100 : 0;
        const measuredDlossPct = totalOutcomes > 0 ? (observed.dlosses[i] / totalOutcomes) * 100 : 0;
        const measuredEV = (measuredWinPct/100 * 1) + (measuredLossPct/100 * -1) + (measuredDlossPct/100 * -2);

        const contextualOccur = totalHandsForContextual > 0 ? observed.sumCtxOccur[i] / totalHandsForContextual : 0;
        const contextualWin = totalOutcomes > 0 ? observed.sumCtxWin[i] / totalOutcomes : 0;
        const contextualLoss = totalOutcomes > 0 ? observed.sumCtxLoss[i] / totalOutcomes : 0;
        const contextualDloss = totalOutcomes > 0 ? observed.sumCtxDloss[i] / totalOutcomes : 0;
        const contextualEV = observed.occurrences[i] > 0 ? (observed.sumEVContextual[i] / observed.occurrences[i]) / 100 : 0;

        const theoretical = theoreticalStats;

        const mOccurStyle = getColorStyle(measuredOccurPct, contextualOccur, 10);
        const mWinStyle = getColorStyle(measuredWinPct, contextualWin, 20);
        const mLossStyle = getColorStyle(measuredLossPct, contextualLoss, 20);
        const mDlossStyle = getColorStyle(measuredDlossPct, contextualDloss, 20);
        const mEVStyle = getColorStyle(measuredEV, contextualEV, 0.5);

        const cOccurStyle = getColorStyle(contextualOccur, theoretical.occurrence[i], 5);
        const cWinStyle = getColorStyle(contextualWin, theoretical.outcomes[i].win, 10);
        const cLossStyle = getColorStyle(contextualLoss, theoretical.outcomes[i].loss, 10);
        const cDlossStyle = getColorStyle(contextualDloss, theoretical.outcomes[i].dloss, 10);
        const cEVStyle = getColorStyle(contextualEV, theoretical.ev[i], 0.5);

        const row = document.createElement('tr'); row.className = 'border-b border-gray-600';
        row.innerHTML = `
            <td class="px-2 py-2 font-medium border-r border-gray-600">${i}</td>
            <td class="px-2 py-2 text-center" style="${mOccurStyle.style}" title="${mOccurStyle.title}">${measuredOccurPct.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-green-400" style="${mWinStyle.style}" title="${mWinStyle.title}">${measuredWinPct.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-yellow-400" style="${mLossStyle.style}" title="${mLossStyle.title}">${measuredLossPct.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-red-400" style="${mDlossStyle.style}" title="${mDlossStyle.title}">${measuredDlossPct.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center border-r border-gray-600" style="${mEVStyle.style}" title="${mEVStyle.title}">${formatEV(measuredEV)}</td>

            <td class="px-2 py-2 text-center" style="${cOccurStyle.style}" title="${cOccurStyle.title}">${contextualOccur.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-green-400" style="${cWinStyle.style}" title="${cWinStyle.title}">${contextualWin.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-yellow-400" style="${cLossStyle.style}" title="${cLossStyle.title}">${contextualLoss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-red-400" style="${cDlossStyle.style}" title="${cDlossStyle.title}">${contextualDloss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center border-r border-gray-600" style="${cEVStyle.style}" title="${cEVStyle.title}">${formatEV(contextualEV)}</td>

            <td class="px-2 py-2 text-center">${theoretical.occurrence[i].toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-green-400">${theoretical.outcomes[i].win.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-yellow-400">${theoretical.outcomes[i].loss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center text-red-400">${theoretical.outcomes[i].dloss.toFixed(1)}%</td>
            <td class="px-2 py-2 text-center">${formatEV(theoretical.ev[i])}</td>
        `;
        tbody.appendChild(row);
    }
}

// --- CONFIG IMPORT/EXPORT ---
function exportConfig() {
    const config = {
        game: { ante: DOM.anteAmount.value, startingPot: DOM.startingPot.value, minTotalBets: DOM.minTotalBets.value, minPotClearValue: DOM.minPotClearValue.value },
        players: players
    };
    const jsonString = JSON.stringify(config, (key, value) => (value === Infinity ? 'Infinity' : value), 2);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
    const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", "card_sim_config.json");
    document.body.appendChild(a); a.click(); a.remove();
}

function importConfig(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result, (key, value) => (value === 'Infinity' ? Infinity : value));
            DOM.anteAmount.value = config.game.ante;
            DOM.startingPot.value = config.game.startingPot;
            DOM.minTotalBets.value = config.game.minTotalBets;
            DOM.minPotClearValue.value = config.game.minPotClearValue;
            players = config.players;
            updatePlayerColors();
            renderPlayerList();
        } catch(err) { alert('Error parsing configuration file.'); console.error(err); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- RUN APP ---
initialize();
