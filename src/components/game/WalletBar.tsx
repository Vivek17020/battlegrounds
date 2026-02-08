import { Wallet, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WalletBarProps {
  address: string | null;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
}

const WalletBar = ({ address, connected, onConnect, onDisconnect, loading }: WalletBarProps) => {
  const truncated = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <div className="flex items-center gap-3">
      {connected && truncated ? (
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-mono text-secondary-foreground border border-border">
            <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 animate-pulse" />
            {truncated}
          </span>
          <button
            onClick={onDisconnect}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <Button
          onClick={onConnect}
          disabled={loading}
          size="sm"
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-xs"
        >
          <Wallet className="w-3.5 h-3.5" />
          {loading ? "Connecting…" : "Connect Wallet"}
        </Button>
      )}
    </div>
  );
};

export default WalletBar;
