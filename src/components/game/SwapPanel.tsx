import React, { useState } from "react";
import {
  ArrowDownUp,
  Loader2,
  Check,
  AlertTriangle,
  Settings,
  ShieldCheck,
  X,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwap } from "@/hooks/useSwap";
import { SwapPair, SwapDirection, TOKENS } from "@/game/swap/types";

interface SwapPanelProps {
  monardBalance: number;
  onBalanceChange: (delta: number, direction: SwapDirection) => void;
}

const SLIPPAGE_OPTIONS = [0.001, 0.005, 0.01, 0.03];

const SwapPanel = ({ monardBalance, onBalanceChange }: SwapPanelProps) => {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const swap = useSwap({ monardBalance, onBalanceChange });

  const quoteToken = swap.pair.split("/")[1];

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10 font-mono text-xs"
      >
        <ArrowDownUp className="w-3.5 h-3.5" />
        Swap
      </Button>
    );
  }

  return (
    <div className="w-80 rounded-xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-semibold">Swap Tokens</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Balance Display */}
      <div className="mx-4 mb-2 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Your MONARD</span>
          </div>
          <span className="text-lg font-bold font-mono text-primary">
            {monardBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Slippage settings */}
      {showSettings && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-muted/50 border border-border">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Slippage Tolerance
          </span>
          <div className="flex gap-1.5 mt-1.5">
            {SLIPPAGE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => swap.setSlippage(s)}
                className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${
                  swap.slippage === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {(s * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pair selector */}
      <div className="px-4 pb-2">
        <div className="flex rounded-lg overflow-hidden border border-border">
          {(["MONARD/ETH", "MONARD/USDC"] as SwapPair[]).map((p) => (
            <button
              key={p}
              onClick={() => swap.setPair(p)}
              disabled={!!swap.mcpApproval}
              className={`flex-1 py-1.5 text-[10px] font-mono transition-colors disabled:opacity-50 ${
                swap.pair === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input section */}
      <div className="px-4 space-y-2">
        {/* From */}
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">You pay</span>
            {swap.direction === "sell" && (
              <button
                onClick={swap.setMaxInput}
                disabled={!!swap.mcpApproval}
                className="text-[10px] font-mono text-primary hover:underline disabled:opacity-50"
              >
                MAX
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={swap.inputAmount}
              onChange={(e) => swap.setInputAmount(e.target.value)}
              placeholder="0.00"
              disabled={!!swap.mcpApproval}
              className="flex-1 bg-transparent text-lg font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs font-mono shrink-0">
              <span>{TOKENS[swap.direction === "sell" ? "MONARD" : quoteToken].icon}</span>
              <span>{swap.direction === "sell" ? "MONARD" : quoteToken}</span>
            </div>
          </div>
        </div>

        {/* Flip button */}
        <div className="flex justify-center -my-1 relative z-10">
          <button
            onClick={swap.flipDirection}
            disabled={!!swap.mcpApproval}
            className="p-1.5 rounded-full border border-border bg-card hover:bg-secondary transition-colors shadow-sm disabled:opacity-50"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* To */}
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">You receive</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-lg font-mono text-foreground">
              {swap.quote
                ? swap.quote.outputAmount.toFixed(
                    swap.direction === "sell" && quoteToken === "ETH" ? 6 : 2
                  )
                : "0.00"}
            </span>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs font-mono shrink-0">
              <span>{TOKENS[swap.direction === "sell" ? quoteToken : "MONARD"].icon}</span>
              <span>{swap.direction === "sell" ? quoteToken : "MONARD"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quote details */}
      {swap.quote && !swap.mcpApproval && (
        <div className="mx-4 mt-2 p-2.5 rounded-lg bg-muted/30 space-y-1">
          <QuoteLine
            label="Price"
            value={`1 MONARD = ${swap.spotPrices[swap.pair].monardPrice} ${quoteToken}`}
          />
          <QuoteLine
            label="Price Impact"
            value={`${swap.quote.priceImpact}%`}
            warn={swap.quote.priceImpact > 1}
          />
          <QuoteLine label="Fee (0.3%)" value={`${swap.quote.fee} ${swap.quote.inputToken}`} />
          <QuoteLine
            label="Min. received"
            value={`${swap.quote.minimumReceived} ${swap.quote.outputToken}`}
          />
          <QuoteLine label="Slippage" value={`${(swap.slippage * 100).toFixed(1)}%`} />
        </div>
      )}

      {/* MCP Approval Confirmation */}
      {swap.mcpApproval && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-primary/10 border border-primary/30 space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-semibold">MCP Validated</span>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              Risk: {swap.mcpApproval.riskScore}%
            </span>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-border/50">
            <ConfirmLine
              label="Selling"
              value={`${swap.inputAmount} ${swap.direction === "sell" ? "MONARD" : quoteToken}`}
            />
            <ConfirmLine
              label="Receiving"
              value={`≈ ${swap.quote?.outputAmount.toFixed(4)} ${swap.direction === "sell" ? quoteToken : "MONARD"}`}
            />
            <ConfirmLine label="Slippage" value={`${(swap.slippage * 100).toFixed(1)}%`} />
          </div>

          {swap.mcpWarnings.length > 0 && (
            <div className="space-y-1">
              {swap.mcpWarnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-destructive"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Confirm within{" "}
            <CountdownTimer expiresAt={swap.mcpApproval.expiresAt} onExpire={swap.cancelApproval} />
          </p>
        </div>
      )}

      {/* Error */}
      {swap.error && (
        <div className="mx-4 mt-2 flex items-center gap-1.5 text-destructive text-[10px] font-mono">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {swap.error}
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 pt-3 space-y-2">
        {swap.mcpApproval ? (
          <div className="flex gap-2">
            <Button
              onClick={swap.cancelApproval}
              variant="outline"
              size="sm"
              className="flex-1 font-mono text-xs gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button>
            <Button
              onClick={swap.executeApprovedSwap}
              disabled={swap.status === "executing"}
              size="sm"
              className="flex-1 font-mono text-xs gap-1"
            >
              {swap.status === "executing" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Swapping…
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Confirm Swap
                </>
              )}
            </Button>
          </div>
        ) : (
          <SwapButton
            status={swap.status}
            canSwap={swap.canSwap}
            validating={swap.validating}
            onSubmit={swap.submitSwap}
            lastResult={swap.lastResult}
          />
        )}
      </div>

      {/* TX result */}
      {swap.lastResult?.success && swap.lastResult.txHash && (
        <div className="px-4 pb-4 -mt-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <Check className="w-3 h-3 text-primary" />
            <span className="truncate">
              TX: {swap.lastResult.txHash.slice(0, 10)}…{swap.lastResult.txHash.slice(-6)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──

function QuoteLine({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px] font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className={warn ? "text-destructive font-semibold" : "text-foreground"}>{value}</span>
    </div>
  );
}

function ConfirmLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );

  // Effect to handle countdown
  React.useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  return <span className="font-semibold text-foreground">{remaining}s</span>;
}

function SwapButton({
  status,
  canSwap,
  validating,
  onSubmit,
  lastResult,
}: {
  status: string;
  canSwap: boolean;
  validating: boolean;
  onSubmit: () => void;
  lastResult: { success: boolean } | null;
}) {
  if (validating || status === "confirming") {
    return (
      <Button disabled className="w-full font-mono text-xs gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Validating with MCP…
      </Button>
    );
  }

  if (status === "executing") {
    return (
      <Button disabled className="w-full font-mono text-xs gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Executing Swap…
      </Button>
    );
  }

  if (status === "success" && lastResult?.success) {
    return (
      <Button
        disabled
        className="w-full font-mono text-xs gap-2 bg-primary hover:bg-primary text-primary-foreground"
      >
        <Check className="w-3.5 h-3.5" />
        Swap Complete
      </Button>
    );
  }

  if (status === "error") {
    return (
      <Button disabled variant="destructive" className="w-full font-mono text-xs gap-2">
        <AlertTriangle className="w-3.5 h-3.5" />
        Swap Failed
      </Button>
    );
  }

  return (
    <Button onClick={onSubmit} disabled={!canSwap} className="w-full font-mono text-xs gap-1">
      <ShieldCheck className="w-3.5 h-3.5" />
      {canSwap ? "Review Swap" : "Enter amount"}
    </Button>
  );
}

export default SwapPanel;
