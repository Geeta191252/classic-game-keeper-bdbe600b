// ============================================
// AVIATOR FUN — independent multiplayer round system
// Fully separate from real Aviator: own state pools, own settings key,
// own manual crash queue, own admin controls. Same math + house-edge
// logic so behaviour is familiar, but everything is isolated.
// ============================================
const Setting = require("./models/Setting");
const Transaction = require("./models/Transaction");

const PHASE = {
  betting: 7000,
  flying: 60000,
  crashed: 4000,
};
const GAME_TAG = "aviator-fun";
const SETTING_KEY = "aviatorFunProfitPercent";

function multiplierAt(elapsedMs) {
  const elapsedSec = elapsedMs / 1000;
  return Math.pow(1.075, elapsedSec * 1.8);
}

function makePool() {
  return {
    roundNumber: 1,
    phase: "betting",
    phaseStartTime: Date.now(),
    crashAt: 1.0,
    flightStartTime: 0,
    bets: {},
    history: [],
    totalPool: 0,
    totalPaidOut: 0,
    userCooldown: {},
    manualQueue: [],
    cumPool: 0,
    cumPaid: 0,
  };
}

const state = {
  dollar: makePool(),
  rupee: makePool(),
  star: makePool(),
};

async function getProfitPercent() {
  try {
    const doc = await Setting.findOne({ key: SETTING_KEY });
    const v = doc && typeof doc.value === "number" ? doc.value : 50;
    return Math.max(0, Math.min(95, v));
  } catch {
    return 50;
  }
}

function randomCrashPoint() {
  const r = Math.random();
  if (r < 0.55) return Number((1.20 + Math.random() * 0.79).toFixed(2));
  if (r < 0.80) return Number((2.00 + Math.random() * 0.99).toFixed(2));
  if (r < 0.93) return Number((3.00 + Math.random() * 1.49).toFixed(2));
  if (r < 0.98) return Number((4.50 + Math.random() * 2.50).toFixed(2));
  return Number((7.0 + Math.random() * 8.0).toFixed(2));
}

