import { motion } from "framer-motion";

const layers = [
  {
    label: "Frontend",
    color: "primary",
    items: ["React Game UI", "Wallet Connect", "Swap Interface"],
    desc: "Browser-based game + wallet integration",
  },
  {
    label: "AI Agent",
    color: "accent",
    items: ["Difficulty Engine", "Reward Calculator", "Player Analytics"],
    desc: "Adjusts gameplay via off-chain decisions",
  },
  {
    label: "MCP Server",
    color: "warm",
    items: ["Action Queue", "Validation Layer", "TX Builder"],
    desc: "Bridges AI decisions → blockchain safely",
  },
  {
    label: "Smart Contracts",
    color: "primary",
    items: ["MONARD ERC-20", "Liquidity Pool", "Reward Vault"],
    desc: "On-chain token + swap mechanics",
  },
];

const colorMap: Record<string, string> = {
  primary: "border-primary/30 bg-primary/5",
  accent: "border-accent/30 bg-accent/5",
  warm: "border-glow-warm/30 bg-glow-warm/5",
};

const dotColor: Record<string, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  warm: "bg-glow-warm",
};

const ArchitectureSection = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold mb-4 text-center font-display"
        >
          System Architecture
        </motion.h2>
        <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
          Four clean layers. AI never touches the blockchain directly.
        </p>

        <div className="relative space-y-6">
          {/* Vertical connector line */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-primary/40 via-accent/40 to-primary/40 hidden md:block" />

          {layers.map((layer, i) => (
            <motion.div
              key={layer.label}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative md:ml-16 rounded-xl border p-6 ${colorMap[layer.color]}`}
            >
              {/* Connector dot */}
              <div className={`absolute -left-[2.55rem] top-8 w-3 h-3 rounded-full ${dotColor[layer.color]} hidden md:block ring-4 ring-background`} />

              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1">
                  <h3 className="font-mono text-sm tracking-wider uppercase text-muted-foreground mb-1">
                    Layer {i + 1}
                  </h3>
                  <h4 className="text-xl font-semibold mb-2 font-display">{layer.label}</h4>
                  <p className="text-sm text-muted-foreground">{layer.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <span
                      key={item}
                      className="px-3 py-1 text-xs font-mono rounded-md bg-secondary text-secondary-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Arrow labels between layers */}
          {["API Calls", "Signed Actions", "Transactions"].map((label, i) => (
            <div key={label} className="hidden md:flex items-center gap-2 ml-16 pl-4 -my-2">
              <span className="text-xs font-mono text-muted-foreground/60">↓ {label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ArchitectureSection;
