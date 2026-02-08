// ============================================
// MATCH SUBMISSION UI COMPONENTS
// Displays submission status, results, and wallet connection
// ============================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Wallet, 
  AlertTriangle,
  Trophy,
  Coins,
  Shield,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  SubmissionStatus, 
  SubmissionResult, 
  WalletState 
} from '@/hooks/useMatchSubmission';

// ─────────────────────────────────────────────
// WALLET CONNECTION BUTTON
// ─────────────────────────────────────────────
interface WalletButtonProps {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  hasWallet: boolean;
  disabled?: boolean;
}

export function WalletButton({ 
  wallet, 
  onConnect, 
  onDisconnect, 
  hasWallet,
  disabled 
}: WalletButtonProps) {
  if (!hasWallet) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Wallet className="w-4 h-4" />
        No Wallet Detected
      </Button>
    );
  }

  if (wallet.connected && wallet.address) {
    return (
      <Button 
        variant="outline" 
        onClick={onDisconnect}
        className="gap-2 font-mono"
        disabled={disabled}
      >
        <Wallet className="w-4 h-4 text-primary" />
        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
      </Button>
    );
  }

  return (
    <Button 
      onClick={onConnect} 
      className="gap-2"
      disabled={disabled}
    >
      <Wallet className="w-4 h-4" />
      Connect Wallet
    </Button>
  );
}

// ─────────────────────────────────────────────
// SUBMISSION STATUS INDICATOR
// ─────────────────────────────────────────────
interface SubmissionStatusProps {
  status: SubmissionStatus;
  matchId?: string | null;
}

export function SubmissionStatusIndicator({ status, matchId }: SubmissionStatusProps) {
  if (status === 'idle') return null;

  const statusConfig = {
    signing: {
      icon: <Wallet className="w-5 h-5 animate-pulse" />,
      text: 'Waiting for signature...',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    submitting: {
      icon: <Loader2 className="w-5 h-5 animate-spin" />,
      text: 'Submitting match...',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    success: {
      icon: <CheckCircle2 className="w-5 h-5" />,
      text: 'Match submitted!',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    rejected: {
      icon: <XCircle className="w-5 h-5" />,
      text: 'Match rejected',
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    error: {
      icon: <AlertTriangle className="w-5 h-5" />,
      text: 'Submission failed',
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
  };

  const config = statusConfig[status];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${config.bg} ${config.color}`}
      >
        {config.icon}
        <span className="text-sm font-medium">{config.text}</span>
        {matchId && (
          <span className="text-xs opacity-60 font-mono">
            {matchId.slice(0, 8)}...
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// SUBMISSION RESULT CARD
// ─────────────────────────────────────────────
interface SubmissionResultCardProps {
  result: SubmissionResult;
  onDismiss?: () => void;
}

export function SubmissionResultCard({ result, onDismiss }: SubmissionResultCardProps) {
  const isAllowed = result.allowed;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className={`border-2 ${isAllowed ? 'border-primary/50' : 'border-destructive/50'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {isAllowed ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span className="text-primary">Match Validated</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-destructive" />
                  <span className="text-destructive">Match Rejected</span>
                </>
              )}
            </CardTitle>
            <Badge variant={isAllowed ? 'default' : 'destructive'}>
              {result.reasonCode}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Reason Message */}
          <p className="text-sm text-muted-foreground">
            {result.reasonMessage}
          </p>

          {/* Reward Breakdown (if allowed) */}
          {isAllowed && result.rewardBreakdown && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-lg font-bold text-primary">
                <Coins className="w-5 h-5" />
                +{result.calculatedReward} MONARD
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base:</span>
                  <span>+{result.rewardBreakdown.base}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Placement:</span>
                  <span>+{result.rewardBreakdown.placement}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kills:</span>
                  <span>+{result.rewardBreakdown.kills}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Survival:</span>
                  <span>+{result.rewardBreakdown.survival.toFixed(1)}</span>
                </div>
                {result.rewardBreakdown.penalties !== 0 && (
                  <div className="flex justify-between col-span-2 text-muted-foreground">
                    <span>Penalties:</span>
                    <span>{result.rewardBreakdown.penalties}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risk Score */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Shield className="w-4 h-4" />
                Risk Score
              </span>
              <span className={
                result.riskScore < 30 ? 'text-primary' :
                result.riskScore < 60 ? 'text-secondary-foreground' : 'text-destructive'
              }>
                {result.riskScore}/100
              </span>
            </div>
            <Progress 
              value={result.riskScore} 
              className="h-2"
            />
          </div>

          {/* Validation Flags */}
          {result.validationFlags.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Zap className="w-4 h-4" />
                Validation Flags
              </span>
              <div className="flex flex-wrap gap-1">
                {result.validationFlags.map((flag, i) => (
                  <Badge 
                    key={i}
                    variant={
                      flag.severity === 'critical' ? 'destructive' :
                      flag.severity === 'warning' ? 'secondary' : 'outline'
                    }
                    className="text-xs"
                  >
                    {flag.code}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Dismiss Button */}
          {onDismiss && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onDismiss}
              className="w-full mt-2"
            >
              Dismiss
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// INLINE SUBMISSION OVERLAY
// ─────────────────────────────────────────────
interface SubmissionOverlayProps {
  status: SubmissionStatus;
  result: SubmissionResult | null;
  onDismiss: () => void;
}

export function SubmissionOverlay({ status, result, onDismiss }: SubmissionOverlayProps) {
  const showOverlay = status === 'signing' || status === 'submitting' || 
                      status === 'success' || status === 'rejected';

  if (!showOverlay) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={status === 'success' || status === 'rejected' ? onDismiss : undefined}
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md mx-4"
        >
          {(status === 'signing' || status === 'submitting') && (
            <Card className="border-primary/50">
              <CardContent className="flex flex-col items-center justify-center py-8 space-y-4">
                {status === 'signing' ? (
                  <>
                    <Wallet className="w-12 h-12 text-primary animate-pulse" />
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">Sign to Submit</h3>
                      <p className="text-sm text-muted-foreground">
                        Please sign the message in your wallet to verify your identity
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">Submitting Match</h3>
                      <p className="text-sm text-muted-foreground">
                        Validating your match result...
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {result && (status === 'success' || status === 'rejected') && (
            <SubmissionResultCard result={result} onDismiss={onDismiss} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// COMPACT RESULT TOAST
// ─────────────────────────────────────────────
interface CompactResultProps {
  result: SubmissionResult;
}

export function CompactResult({ result }: CompactResultProps) {
  return (
    <div className="flex items-center gap-3">
      {result.allowed ? (
        <>
          <Trophy className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium">+{result.calculatedReward} MONARD</p>
            <p className="text-xs text-muted-foreground">
              Risk: {result.riskScore}/100
            </p>
          </div>
        </>
      ) : (
        <>
          <XCircle className="w-5 h-5 text-destructive" />
          <div>
            <p className="font-medium">Match Rejected</p>
            <p className="text-xs text-muted-foreground">
              {result.reasonCode}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
