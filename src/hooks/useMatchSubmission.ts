// ============================================
// MATCH SUBMISSION HOOK
// Handles wallet-signed submissions with deduplication
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { MatchResult } from '@/game/battle-royale/types';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export type SubmissionStatus = 
  | 'idle'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'rejected'
  | 'error';

export interface SubmissionResult {
  allowed: boolean;
  matchId: string;
  reasonCode: string;
  reasonMessage: string;
  calculatedReward: number;
  riskScore: number;
  validationFlags: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  rewardBreakdown?: {
    base: number;
    placement: number;
    kills: number;
    survival: number;
    penalties: number;
    final: number;
  };
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
}

export interface UseMatchSubmissionReturn {
  // State
  status: SubmissionStatus;
  lastResult: SubmissionResult | null;
  wallet: WalletState;
  pendingMatchId: string | null;
  
  // Actions
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
  submitMatch: (result: MatchResult) => Promise<SubmissionResult | null>;
  clearResult: () => void;
  
  // Helpers
  isSubmitting: boolean;
  hasWallet: boolean;
  canSubmit: boolean;
}

// ─────────────────────────────────────────────
// SUBMITTED MATCH TRACKING (Deduplication)
// ─────────────────────────────────────────────
const SUBMITTED_MATCHES_KEY = 'mcp_submitted_matches';
const MAX_STORED_MATCHES = 100;

function getSubmittedMatches(): Set<string> {
  try {
    const stored = localStorage.getItem(SUBMITTED_MATCHES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      return new Set(parsed);
    }
  } catch (e) {
    console.warn('[MatchSubmission] Failed to load submitted matches:', e);
  }
  return new Set();
}

function markMatchAsSubmitted(matchId: string): void {
  try {
    const matches = getSubmittedMatches();
    matches.add(matchId);
    
    // Keep only last N matches to prevent localStorage bloat
    const matchArray = Array.from(matches);
    if (matchArray.length > MAX_STORED_MATCHES) {
      matchArray.splice(0, matchArray.length - MAX_STORED_MATCHES);
    }
    
    localStorage.setItem(SUBMITTED_MATCHES_KEY, JSON.stringify(matchArray));
  } catch (e) {
    console.warn('[MatchSubmission] Failed to save submitted match:', e);
  }
}

function isMatchAlreadySubmitted(matchId: string): boolean {
  return getSubmittedMatches().has(matchId);
}

// ─────────────────────────────────────────────
// WALLET UTILITIES
// ─────────────────────────────────────────────
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

async function requestWalletConnection(): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available');
    }

    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    }) as string;

    return {
      connected: true,
      address: accounts[0].toLowerCase(),
      chainId: parseInt(chainId, 16),
    };
  } catch (error) {
    if ((error as { code?: number }).code === 4001) {
      throw new Error('Wallet connection rejected by user');
    }
    throw error;
  }
}

async function signMessage(message: string): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No wallet connected');
  }

  const accounts = await window.ethereum.request({
    method: 'eth_accounts',
  }) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts connected');
  }

  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, accounts[0]],
  }) as string;

  return signature;
}

