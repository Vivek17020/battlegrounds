import { motion } from "framer-motion";

const steps = [
  {
    step: "01",
    title: "Connect Wallet",
    desc: "Player connects MetaMask. Frontend reads wallet address — no private keys exposed.",
    arrow: true,
  },
  {
    step: "02",
    title: "Play Game",
    desc: "Player engages with the browser game. Performance data streams to the AI Agent.",
    arrow: true,
  },
  {
    step: "03",
    title: "AI Adjusts",
    desc: "AI Agent calculates new difficulty & reward multiplier. Returns JSON decision — never touches chain.",
    arrow: true,
  },
  {
    step: "04",
    title: "MCP Executes",
    desc: "MCP Server validates the AI decision, builds a mint TX, signs it, and submits to the blockchain.",
    arrow: true,
  },
  {
    step: "05",
    title: "Earn MONARD",
    desc: "MONARD tokens are minted to the player's wallet via RewardVault. Balance updates in-game.",
    arrow: true,
  },
  {
    step: "06",
    title: "Swap Tokens",
    desc: "Player swaps MONARD ↔ ETH using the in-game liquidity pool. Simple constant-product AMM.",
    arrow: false,
  },
];

const UserFlowSection = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold mb-4 text-center font-display"
        >
          End-to-End User Flow
        </motion.h2>
        <p className="text-muted-foreground text-center mb-16 max-w-lg mx-auto">
          Six steps from wallet connect to token swap. No complexity hidden.
        </p>

        <div className="space-y-1">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-start gap-5 p-5 rounded-xl hover:bg-secondary/40 transition-colors">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="font-mono text-sm font-bold text-primary">{s.step}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-lg mb-1 font-display">{s.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
              {s.arrow && (
                <div className="ml-[1.45rem] h-6 flex items-center">
                  <div className="w-px h-full bg-border" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UserFlowSection;
