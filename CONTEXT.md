# Design Explorer

A tool for comparing the design options of an architecture study (for example, massing paths of a masterplan) by their inputs, results, images and 3D analysis.

## Language

### The dataset

**Study**:
One dataset of design options from one project folder (for example, 01_cp). Several studies can be open together, usually one per method that generated the options.
_Avoid_: Dataset, CSV, folder (when talking about the domain)

**Method**:
The way a study's options were generated; when several studies are open, each one is shown as a method, named by its folder (for example, 01_cp and 02_veA).
_Avoid_: Generation, algorithm, group

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
Two values of a goal that are less than 2% apart, or within 1 dB for noise; neither option is better on that goal.
_Avoid_: Equal, tie

**Shortlist**:
The few options (up to 4) a person picked on purpose to compare closely, side by side in Compare options. Different from filtering, which only hides options.
_Avoid_: Selection, comparison set, favourites

**Win**:
An option wins a goal when it is the best on it and not about the same as the next option; when the top is about the same, nobody wins.
_Avoid_: Point, score

**Best balance**:
The option with the best average position across all goals of the study.
_Avoid_: Overall winner, best option