async function phaseTick(currency) {
  const s = state[currency];
  const now = Date.now();

  if (s.phase === "betting") {
    if (now - s.phaseStartTime >= PHASE.betting) {
      s.phase = "flying";
      s.flightStartTime = now;
      s.phaseStartTime = now;
      const profitPct = await getProfitPercent();
      s.profitPct = profitPct;
      s.cumPool = (s.cumPool || 0) + s.totalPool;
      s.crashAt = randomCrashPoint();
      s.manualOverride = false;

      if (Array.isArray(s.manualQueue) && s.manualQueue.length > 0) {
        const next = Number(s.manualQueue.shift());
        if (!isNaN(next) && next >= 1.0) {
          s.crashAt = Number(next.toFixed(2));
          s.manualOverride = true;
        }
      }

      if (!s.manualOverride) {
        const targetHouse = s.cumPool * (profitPct / 100);
        const currentHouse = s.cumPool - (s.cumPaid || 0);
        const slack = currentHouse - targetHouse;
        let maxBet = 0;
        for (const k of Object.keys(s.bets)) {
          if (s.bets[k].amount > maxBet) maxBet = s.bets[k].amount;
        }
        if (maxBet > 0 && slack < 0) {
          const allowedLoss = Math.max(0, Math.abs(slack) * 0.5);
          const safeMult = 1.0 + allowedLoss / maxBet;
          if (safeMult < s.crashAt) s.crashAt = Math.max(1.0, Number(safeMult.toFixed(2)));
        }
      }
    }
  } else if (s.phase === "flying") {
    const elapsed = now - s.flightStartTime;
    const m = multiplierAt(elapsed);

    if (!s.manualOverride) {
      const profitPct = s.profitPct || 50;
      const cumBudget = (s.cumPool || 0) * (1 - profitPct / 100);
      const remainingBudget = Math.max(0, cumBudget - (s.cumPaid || 0));
      let maxRemainingBet = 0;
      for (const k of Object.keys(s.bets)) {
        const b = s.bets[k];
        if (!b.cashedOutAt && b.amount > maxRemainingBet) maxRemainingBet = b.amount;
      }
      if (maxRemainingBet > 0 && maxRemainingBet * s.crashAt > remainingBudget) {
        const dynCap = Math.max(1.0, remainingBudget / maxRemainingBet);
        if (dynCap < s.crashAt) s.crashAt = Number(dynCap.toFixed(2));
      }
      const roundBudget = (s.totalPool || 0) * (1 - profitPct / 100);
      const roundRemaining = Math.max(0, roundBudget - (s.totalPaidOut || 0));
      if (roundRemaining <= 0 && (s.totalPool || 0) > 0) {
        s.crashAt = Math.max(1.0, Number(multiplierAt(elapsed).toFixed(2)));
      } else {
        const remainingBetSum = Object.values(s.bets)
          .filter((b) => !b.cashedOutAt)
          .reduce((a, b) => a + b.amount, 0);
        if (remainingBetSum > 0 && remainingBetSum * s.crashAt > roundRemaining) {
          const roundCap = Math.max(1.0, roundRemaining / remainingBetSum);
          if (roundCap < s.crashAt) s.crashAt = Number(roundCap.toFixed(2));
        }
      }
    }

    if (m >= s.crashAt || elapsed >= PHASE.flying) {
      const finalCrash = Math.min(m, s.crashAt);
      s.phase = "crashed";
      s.phaseStartTime = now;
      s.crashAt = Number(finalCrash.toFixed(2));
      s.history = [s.crashAt, ...s.history].slice(0, 18);
      try {
        for (const key of Object.keys(s.bets)) {
          const b = s.bets[key];
          const tgId = b.userId || Number(String(key).split(":")[0]);
          if (b.amount > 0) {
            await Transaction.create({
              telegramId: Number(tgId),
              type: "bet",
              currency,
              amount: -b.amount,
              status: "completed",
              description: `${GAME_TAG}: Bet ${b.amount} (Round ${s.roundNumber})`,
              game: GAME_TAG,
            });
          }
        }
      } catch (err) {
        console.error("Aviator Fun bet log error:", err);
      }
    }
  } else if (s.phase === "crashed") {
    if (now - s.phaseStartTime >= PHASE.crashed) {
      s.roundNumber++;
      s.phase = "betting";
      s.phaseStartTime = now;
      s.bets = {};
      s.totalPool = 0;
      s.totalPaidOut = 0;
      s.crashAt = 1.0;
      s.flightStartTime = 0;
    }
  }
}

