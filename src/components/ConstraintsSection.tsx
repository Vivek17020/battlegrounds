import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle } from "lucide-react";

const included = [
  "ERC-20 MONARD token",
  "Simple AMM liquidity pool",
  "AI difficulty & reward agent",
  "MCP bridge (AI → blockchain)",
  "Browser-based game frontend",
  "Wallet connect integration",
];

const excluded = [
  "NFTs",
  "DAO governance",
  "Staking mechanisms",
  "Marketplace features",
  "Multi-chain support",
  "Direct AI ↔ chain calls",
];

const ConstraintsSection = () => {
  return (
    <section className="py-24 px-6 bg-secondary/30">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold mb-4 text-center font-display"
        >
          MVP Scope
        </motion.h2>
        <p className="text-muted-foreground text-center mb-16">
          Ruthlessly scoped. Ship fast, iterate later.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-primary/20 bg-card p-6">
            <h3 className="font-mono text-sm uppercase tracking-wider text-primary mb-4">
              ✓ In Scope
            </h3>
            <ul className="space-y-3">
              {included.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-foreground/80">
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-destructive/20 bg-card p-6">
            <h3 className="font-mono text-sm uppercase tracking-wider text-destructive mb-4">
              ✗ Out of Scope
            </h3>
            <ul className="space-y-3">
              {excluded.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-destructive/60 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConstraintsSection;
