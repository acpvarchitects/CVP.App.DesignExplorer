# Design Explorer

A tool for comparing the design options of an architecture study (for example, massing paths of a masterplan) by their inputs, results, images and 3D analysis.

## Language

### The dataset

**Study**:
One dataset of design options, loaded as a project (for example, Export).
_Avoid_: Dataset, CSV (when talking about the domain)

**Option**:
One design alternative in a study: one row of the dataset (for example, Path 28).
_Avoid_: Design, iteration, row, path (unless it is the study's own name)

**Input**:
A parameter that defines an option (an `in:` column).
_Avoid_: Variable, driver

**Result**:
A measured outcome of an option (an `out:` column), with or without a better/worse direction.
_Avoid_: Output, metric, KPI

**Goal**:
A result with a direction (`↑` higher is better, `↓` lower is better), so options can be called better or worse on it.
_Avoid_: Aspect, objective, criterion

### Comparing

**About the same**:
Two values of a goal that are less than 2% apart; neither option is better on that goal.
_Avoid_: Equal, tie
