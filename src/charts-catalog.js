// Single source of truth for the site's charts (SPX-style). Add a chart = one entry here +
// a component + a case in chartEl() (charts.jsx). Groups order the gallery + home.
export const GROUPS = [
  { id: "valuation",     name: "Valuation",              blurb: "Cheap or expensive versus what holders actually paid" },
  { id: "conviction",    name: "Holders & conviction",   blurb: "Who holds, for how long, and how deep" },
  { id: "costbasis",     name: "Cost basis",             blurb: "Where the supply was acquired" },
  { id: "flows",         name: "Flows & lifecycle",      blurb: "Who's buying, who left, who's still here" },
  { id: "concentration", name: "Concentration & ownership", blurb: "How spread out the supply is" },
  { id: "behaviour",     name: "Behaviour & flows",      blurb: "Profit-taking, coin movement, exchange supply" },
];

export const CHARTS = [
  { id: "realized",     group: "valuation",     title: "Realized price & floor", blurb: "Price vs the crowd's cost basis", feat: true },
  { id: "mvrv",         group: "valuation",     title: "MVRV",                   blurb: "Market value vs realized value", feat: true },
  { id: "nupl",         group: "valuation",     title: "NUPL",                   blurb: "Net unrealized profit / loss" },
  { id: "supplyprofit", group: "valuation",     title: "Supply in profit",       blurb: "Share of supply in the green" },

  { id: "hodl",         group: "conviction",    title: "HODL waves",             blurb: "Age of the held supply", feat: true },
  { id: "lthsth",       group: "conviction",    title: "Long vs short-term",     blurb: "Conviction split, in profit & loss" },
  { id: "holders",      group: "conviction",    title: "Holder count",           blurb: "Wallets holding over time" },
  { id: "wealthtiers",  group: "conviction",    title: "Wealth tiers",           blurb: "Supply by holder size (USD bands)" },

  { id: "urpd",         group: "costbasis",     title: "Cost-basis distribution", blurb: "Where supply was bought (URPD)", feat: true },
  { id: "urpdage",      group: "costbasis",     title: "Cost basis by age",      blurb: "Acquisition price × holding age" },

  { id: "exitflow",     group: "flows",         title: "How holders left",       blurb: "Exits in profit vs at a loss", feat: true },
  { id: "survival",     group: "flows",         title: "Who's still here",       blurb: "Arrival-cohort survival" },

  { id: "concentration", group: "concentration", title: "Concentration",         blurb: "Top-10 / top-100 share" },
  { id: "gini",         group: "concentration", title: "Gini",                   blurb: "Inequality of holdings" },
  { id: "whales",       group: "concentration", title: "Whale leaderboard",      blurb: "Largest wallets + recent flow" },
  { id: "clusters",     group: "concentration", title: "Wallet clusters",        blurb: "Who owns what (linked wallets)" },

  { id: "sopr",         group: "behaviour",     title: "SOPR",                   blurb: "Are spent coins in profit?" },
  { id: "nrpl",         group: "behaviour",     title: "Net realized P/L",       blurb: "Realized gains vs losses" },
  { id: "liveliness",   group: "behaviour",     title: "Liveliness",             blurb: "Are old coins waking up?" },
  { id: "cexsupply",    group: "behaviour",     title: "Where tradable supply sits", blurb: "LP · exchanges · burn" },
];

export const chartById = (id) => CHARTS.find((c) => c.id === id);
export const chartsInGroup = (g) => CHARTS.filter((c) => c.group === g);
export const FEATURED = CHARTS.filter((c) => c.feat);
