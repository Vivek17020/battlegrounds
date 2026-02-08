// ============================================
// MATCH SUBMISSION CONTEXT
// Provides match submission throughout the app
// ============================================

import React, { createContext, useContext, ReactNode } from 'react';
import { 
  useMatchSubmission, 
  UseMatchSubmissionReturn 
} from '@/hooks/useMatchSubmission';
import { SubmissionOverlay } from '@/components/game/MatchSubmissionUI';

// ─────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────
const MatchSubmissionContext = createContext<UseMatchSubmissionReturn | null>(null);

// ─────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────
interface MatchSubmissionProviderProps {
  children: ReactNode;
  showOverlay?: boolean;
}

export function MatchSubmissionProvider({ 
  children, 
  showOverlay = true 
}: MatchSubmissionProviderProps) {
  const submission = useMatchSubmission();

  return (
    <MatchSubmissionContext.Provider value={submission}>
      {children}
      {showOverlay && (
        <SubmissionOverlay
          status={submission.status}
          result={submission.lastResult}
          onDismiss={submission.clearResult}
        />
      )}
    </MatchSubmissionContext.Provider>
  );
}

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────
export function useMatchSubmissionContext(): UseMatchSubmissionReturn {
  const context = useContext(MatchSubmissionContext);
  
  if (!context) {
    throw new Error(
      'useMatchSubmissionContext must be used within a MatchSubmissionProvider'
    );
  }
  
  return context;
}

// ─────────────────────────────────────────────
// HOC FOR EXISTING COMPONENTS
// ─────────────────────────────────────────────
export function withMatchSubmission<P extends object>(
  Component: React.ComponentType<P & { matchSubmission: UseMatchSubmissionReturn }>
) {
  return function WithMatchSubmission(props: P) {
    const submission = useMatchSubmissionContext();
    return <Component {...props} matchSubmission={submission} />;
  };
}
