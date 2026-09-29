// Comparison rules:
// - two values of a goal are "about the same" when under 2% apart,
//   measured against the best value;
// - an option wins a goal only when it is best and more than 2% ahead of the next.
export const ABOUT_THE_SAME = 0.02;

// How far `value` is from `best`, as a fraction of the best value.
export function behind(value, best) {
    if (value === best) return 0;
    return best ? Math.abs(value - best) / Math.abs(best) : Infinity;
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
        r.status = i === 0 ? "best" : r.behind < ABOUT_THE_SAME ? "same" : "behind";
    });
    const next = rows[1];
    const winner = next && next.status === "behind" ? rows[0].option : null;
    return { goal, rows, winner, runnerUp: next ? next.option : null, lead: next ? next.behind : 0 };
}

export const rankGoals = (options, goals) => goals.map((g) => rankGoal(options, g));

export const rowOf = (result, option) => result.rows.find((r) => r.option === option);

export const winsOf = (results, option) => results.filter((r) => r.winner === option).length;

// The options at the top of a goal: the best plus every option about the same as it.
export const topGroup = (result) => result.rows.filter((r) => r.status !== "behind").map((r) => r.option);
