import { motion } from "framer-motion";
import { Monitor, Brain, Shield, Link } from "lucide-react";

const components = [
  {
    icon: Monitor,
    title: "Frontend (React)",
    responsibilities: [
      "Browser-based game rendering & interaction",
      "Wallet connection (MetaMask / WalletConnect)",
      "In-game swap UI for MONARD ↔ ETH",
      "Display AI-adjusted difficulty & reward rates",
      "Calls AI Agent API for game state updates",
    ],
    constraint: "No direct smart contract writes — all TXs go through MCP",
  },
  {
    icon: Brain,
    title: "AI Agent",
    responsibilities: [
      "Analyzes player performance metrics",
      "Calculates dynamic difficulty adjustments",
      "Determines reward multipliers per session",
      "Returns structured decisions as JSON",
      "Stateless — no wallet, no keys, no chain access",
    ],
    constraint: "Pure computation only. Never signs or sends transactions",
  },
  {
    icon: Shield,
    title: "MCP Server",
    responsibilities: [
      "Receives AI decisions via API",
      "Validates & sanitizes all actions",
      "Holds the server wallet / signer",
      "Builds, signs & submits on-chain transactions",
      "Rate-limits and logs all blockchain interactions",
    ],
    constraint: "Single point of blockchain access. Auditable action queue",
  },
  {
    icon: Link,
    title: "Smart Contracts",
    responsibilities: [
      "MONARD.sol — ERC-20 token with mint/burn for rewards",
      "LiquidityPool.sol — simple constant-product AMM",
      "RewardVault.sol — holds reward pool, MCP-only mint access",
    ],
    constraint: "Immutable on-chain. Only MCP server wallet is authorized to mint",
  },
];

const ComponentsSection = () => {
  return (
    <section className="py-24 px-6 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold mb-4 text-center font-display"
        >
          Component Responsibilities
        </motion.h2>
        <p className="text-muted-foreground text-center mb-16 max-w-lg mx-auto">
          Each layer has a single job. Clear boundaries, zero ambiguity.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {components.map((comp, i) => (
            <motion.div
              key={comp.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <comp.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold font-display">{comp.title}</h3>
              </div>

              <ul className="space-y-2 mb-4">
                {comp.responsibilities.map((r) => (
                  <li key={r} className="text-sm text-foreground/80 flex items-start gap-2">
                    <span className="text-primary mt-1 text-xs">▸</span>
                    {r}
                  </li>
                ))}
              </ul>

              <div className="px-3 py-2 rounded-md bg-muted text-xs font-mono text-muted-foreground">
                ⚠ {comp.constraint}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ComponentsSection;
