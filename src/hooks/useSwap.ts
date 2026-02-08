import { useState, useCallback, useEffect, useRef } from "react";
import {
  SwapPair,
  SwapDirection,
  SwapQuote,
  SwapStatus,
  SwapResult,
} from "@/game/swap/types";
import {
  getSwapQuote,
  executeSwap,
  getSpotPrices,
} from "@/game/swap/liquidity-pool";
import { supabase } from "@/integrations/supabase/client";

interface UseSwapOptions {
  monardBalance: number;
  onBalanceChange: (delta: number, direction: SwapDirection) => void;
}

interface MCPValidationResult {
  approved: boolean;
  approvalToken: string;
  riskScore: number;
  warnings: string[];
  expiresAt: number;
}

export function useSwap({ monardBalance, onBalanceChange }: UseSwapOptions) {
  const [pair, setPair] = useState<SwapPair>("MONARD/ETH");
  const [direction, setDirection] = useState<SwapDirection>("sell");
  const [inputAmount, setInputAmount] = useState("");
  const [slippage, setSlippage] = useState(0.005); // 0.5%
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [lastResult, setLastResult] = useState<SwapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // MCP validation state
  const [mcpApproval, setMcpApproval] = useState<MCPValidationResult | null>(null);
  const [mcpWarnings, setMcpWarnings] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const sessionId = useRef(crypto.randomUUID());

  const numAmount = parseFloat(inputAmount) || 0;

  // Debounced quote refresh
  useEffect(() => {
    if (numAmount <= 0) {
      setQuote(null);
      setMcpApproval(null);
      setMcpWarnings([]);
      return;
    }

    setStatus("quoting");
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      try {
        const q = getSwapQuote(pair, direction, numAmount, slippage);
        setQuote(q);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Quote failed");
        setQuote(null);
      }
      setStatus("idle");
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [numAmount, pair, direction, slippage]);

  // Clear MCP approval when params change
  useEffect(() => {
    setMcpApproval(null);
    setMcpWarnings([]);
  }, [numAmount, pair, direction, slippage]);

  const canSwap = useCallback(() => {
    if (numAmount <= 0 || !quote) return false;
    if (direction === "sell" && numAmount > monardBalance) return false;
    return true;
  }, [numAmount, quote, direction, monardBalance]);

  // Step 1: Validate with MCP before swap
  const validateWithMCP = useCallback(async (): Promise<boolean> => {
    if (!canSwap()) return false;

    setValidating(true);
    setError(null);
    setMcpWarnings([]);

    try {
      const nonce = crypto.randomUUID();
      const timestamp = Date.now();

      // For demo: use a mock wallet address
      const playerAddress = "0x" + "1".repeat(40);

      const { data, error: invokeError } = await supabase.functions.invoke("mcp-swap-validate", {
        body: {
          sessionId: sessionId.current,
          playerAddress,
          pair,
          direction,
          inputAmount: numAmount,
          slippageTolerance: slippage,
          nonce,
          timestamp,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || "MCP validation failed");
      }

      if (!data.success) {
        const errorMsg = data.error?.message || "Swap not approved";
        setError(errorMsg);
        setMcpWarnings(data.data?.warnings || []);
        setValidating(false);
        return false;
      }

      // Store approval
      setMcpApproval(data.data);
      setMcpWarnings(data.data.warnings || []);
      setValidating(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MCP validation error";
      setError(msg);
      setValidating(false);
      return false;
    }
  }, [canSwap, pair, direction, numAmount, slippage]);

  // Step 2: Execute swap (only after MCP approval)
  const executeApprovedSwap = useCallback(async () => {
    if (!mcpApproval || !mcpApproval.approved) {
      setError("Swap not approved by MCP");
      return;
    }

    // Check if approval expired
    if (Date.now() > mcpApproval.expiresAt) {
      setError("Approval expired — please re-validate");
      setMcpApproval(null);
      return;
    }

    setStatus("executing");
    setError(null);

    try {
      const result = await executeSwap(pair, direction, numAmount, slippage);

      const swapResult: SwapResult = {
        success: true,
        txHash: result.txHash,
        inputAmount: numAmount,
        outputAmount: result.outputAmount,
        executionPrice: result.executionPrice,
        fee: result.fee,
      };

      setLastResult(swapResult);
      setStatus("success");

      // Update balances
      if (direction === "sell") {
        onBalanceChange(-numAmount, direction);
      } else {
        onBalanceChange(result.outputAmount, direction);
      }

      // Reset after delay
      setTimeout(() => {
        setInputAmount("");
        setQuote(null);
        setStatus("idle");
        setLastResult(null);
        setMcpApproval(null);
        setMcpWarnings([]);
      }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      setError(msg);
      setLastResult({
        success: false,
        inputAmount: numAmount,
        outputAmount: 0,
        executionPrice: 0,
        fee: 0,
        error: msg,
      });
      setStatus("error");

      setTimeout(() => {
        setStatus("idle");
        setError(null);
        setLastResult(null);
        setMcpApproval(null);
      }, 4000);
    }
  }, [mcpApproval, pair, direction, numAmount, slippage, onBalanceChange]);

  // Combined flow: validate → confirm → execute
  const submitSwap = useCallback(async () => {
    if (!canSwap()) return;

    // If already approved, execute
    if (mcpApproval?.approved) {
      await executeApprovedSwap();
      return;
    }

    // Otherwise, validate first
    setStatus("confirming");
    const approved = await validateWithMCP();
    
    if (!approved) {
      setStatus("idle");
    }
    // If approved, user must click again to confirm
  }, [canSwap, mcpApproval, validateWithMCP, executeApprovedSwap]);

  const cancelApproval = useCallback(() => {
    setMcpApproval(null);
    setMcpWarnings([]);
    setStatus("idle");
  }, []);

  const setMaxInput = useCallback(() => {
    if (direction === "sell") {
      setInputAmount(monardBalance.toString());
    }
  }, [direction, monardBalance]);

  const flipDirection = useCallback(() => {
    setDirection((d) => (d === "sell" ? "buy" : "sell"));
    setInputAmount("");
    setQuote(null);
    setMcpApproval(null);
    setMcpWarnings([]);
  }, []);

  const spotPrices = getSpotPrices();

  return {
    pair,
    setPair,
    direction,
    setDirection,
    flipDirection,
    inputAmount,
    setInputAmount,
    slippage,
    setSlippage,
    status,
    quote,
    lastResult,
    error,
    canSwap: canSwap(),
    submitSwap,
    setMaxInput,
    spotPrices,
    // MCP validation
    mcpApproval,
    mcpWarnings,
    validating,
    cancelApproval,
    executeApprovedSwap,
  };
}