function mountAviatorFun(app, deps) {
  const { normalizeCurrency, getCurrencyFields, getOrCreateUser, balancePayload, requireAdmin } = deps;

  setInterval(() => {
    phaseTick("dollar").catch(() => {});
    phaseTick("rupee").catch(() => {});
    phaseTick("star").catch(() => {});
  }, 200);

  // ---------- Public player endpoints ----------
  app.get("/api/aviator-fun/state", (req, res) => {
    let currency;
    try {
      currency = normalizeCurrency(req.query.currency);
    } catch {
      return res.status(400).json({ error: "Invalid currency" });
    }
    const s = state[currency];
    const now = Date.now();
    let multiplier = 1;
    let timeLeft = 0;
    if (s.phase === "betting") {
      timeLeft = Math.max(0, Math.ceil((PHASE.betting - (now - s.phaseStartTime)) / 1000));
    } else if (s.phase === "flying") {
      multiplier = multiplierAt(now - s.flightStartTime);
    } else if (s.phase === "crashed") {
      multiplier = s.crashAt;
    }
    const betsList = Object.entries(s.bets).slice(0, 30).map(([tgId, b]) => ({
      user: (b.firstName || "Player").slice(0, 1) + "***" + String(tgId).split(":")[0].slice(-2),
      amount: b.amount,
      multiplier: b.cashedOutAt || null,
      cashout: b.cashedOutAt ? Number((b.amount * b.cashedOutAt).toFixed(2)) : null,
    }));
    res.json({
      roundNumber: s.roundNumber,
      phase: s.phase,
      multiplier: Number(multiplier.toFixed(2)),
      crashAt: s.phase === "crashed" ? s.crashAt : null,
      timeLeft,
      bets: betsList,
      totalPlayers: Object.keys(s.bets).length,
      history: s.history,
    });
  });

  app.post("/api/aviator-fun/bet", async (req, res) => {
    try {
      const { userId, amount, currency, firstName, slot } = req.body;
      const curr = normalizeCurrency(currency);
      const s = state[curr];
      if (s.phase !== "betting") return res.status(400).json({ error: "Betting closed for this round" });
      const numAmt = Number(amount);
      if (!numAmt || numAmt <= 0) return res.status(400).json({ error: "Invalid amount" });

      const user = await getOrCreateUser(userId);
      const { balanceField: balField, winningField: winField } = getCurrencyFields(curr);
      const wallet = user[balField] || 0;
      const winning = user[winField] || 0;
      if (wallet + winning < numAmt) return res.status(400).json({ error: "Insufficient balance" });

      const slotNum = slot === 2 ? 2 : 1;
      const key = `${user.telegramId}:${slotNum}`;
      if (s.bets[key]) return res.status(400).json({ error: `Slot ${slotNum} already has a bet this round` });

      const fromWallet = Math.min(wallet, numAmt);
      const fromWin = numAmt - fromWallet;
      user[balField] = wallet - fromWallet;
      user[winField] = winning - fromWin;
      await user.save();

      s.bets[key] = {
        userId: user.telegramId,
        slot: slotNum,
        amount: numAmt,
        firstName: firstName || user.firstName || "Player",
        cashedOutAt: null,
        winAmount: 0,
      };
      s.totalPool += numAmt;
      res.json({ success: true, roundNumber: s.roundNumber, slot: slotNum, ...balancePayload(user) });
    } catch (err) {
      console.error("Aviator Fun bet error:", err);
      res.status(500).json({ error: "Failed to place bet" });
    }
  });

  app.post("/api/aviator-fun/cancel", async (req, res) => {
    try {
      const { userId, currency, slot } = req.body;
      const curr = normalizeCurrency(currency);
      const s = state[curr];
      if (s.phase !== "betting") return res.status(400).json({ error: "Cannot cancel — round already started" });
      const slotNum = slot === 2 ? 2 : 1;
      const user = await getOrCreateUser(userId);
      const key = `${user.telegramId}:${slotNum}`;
      const bet = s.bets[key];
      if (!bet) return res.status(400).json({ error: "No bet to cancel" });
      const { balanceField: balField } = getCurrencyFields(curr);
      user[balField] = (user[balField] || 0) + bet.amount;
      await user.save();
      s.totalPool = Math.max(0, s.totalPool - bet.amount);
      delete s.bets[key];
      res.json({ success: true, refunded: bet.amount, ...balancePayload(user) });
    } catch (err) {
      console.error("Aviator Fun cancel error:", err);
      res.status(500).json({ error: "Failed to cancel bet" });
    }
  });

  app.post("/api/aviator-fun/cashout", async (req, res) => {
    try {
      const { userId, currency, slot } = req.body;
      const curr = normalizeCurrency(currency);
      const s = state[curr];
      if (s.phase !== "flying") return res.status(400).json({ error: "Cannot cash out now" });
      const numericId = Number(userId);
      const slotNum = slot === 2 ? 2 : 1;
      const key = `${numericId}:${slotNum}`;
      const bet = s.bets[key];
      if (!bet) return res.status(400).json({ error: "No active bet" });
      if (bet.cashedOutAt) return res.status(400).json({ error: "Already cashed out" });

      const elapsed = Date.now() - s.flightStartTime;
      let mult = Math.min(multiplierAt(elapsed), s.crashAt);

      if (!s.manualOverride) {
        const profitPct = s.profitPct || (await getProfitPercent());
        const roundBudget = (s.totalPool || 0) * (1 - profitPct / 100);
        const roundRemaining = Math.max(0, roundBudget - (s.totalPaidOut || 0));
        const maxMult = bet.amount > 0 ? roundRemaining / bet.amount : 1.0;
        if (maxMult < mult) mult = Math.max(1.0, Number(maxMult.toFixed(2)));
      }

      const win = Number((bet.amount * mult).toFixed(2));
      bet.cashedOutAt = Number(mult.toFixed(2));
      bet.winAmount = win;
      s.totalPaidOut += win;
      s.cumPaid = (s.cumPaid || 0) + win;
      const cd = 4 + Math.floor(Math.random() * 3);
      s.userCooldown[numericId] = s.roundNumber + cd;

      const user = await getOrCreateUser(numericId);
      const { winningField: winField } = getCurrencyFields(curr);
      user[winField] = (user[winField] || 0) + win;
      await user.save();
      await Transaction.create({
        telegramId: numericId,
        type: "win",
        currency: curr,
        amount: win,
        status: "completed",
        description: `${GAME_TAG}: Won ${win} @ ${bet.cashedOutAt}x (Round ${s.roundNumber})`,
        game: GAME_TAG,
      });

      if (!s.manualOverride) {
        const profitPct = s.profitPct || (await getProfitPercent());
        const cumBudget = (s.cumPool || 0) * (1 - profitPct / 100);
        const remainingBudget = cumBudget - (s.cumPaid || 0);
        if (remainingBudget <= 0) {
          s.crashAt = Number(mult.toFixed(2));
        } else {
          const remainingBetSum = Object.values(s.bets).filter((b) => !b.cashedOutAt).reduce((a, b) => a + b.amount, 0);
          if (remainingBetSum > 0 && remainingBetSum * s.crashAt > remainingBudget) {
            const targetMult = remainingBudget / remainingBetSum;
            const safeTarget = Math.max(1.01, Math.min(s.crashAt, Number(targetMult.toFixed(2))));
            if (safeTarget < s.crashAt) s.crashAt = safeTarget;
          }
        }
      }

      res.json({ success: true, multiplier: bet.cashedOutAt, winAmount: win, ...balancePayload(user) });
    } catch (err) {
      console.error("Aviator Fun cashout error:", err);
      res.status(500).json({ error: "Failed to cash out" });
    }
  });

  app.get("/api/aviator-fun/my-bet", (req, res) => {
    let curr;
    try {
      curr = normalizeCurrency(req.query.currency);
    } catch {
      return res.status(400).json({ error: "Invalid currency" });
    }
    const s = state[curr];
    const numericId = Number(req.query.userId);
    const slots = [1, 2].map((slot) => {
      const b = s.bets[`${numericId}:${slot}`];
      return b ? { slot, amount: b.amount, cashedOutAt: b.cashedOutAt, winAmount: b.winAmount } : null;
    }).filter(Boolean);
    res.json({ roundNumber: s.roundNumber, phase: s.phase, bets: slots, bet: slots[0] || null });
  });

  // ---------- Admin control endpoints (JWT auth via requireAdmin) ----------
  app.get("/api/admin/aviator-fun/profit", requireAdmin, async (_req, res) => {
    const percent = await getProfitPercent();
    res.json({ percent });
  });

  app.post("/api/admin/aviator-fun/profit", requireAdmin, async (req, res) => {
    try {
      const { percent } = req.body || {};
      const num = Number(percent);
      if (isNaN(num) || num < 0 || num > 95) return res.status(400).json({ error: "Percent must be 0-95" });
      await Setting.findOneAndUpdate(
        { key: SETTING_KEY },
        { key: SETTING_KEY, value: num },
        { upsert: true, new: true }
      );
      res.json({ success: true, percent: num });
    } catch (err) {
      console.error("Set aviator-fun profit error:", err);
      res.status(500).json({ error: "Failed to update" });
    }
  });

  // Live overview per currency
  app.get("/api/admin/aviator-fun/overview", requireAdmin, async (_req, res) => {
    const overview = {};
    const now = Date.now();
    for (const curr of ["dollar", "rupee", "star"]) {
      const s = state[curr];
      let multiplier = 1;
      let timeLeft = 0;
      if (s.phase === "betting") {
        timeLeft = Math.max(0, Math.ceil((PHASE.betting - (now - s.phaseStartTime)) / 1000));
      } else if (s.phase === "flying") {
        multiplier = multiplierAt(now - s.flightStartTime);
      } else if (s.phase === "crashed") {
        multiplier = s.crashAt;
      }
      overview[curr] = {
        roundNumber: s.roundNumber,
        phase: s.phase,
        multiplier: Number(multiplier.toFixed(2)),
        timeLeft,
        totalPool: Number((s.totalPool || 0).toFixed(2)),
        totalPaidOut: Number((s.totalPaidOut || 0).toFixed(2)),
        cumPool: Number((s.cumPool || 0).toFixed(2)),
        cumPaid: Number((s.cumPaid || 0).toFixed(2)),
        houseNet: Number(((s.cumPool || 0) - (s.cumPaid || 0)).toFixed(2)),
        totalPlayers: Object.keys(s.bets).length,
        manualQueue: s.manualQueue || [],
        manualOverride: !!s.manualOverride,
        crashAt: s.phase === "crashed" ? s.crashAt : null,
        history: s.history,
        bets: Object.entries(s.bets).map(([k, b]) => ({
          key: k,
          userId: b.userId,
          firstName: b.firstName,
          amount: b.amount,
          slot: b.slot,
          cashedOutAt: b.cashedOutAt,
          winAmount: b.winAmount,
        })),
      };
    }
    res.json({ overview });
  });

  // Manual crash queue management
  function pickCurr(req) {
    const c = (req.body && req.body.currency) || req.query.currency;
    if (c === "star") return "star";
    if (c === "rupee") return "rupee";
    return "dollar";
  }

  app.get("/api/admin/aviator-fun/manual", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    const s = state[curr];
    res.json({ currency: curr, queue: s.manualQueue || [], active: !!s.manualOverride, currentCrashAt: s.crashAt });
  });

  app.post("/api/admin/aviator-fun/manual/add", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    const num = Number(req.body && req.body.value);
    if (isNaN(num) || num <= 0 || num > 100000) return res.status(400).json({ error: "Value must be > 0 and ≤ 100000" });
    const s = state[curr];
    s.manualQueue = s.manualQueue || [];
    s.manualQueue.push(Number(num.toFixed(2)));
    res.json({ success: true, queue: s.manualQueue });
  });

  app.post("/api/admin/aviator-fun/manual/set", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    const queue = (req.body && req.body.queue) || [];
    if (!Array.isArray(queue)) return res.status(400).json({ error: "queue must be an array" });
    const cleaned = queue.map((v) => Number(v)).filter((n) => !isNaN(n) && n > 0 && n <= 100000).map((n) => Number(n.toFixed(2)));
    state[curr].manualQueue = cleaned;
    res.json({ success: true, queue: cleaned });
  });

  app.post("/api/admin/aviator-fun/manual/clear", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    state[curr].manualQueue = [];
    res.json({ success: true });
  });

  app.post("/api/admin/aviator-fun/manual/remove", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    const s = state[curr];
    const i = Number(req.body && req.body.index);
    if (isNaN(i) || i < 0 || i >= (s.manualQueue || []).length) return res.status(400).json({ error: "Invalid index" });
    s.manualQueue.splice(i, 1);
    res.json({ success: true, queue: s.manualQueue });
  });

  // Force immediate crash of the current flying round (safety kill switch)
  app.post("/api/admin/aviator-fun/force-crash", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    const s = state[curr];
    if (s.phase !== "flying") return res.status(400).json({ error: "Not in flying phase" });
    const now = Date.now();
    const elapsed = now - s.flightStartTime;
    s.crashAt = Math.max(1.0, Number(multiplierAt(elapsed).toFixed(2)));
    res.json({ success: true, crashAt: s.crashAt });
  });

  // Reset cumulative ledger for a currency
  app.post("/api/admin/aviator-fun/reset-ledger", requireAdmin, (req, res) => {
    const curr = pickCurr(req);
    state[curr].cumPool = 0;
    state[curr].cumPaid = 0;
    res.json({ success: true });
  });
}

module.exports = { mountAviatorFun };