// ─────────────────────────────────────────────
// NONCE GENERATION
// ─────────────────────────────────────────────
function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────
export function useMatchSubmission(): UseMatchSubmissionReturn {
  const { toast } = useToast();
  
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [lastResult, setLastResult] = useState<SubmissionResult | null>(null);
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    chainId: null,
  });
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  
  const submissionInProgressRef = useRef<string | null>(null);

  // ─── Wallet Connection ───
  const connectWallet = useCallback(async (): Promise<boolean> => {
    try {
      const walletState = await requestWalletConnection();
      setWallet(walletState);
      
      toast({
        title: 'Wallet Connected',
        description: `Connected to ${walletState.address?.slice(0, 6)}...${walletState.address?.slice(-4)}`,
      });
      
      return true;
    } catch (error) {
      console.error('[MatchSubmission] Wallet connection error:', error);
      
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect wallet',
        variant: 'destructive',
      });
      
      return false;
    }
  }, [toast]);

  const disconnectWallet = useCallback(() => {
    setWallet({ connected: false, address: null, chainId: null });
    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected',
    });
  }, [toast]);

  // ─── Listen for wallet changes ───
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        setWallet({ connected: false, address: null, chainId: null });
      } else {
        setWallet(prev => ({
          ...prev,
          connected: true,
          address: accountList[0].toLowerCase(),
        }));
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      setWallet(prev => ({
        ...prev,
        chainId: parseInt(chainId as string, 16),
      }));
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  // ─── Match Submission ───
  const submitMatch = useCallback(async (result: MatchResult): Promise<SubmissionResult | null> => {
    // Validate match has required data
    if (!result.matchId || !result.antiCheatSignals) {
      console.warn('[MatchSubmission] Missing matchId or antiCheatSignals');
      return null;
    }

    // Skip solo matches
    if (result.playerCount === 1) {
      console.log('[MatchSubmission] Skipping solo match submission');
      return null;
    }

    // Check for duplicate submission
    if (isMatchAlreadySubmitted(result.matchId)) {
      console.warn('[MatchSubmission] Match already submitted:', result.matchId);
      toast({
        title: 'Already Submitted',
        description: 'This match has already been submitted',
        variant: 'destructive',
      });
      return null;
    }

    // Prevent concurrent submissions of same match
    if (submissionInProgressRef.current === result.matchId) {
      console.warn('[MatchSubmission] Submission already in progress:', result.matchId);
      return null;
    }

    submissionInProgressRef.current = result.matchId;
    setPendingMatchId(result.matchId);

    try {
      // Step 1: Ensure wallet is connected
      let walletAddress = wallet.address;
      
      if (!wallet.connected || !walletAddress) {
        setStatus('signing');
        const connected = await connectWallet();
        if (!connected) {
          setStatus('error');
          return null;
        }
        walletAddress = wallet.address;
      }

      if (!walletAddress) {
        throw new Error('No wallet address available');
      }

      // Step 2: Sign the match payload
      setStatus('signing');
      
      const nonce = generateNonce();
      const timestamp = Date.now();
      
      const messageToSign = [
        'Monard Battle Royale Match Submission',
        '',
        `Match ID: ${result.matchId}`,
        `Placement: ${result.placement}/${result.playerCount}`,
        `Kills: ${result.kills}`,
        `Duration: ${Math.round(result.survivalTime)}s`,
        `Nonce: ${nonce.slice(0, 16)}...`,
        `Timestamp: ${new Date(timestamp).toISOString()}`,
      ].join('\n');

      let walletSignature: string;
      try {
        walletSignature = await signMessage(messageToSign);
      } catch (error) {
        console.error('[MatchSubmission] Signing failed:', error);
        toast({
          title: 'Signing Cancelled',
          description: 'You must sign the message to submit your match',
          variant: 'destructive',
        });
        setStatus('error');
        return null;
      }

      // Step 3: Submit to MCP
      setStatus('submitting');

      const payload = {
        walletAddress,
        matchId: result.matchId,
        placement: result.placement,
        playerCount: result.playerCount || 2,
        durationMs: result.durationMs || Math.round(result.survivalTime * 1000),
        kills: result.kills,
        antiCheat: result.antiCheatSignals,
        timestamp,
        nonce,
        clientSignature: walletSignature,
      };

      console.log('[MatchSubmission] Submitting match:', {
        matchId: payload.matchId,
        placement: payload.placement,
        playerCount: payload.playerCount,
      });

      // Import supabase dynamically to avoid circular deps
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data, error } = await supabase.functions.invoke('mcp-match-submit', {
        body: payload,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error');
      }

      const submissionResult: SubmissionResult = {
        allowed: data.data.allowed,
        matchId: data.data.matchId,
        reasonCode: data.data.reasonCode,
        reasonMessage: data.data.reasonMessage,
        calculatedReward: data.data.calculatedReward,
        riskScore: data.data.riskScore,
        validationFlags: data.data.validationFlags || [],
        rewardBreakdown: data.data.rewardBreakdown,
      };

      setLastResult(submissionResult);

      // Mark as submitted to prevent duplicates
      markMatchAsSubmitted(result.matchId);

      if (submissionResult.allowed) {
        setStatus('success');
        toast({
          title: 'Match Submitted!',
          description: `Earned ${submissionResult.calculatedReward} MONARD`,
        });
      } else {
        setStatus('rejected');
        toast({
          title: 'Match Rejected',
          description: submissionResult.reasonMessage,
          variant: 'destructive',
        });
      }

      return submissionResult;

    } catch (error) {
      console.error('[MatchSubmission] Submission error:', error);
      setStatus('error');
      
      toast({
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'Failed to submit match',
        variant: 'destructive',
      });
      
      return null;
    } finally {
      submissionInProgressRef.current = null;
      setPendingMatchId(null);
    }
  }, [wallet, connectWallet, toast]);

  // ─── Clear Result ───
  const clearResult = useCallback(() => {
    setLastResult(null);
    setStatus('idle');
  }, []);

  return {
    status,
    lastResult,
    wallet,
    pendingMatchId,
    connectWallet,
    disconnectWallet,
    submitMatch,
    clearResult,
    isSubmitting: status === 'signing' || status === 'submitting',
    hasWallet: !!window.ethereum,
    canSubmit: wallet.connected && status !== 'signing' && status !== 'submitting',
  };
}
