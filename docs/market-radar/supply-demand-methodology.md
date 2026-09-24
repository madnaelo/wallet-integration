# Supply and Demand Methodology

## Quality first

Exclude stale, crossed, shallow, low-turnover, wide-spread or outlier venues.
Reference price is the median healthy midpoint. Default spread limit is 50 bps,
venue midpoint deviation 100 bps, at least 20 levels per side, two healthy venues
and two minutes of observations. Each side must meet quote-denominated minimum
notional depth. No qualifying data means no invented zone.

## Bands and persistence

Aggregate price * quantity into logarithmic 25-bps bands within 1500 bps of
reference. A candidate must be at least 2.5 times median populated nearby-band
depth, with at least four populated bands. Adjacent concentrated bands are merged
into ranges. Supply is above price; demand below. An existing zone can be tested
when price enters it. The nearest three ranges on each side are retained.

Persistence measures continuously observed concentration, not the age of an
individual order. Falling below the threshold, disappearance or a long gap
resets persistence. Newly joined bands conservatively shorten merged persistence.

## Executions and absorption

Use public taker-side executions, not depth cancellations masquerading as trades.
Between calculations compare incoming buy notional at supply (sell at demand)
with previous and current aggregate liquidity. Surviving/replenished depth plus
meaningful incoming executions supports replenishment. Decreasing depth with
matching executions supports consumption and weakening. No executions means
not enough recent trades, not a confident absorption conclusion.

CVD is aggressive buy minus sell notional over retained trades. Volume-at-price
shows high/low activity relative to collected bands, with actual history duration.
Five samples on either side identify simple swing extrema; repeated contacts
support context. This is sampled local history, not a full historical profile.

## Reliability and venue agreement

Repeated reductions without corresponding executions, quick disappearance, and
similar-sized walls moving away as price approaches reduce reliability. These
aggregate heuristics cannot identify traders or prove manipulation. Executed
consumption is not penalized as cancellation.

Consensus uses square-root quote-turnover weights among healthy venues for the
same instrument, not equal votes. A dominant venue's disagreement reduces score.
This does not combine different quote currencies or assume stablecoins are equal.

## Lifecycle

Forming -> active, strengthening/weakening, under test, absorbing, broken or stale.
An eight-point change is material. Price crossing the far edge marks a prior zone
broken. Vanished ranges move to previous zones and are not shown as current
support/resistance. Prior scores remain historical evidence, not current estimates.
