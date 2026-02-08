// Battle Royale page - wrapper with lobby, game, and results states

import { useRef, useEffect } from 'react';
import { ArrowLeft, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import WalletBar from '@/components/game/WalletBar';
import BattleLobby from '@/components/game/BattleLobby';
import BattleHUD from '@/components/game/BattleHUD';
import BattleResults from '@/components/game/BattleResults';
import { useBattleRoyale } from '@/hooks/useBattleRoyale';
import { 
  MatchSubmissionProvider, 
  useMatchSubmissionContext 
} from '@/contexts/MatchSubmissionContext';
import { WalletButton } from '@/components/game/MatchSubmissionUI';

// Inner component that uses the submission context
const BattleRoyaleGameInner = () => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const lastSubmittedMatchRef = useRef<string | null>(null);

  const {
    phase,
    health,
    shield,
    kills,
    aliveCount,
    zonePhase,
    phaseTimeRemaining,
    inventory,
    killFeed,
    matchResult,
    monardBalance,
    lastPlayerCount,
    startMatch,
    returnToLobby,
    setMonardBalance,
  } = useBattleRoyale({ containerRef: gameContainerRef });

  // Get submission context
  const submission = useMatchSubmissionContext();

  // Auto-submit match when result is available (without modifying gameplay)
  useEffect(() => {
    if (
      matchResult && 
      matchResult.matchId && 
      matchResult.matchId !== lastSubmittedMatchRef.current &&
      matchResult.playerCount > 1
    ) {
      lastSubmittedMatchRef.current = matchResult.matchId;
      
      // Submit the match with wallet signing
      submission.submitMatch(matchResult).then((result) => {
        if (result?.allowed && result.calculatedReward > 0) {
          // Update balance with verified reward from server
          // Note: The hook already adds tokensWon, so we only add the difference
          // if server reward differs (for now, they should match)
          console.log('[BattleRoyale] Server validated reward:', result.calculatedReward);
        }
      });
    }
  }, [matchResult, submission]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-destructive" />
            <span className="font-mono text-sm font-bold text-gradient-primary">
              BATTLE ROYALE
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">
            {monardBalance.toFixed(2)} MNRD
          </span>
          <WalletButton
            wallet={submission.wallet}
            onConnect={submission.connectWallet}
            onDisconnect={submission.disconnectWallet}
            hasWallet={submission.hasWallet}
            disabled={submission.isSubmitting}
          />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 relative">
        {/* Always render the Phaser mount so it has real dimensions for init */}
        <div
          ref={gameContainerRef}
          className={`absolute inset-0 z-0 transition-opacity ${
            phase === 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {phase === 'playing' && (
          <BattleHUD
            health={health}
            shield={shield}
            kills={kills}
            aliveCount={aliveCount}
            phase={zonePhase}
            phaseTimeRemaining={phaseTimeRemaining}
            inventory={inventory}
            killFeed={killFeed}
          />
        )}

        {phase === 'lobby' && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <BattleLobby monardBalance={monardBalance} onStartMatch={startMatch} />
          </div>
        )}

        {phase === 'results' && matchResult && (
          <div className="absolute inset-0 z-10 flex flex-col">
            <BattleResults
              result={matchResult}
              onPlayAgain={() => startMatch(lastPlayerCount)}
              onBackToMenu={returnToLobby}
              submissionResult={submission.lastResult}
              isSubmitting={submission.isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Main page wrapped with submission provider
const BattleRoyalePage = () => {
  return (
    <MatchSubmissionProvider showOverlay={false}>
      <BattleRoyaleGameInner />
    </MatchSubmissionProvider>
  );
};

export default BattleRoyalePage;
