"use client";

import { useEffect, useState, useCallback } from "react";
import ReRatingModal from "@/components/ReRatingModal";
import toast from "react-hot-toast";

const STUDY_DURATION_MS = 25 * 60 * 1000; // 25 minutes
const REST_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function BlockDetailModal({
  selection,
  block,
  onClose,
  onBlockAction,
  getStatusColor,
  getStatusIcon,
  getSubjectColor,
  getSubjectIcon,
  getBlockKey,
  timerState,
  onTimerStateChange
}) {
  const [displayTime, setDisplayTime] = useState("25:00");
  const [isOpen, setIsOpen] = useState(false);
  const [confirmMissed, setConfirmMissed] = useState(false);
  const [showReRating, setShowReRating] = useState(false);

  useEffect(() => {
    const isModalOpen = selection !== null && selection.kind === 'study';
    setIsOpen(isModalOpen);
    
    // Prevent body scroll when modal is open
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Reset states when modal closes
    if (selection === null || selection.kind !== 'study') {
      setConfirmMissed(false);
      setShowReRating(false);
    }
    
    // Cleanup function to restore scroll when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selection]);

  // Auto-reset confirmation after 3 seconds
  useEffect(() => {
    if (confirmMissed) {
      const timer = setTimeout(() => {
        setConfirmMissed(false);
      }, 3000); // Reset after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [confirmMissed]);

  // Update display time based on timer state
  useEffect(() => {
    if (!timerState) {
      setDisplayTime("25:00");
      return;
    }

    const updateDisplay = () => {
      if (timerState.running && timerState.endTime) {
        const now = Date.now();
        const remaining = Math.max(0, timerState.endTime - now);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setDisplayTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else if (timerState.remainingMs !== null) {
        const minutes = Math.floor(timerState.remainingMs / 60000);
        const seconds = Math.floor((timerState.remainingMs % 60000) / 1000);
        setDisplayTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        const defaultTime = timerState.phase === 'study' ? "25:00" : "05:00";
        setDisplayTime(defaultTime);
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 100);
    return () => clearInterval(interval);
  }, [timerState]);

  // Pause timer when modal closes
  useEffect(() => {
    const isModalOpen = selection !== null && selection?.kind === 'study' && block;
    const blockKey = block ? getBlockKey(block) : null;
    
    if (!isModalOpen && blockKey && timerState && timerState.running && timerState.endTime) {
      // Modal is closing and timer is running - pause it and save frozen remainingMs
      const now = Date.now();
      const remaining = Math.max(0, timerState.endTime - now);
      
      if (onTimerStateChange) {
        onTimerStateChange({
          running: false,
          phase: timerState.phase,
          endTime: timerState.endTime, // Keep endTime for expiration check
          pausedAt: now,
          remainingMs: remaining // Save frozen remaining time
        });
      }
    }
  }, [selection, block, timerState, onTimerStateChange, getBlockKey]);

  const handleStartTimer = useCallback(() => {
    if (!block || !onTimerStateChange) return;
    
    const now = Date.now();
    const phase = timerState?.phase || 'study';
    
    // Use frozen remainingMs if available, otherwise use full duration
    const remaining = timerState?.remainingMs ?? (phase === 'study' ? STUDY_DURATION_MS : REST_DURATION_MS);
    
    onTimerStateChange({
      running: true,
      phase,
      endTime: now + remaining, // Use frozen remainingMs if available
      pausedAt: null,
      remainingMs: null
    });
  }, [block, timerState, onTimerStateChange]);

  const handlePauseTimer = useCallback(() => {
    if (!block || !onTimerStateChange || !timerState) return;
    
    const now = Date.now();
    const remaining = timerState.endTime ? Math.max(0, timerState.endTime - now) : timerState.remainingMs || 0;
    
    onTimerStateChange({
      running: false,
      phase: timerState.phase,
      endTime: null,
      pausedAt: now,
      remainingMs: remaining
    });
  }, [block, timerState, onTimerStateChange]);

  const handleResumeTimer = useCallback(() => {
    if (!block || !onTimerStateChange || !timerState) return;
    
    const now = Date.now();
    const remaining = timerState.remainingMs || (timerState.phase === 'study' ? STUDY_DURATION_MS : REST_DURATION_MS);
    
    onTimerStateChange({
      running: true,
      phase: timerState.phase,
      endTime: now + remaining,
      pausedAt: null,
      remainingMs: null
    });
  }, [block, timerState, onTimerStateChange]);

  const handleResetTimer = useCallback(() => {
    if (!block || !onTimerStateChange) return;
    
    onTimerStateChange({
      running: false,
      phase: 'study',
      endTime: null,
      pausedAt: null,
      remainingMs: null
    });
  }, [block, onTimerStateChange]);

  // Parse ai_rationale to get session info and original rating
  const parseRationale = useCallback(() => {
    try {
      const rationale = block?.ai_rationale ? JSON.parse(block.ai_rationale) : null;
      return {
        rating: rationale?.rating || null,
        sessionNumber: rationale?.sessionNumber || null,
        sessionTotal: rationale?.sessionTotal || null,
        label: rationale?.label || null,
        explanation: rationale?.explanation || null
      };
    } catch {
      return {
        rating: null,
        sessionNumber: null,
        sessionTotal: null,
        label: null,
        explanation: null
      };
    }
  }, [block?.ai_rationale]);

  const rationaleData = parseRationale();
  
  // Check if this is a low-confidence topic (1-3) that gets spaced repetition
  const isLowConfidenceTopic = rationaleData.rating !== null && rationaleData.rating <= 3;
  
  // Check if this is the final session of spaced repetition
  const isFinalSession = rationaleData.sessionNumber !== null && 
    rationaleData.sessionTotal !== null && 
    rationaleData.sessionNumber === rationaleData.sessionTotal;

  // Handle re-rating submission
  const handleReRatingSubmit = useCallback(async (blockId, rating) => {
    try {
      const response = await fetch('/api/plan/rerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, reratingScore: rating })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Re-rating failed');
      }
      
      const result = await response.json();
      
      if (result.nextAction?.message) {
        toast.success(result.nextAction.message, { duration: 4000 });
      } else {
        toast.success('Rating saved!');
      }
      
      // Refresh block status
      if (block) {
        onBlockAction(getBlockKey(block), 'done');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to save rating');
      throw error;
    }
  }, [block, onBlockAction, getBlockKey]);

  // Handle mark as done - show re-rating ONLY for low confidence topics on final session
  const handleMarkDone = useCallback(() => {
    if (!block) return;
    
    const blockKey = getBlockKey(block);
    
    if (block.status === 'done') {
      // Already done - toggle back to scheduled
      onBlockAction(blockKey, 'scheduled');
      onClose();
    } else if (isLowConfidenceTopic && isFinalSession) {
      // Low confidence topic (1-3) on final session - MUST re-rate
      setShowReRating(true);
    } else {
      // High confidence topic (4-5) or not final session - just mark done
      onBlockAction(blockKey, 'done');
      onClose();
    }
  }, [block, isLowConfidenceTopic, isFinalSession, onBlockAction, onClose, getBlockKey]);

  if (!isOpen || !block) return null;

  const subject = block.topics?.specs?.subject || block.subject || 'Subject';
  
  // Clean topic name by removing leading apostrophes/quotes
  const cleanTopicName = (name) => {
    if (!name) return 'Topic';
    return name.replace(/^['"]+/, '').trim() || 'Topic';
  };
  
  // Get hierarchy from block data (preferred) or build from legacy fields
  const hierarchy = block.hierarchy || 
    (block.topics?.hierarchy) ||
    (block.level_1_parent && block.level_2_parent && block.level_3_topic
      ? [block.level_1_parent, block.level_2_parent, block.level_3_topic]
      : [block.topics?.name || block.topic_name || 'Topic']);
  
  // Main topic: Level 3 (subtopic) - the specific learning
  const mainTopicName = cleanTopicName(
    hierarchy[hierarchy.length - 1] || block.topics?.name || block.topic_name || 'Topic'
  );

  // Context: Unit → Section (where to find it in textbook)
  const hierarchyContext = hierarchy.length > 1
    ? hierarchy.slice(0, -1).map(cleanTopicName).join(' → ') // All except the last (subtopic)
    : null;
  const formattedTime = new Date(block.scheduled_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  const formattedDate = new Date(block.scheduled_at).toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const blockKey = getBlockKey(block);
  const isRunning = timerState?.running || false;
  const isPaused = timerState && !timerState.running && timerState.pausedAt !== null;
  const phase = timerState?.phase || 'study';
  const isStudyPhase = phase === 'study';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        />
        
        {/* Modal - Full screen gradient background */}
        <div className="relative rounded-3xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col" 
          style={{
            background: isStudyPhase 
              ? 'linear-gradient(135deg, #001433 0%, #003D99 40%, #0066FF 70%, #0052CC 100%)'
              : 'linear-gradient(135deg, #0066FF 0%, #3B9AE1 50%, #5DADE2 100%)'
          }}>
          
          {/* Header - Minimalist with close button */}
          <div className="px-6 py-5 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full shadow-lg"
                style={{ backgroundColor: getSubjectColor(subject) }}
              />
              <span className="text-white/90 text-sm font-medium uppercase tracking-wide">{subject}</span>
            </div>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle bg-white/20 hover:bg-white/30 border-0 text-white backdrop-blur-sm"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content - Centered timer design */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
              
              {/* Task Display - Top */}
              <div className="text-center space-y-2 w-full max-w-md">
                <div className="flex items-center justify-center gap-2 text-white/90 text-lg mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-medium">{mainTopicName}</span>
                </div>
                
                {/* Hierarchy context - subtle */}
                {hierarchyContext && (
                  <p className="text-white/60 text-xs">{hierarchyContext}</p>
                )}
                
                {/* Session Indicator */}
                {rationaleData.sessionNumber && rationaleData.sessionTotal && (
                  <div className="text-white/70 text-sm font-medium">
                    {rationaleData.sessionNumber}/{rationaleData.sessionTotal}
                  </div>
                )}
              </div>

              {/* Phase Selection Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    if (onTimerStateChange && timerState) {
                      onTimerStateChange({
                        ...timerState,
                        phase: 'study'
                      });
                    }
                  }}
                  className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                    isStudyPhase
                      ? 'bg-white/30 text-white backdrop-blur-sm shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Focus
                </button>
                <button
                  onClick={() => {
                    if (onTimerStateChange && timerState) {
                      onTimerStateChange({
                        ...timerState,
                        phase: 'rest'
                      });
                    }
                  }}
                  className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                    !isStudyPhase
                      ? 'bg-white/30 text-white backdrop-blur-sm shadow-lg'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Short Break
                </button>
              </div>

              {/* Timer Display - Hero Element */}
              <div className="text-center space-y-6">
                <div className={`text-8xl md:text-9xl font-bold tracking-tight text-white drop-shadow-2xl`} style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif', 
                  letterSpacing: '-0.02em',
                  textShadow: '0 10px 40px rgba(0,0,0,0.3)'
                }}>
                  {displayTime}
                </div>
                <p className="text-white/80 text-sm max-w-md">
                  {isStudyPhase 
                    ? 'Focus on your revision for 25 minutes' 
                    : 'Take a 5-minute break to recharge'}
                </p>
              </div>

              {/* Timer Controls - Centered */}
              <div className="flex gap-3 justify-center flex-wrap">
                {!timerState || (!isRunning && !isPaused) ? (
                  <button
                    onClick={handleStartTimer}
                    className="btn gap-2 rounded-full px-10 py-3 text-white bg-white/25 hover:bg-white/35 backdrop-blur-md border-white/30 shadow-xl transition-all hover:scale-105"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start
                  </button>
                ) : (
                  <>
                    {isRunning ? (
                      <button
                        onClick={handlePauseTimer}
                        className="btn gap-2 rounded-full px-10 py-3 text-white bg-white/25 hover:bg-white/35 backdrop-blur-md border-white/30 shadow-xl transition-all hover:scale-105"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={handleResumeTimer}
                        className="btn gap-2 rounded-full px-10 py-3 text-white bg-white/25 hover:bg-white/35 backdrop-blur-md border-white/30 shadow-xl transition-all hover:scale-105"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Resume
                      </button>
                    )}
                    <button
                      onClick={handleResetTimer}
                      className="btn gap-2 rounded-full px-6 py-3 text-white/90 bg-white/10 hover:bg-white/20 backdrop-blur-md border-white/20 transition-all hover:scale-105"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Additional Info - Collapsible */}
              <div className="w-full max-w-md space-y-4 pt-4 border-t border-white/20">
                
                {/* Session Info */}
                {(isLowConfidenceTopic || rationaleData.rating !== null) && (
                  <div className="text-center text-white/70 text-xs">
                    {isLowConfidenceTopic && !isFinalSession && rationaleData.sessionNumber && rationaleData.sessionTotal ? (
                      <span>Session {rationaleData.sessionNumber} of {rationaleData.sessionTotal} • Re-rate on final session</span>
                    ) : !isLowConfidenceTopic && rationaleData.rating !== null ? (
                      <span>
                        Exam practice (confidence: {rationaleData.rating}/5) • 
                        <a href="/settings/rerate-topics" className="hover:underline ml-1 text-white">
                          Change
                        </a>
                      </span>
                    ) : null}
                  </div>
                )}

                {/* Block Details - Expandable */}
                <details className="text-white/80">
                  <summary className="cursor-pointer text-sm font-medium text-center hover:text-white transition-colors">
                    View Details
                  </summary>
                  <div className="mt-4 space-y-3 text-xs bg-white/10 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">Date & Time</span>
                      <span>{new Date(block.scheduled_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} • {formattedTime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">Duration</span>
                      <span>{block.duration_minutes} minutes</span>
                    </div>
                    {rationaleData.explanation && (
                      <div className="pt-3 border-t border-white/20">
                        <p className="text-white/90 leading-relaxed">{rationaleData.explanation}</p>
                      </div>
                    )}
                  </div>
                </details>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  {/* RE-RATE TOPIC BUTTON */}
                  {isLowConfidenceTopic && isFinalSession && (
                    <button
                      onClick={() => setShowReRating(true)}
                      className="btn flex-1 gap-2 rounded-full px-4 py-2.5 text-white bg-white/20 hover:bg-white/30 backdrop-blur-md border-white/30 text-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      Re-rate
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      if (!confirmMissed) {
                        setConfirmMissed(true);
                      } else {
                        onBlockAction(blockKey, 'missed');
                        onClose();
                      }
                    }}
                    className={`btn flex-1 gap-2 rounded-full px-4 py-2.5 text-sm ${
                      confirmMissed 
                        ? 'bg-red-500/80 hover:bg-red-500 text-white' 
                        : 'bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-md border-white/20'
                    }`}
                    disabled={block.status === 'missed' || block.status === 'done'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {confirmMissed ? 'Confirm?' : 'Missed'}
                  </button>
                  <button
                    onClick={handleMarkDone}
                    className={`btn flex-1 gap-2 rounded-full px-4 py-2.5 text-sm ${
                      block.status === 'done' 
                        ? 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-white/30' 
                        : 'bg-white/30 hover:bg-white/40 text-white backdrop-blur-md border-white/40 shadow-lg'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {block.status === 'done' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      )}
                    </svg>
                    {block.status === 'done' ? 'Undo' : 'Done'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Re-Rating Modal - Only for low confidence topics */}
      {isLowConfidenceTopic && (
        <ReRatingModal
          isOpen={showReRating}
          block={block}
          onClose={() => {
            setShowReRating(false);
            // After re-rating completes, close the block detail modal too
            onClose();
          }}
          onSubmit={handleReRatingSubmit}
        />
      )}
    </>
  );
}
