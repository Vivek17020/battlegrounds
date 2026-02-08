import HeroSection from "@/components/HeroSection";
import ArchitectureSection from "@/components/ArchitectureSection";
import ComponentsSection from "@/components/ComponentsSection";
import UserFlowSection from "@/components/UserFlowSection";
import ConstraintsSection from "@/components/ConstraintsSection";

const Index = () => {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <ArchitectureSection />
      <ComponentsSection />
      <UserFlowSection />
      <ConstraintsSection />
      <footer className="py-12 text-center border-t border-border">
        <p className="text-xs font-mono text-muted-foreground">
          MONARD · MVP Architecture Document · Built for builders
        </p>
      </footer>
    </main>
  );
};

export default Index;
