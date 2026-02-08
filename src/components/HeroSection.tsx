import { motion } from "framer-motion";
import { Zap, Play, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const HeroSection = () => {
  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent/5 blur-[100px]" />

      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-glow bg-secondary/50 mb-8">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono text-primary tracking-wider uppercase">
              MVP Architecture
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 font-display">
            <span className="text-gradient-primary">MONARD</span>
            <br />
            <span className="text-foreground/80 text-3xl md:text-4xl font-light">
              AI-Powered Web3 Game
            </span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-8">
            Play. Earn. Swap. An AI agent adjusts difficulty &amp; rewards while an MCP server 
            bridges decisions to the blockchain — safely.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link to="/play">
              <Button size="lg" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-mono">
                <Play className="w-4 h-4" />
                Play Now
              </Button>
            </Link>
            <Link to="/battle">
              <Button size="lg" variant="outline" className="gap-2 font-mono border-destructive/30 text-destructive hover:bg-destructive/10">
                <Swords className="w-4 h-4" />
                Battle Royale
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
