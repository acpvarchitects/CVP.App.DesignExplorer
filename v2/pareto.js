// Pareto front: the options that no other option beats on every chosen goal.
// a dominates b when a is at least as good as b on every goal and better on at least one
// (↓ goals compared with the sign flipped). A missing value counts as the worst possible.

// options: [{ values: { col: number } }], goals: [{ col, dir }] (dir 1 = higher better, -1 = lower)
// -> Set of the options on the front.
export function paretoFront(options, goals) {
    const score = options.map((o) =>
        goals.map((m) => {
            const v = o.values[m.col];
            return Number.isFinite(v) ? v * m.dir : -Infinity;
        })
    );
    const dominates = (a, b) => {
        let better = false;
        for (let k = 0; k < a.length; k++) {
            if (a[k] < b[k]) return false;
            if (a[k] > b[k]) better = true;
        }
        return better;
    };
    const front = new Set();
    score.forEach((s, i) => {
        if (!score.some((t, j) => j !== i && dominates(t, s))) front.add(options[i]);
    });
    return front;
}
