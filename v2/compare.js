// Comparison rules:
// - two values of a goal are "about the same" when under 2% apart, measured against the
//   best value; noise results in dB are about the same within 1 dB (about the smallest
//   difference people can hear);
// - an option wins a goal only when it is best and not about the same as the next.
export const ABOUT_THE_SAME = 0.02;
export const ABOUT_THE_SAME_DB = 1;

// How far `value` is from `best`, as a fraction of the best value.
export function behind(value, best) {
    if (value === best) return 0;
    return best ? Math.abs(value - best) / Math.abs(best) : Infinity;
}

// Results measured in decibels, e.g. "Noise from Pool & Deck [dB(A)]".
const inDecibels = (goal) => /\[\s*dB/i.test(goal.label);

export function aboutTheSame(goal, value, best) {
    return inDecibels(goal) ? Math.abs(value - best) < ABOUT_THE_SAME_DB : behind(value, best) < ABOUT_THE_SAME;
}

// Ranks `options` on goal `goal` (dir +1 or -1).
// rows: best first, each { option, value, behind, status: "best" | "same" | "behind" }
// winner: the option that wins the goal, or null when the top is about the same.
export function rankGoal(options, goal) {
    const rows = options
        .filter((o) => Number.isFinite(o.values[goal.col]))
        .map((o) => ({ option: o, value: o.values[goal.col] }))
        .sort((a, b) => goal.dir * (b.value - a.value));
    const best = rows.length ? rows[0].value : 0;
    rows.forEach((r, i) => {
        r.behind = behind(r.value, best);
        r.status = i === 0 ? "best" : aboutTheSame(goal, r.value, best) ? "same" : "behind";
    });
    const next = rows[1];
    const winner = next && next.status === "behind" ? rows[0].option : null;
    return { goal, rows, winner, runnerUp: next ? next.option : null, lead: next ? next.behind : 0 };
}

export const rankGoals = (options, goals) => goals.map((g) => rankGoal(options, g));
