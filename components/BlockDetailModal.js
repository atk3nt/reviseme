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
    setIsOpen(selection !== null && selection.kind === 'study');
    // Reset states when modal closes
    if (selection === null || selection.kind !== 'study') {
      setConfirmMissed(false);
      setShowReRating(false);
    }
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative bg-base-100 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-base-200 px-6 py-4 border-b border-base-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getSubjectColor(subject) }}
              />
              <h2 className="text-xl font-bold">Study Block</h2>
              {/* Session Badge - show for spaced repetition topics */}
              {rationaleData.label && (
                <span className="badge badge-sm badge-outline">
                  {rationaleData.label}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle btn-ghost"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Block Info Card */}
              <div className="bg-base-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-3">
                      <span className="text-sm font-medium text-base-content/70 uppercase tracking-wide">
                        {subject}
                      </span>
                      <h3 className="text-2xl font-bold mt-1">{mainTopicName}</h3>
                      
                      {/* Show hierarchy context below main topic */}
                      {hierarchyContext && (
                        <div className="mt-3 p-3 bg-base-300/50 rounded-lg">
                          <div className="text-sm">
                            <span className="font-semibold text-base-content/70">📚 Find in: </span>
                            <span className="text-base-content/90">{hierarchyContext}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-base-content/70">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="font-medium">Date:</span>
                        <span>{formattedDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-base-content/70">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Time:</span>
                        <span>{formattedTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-base-content/70">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">Duration:</span>
                        <span>{block.duration_minutes} minutes</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-2xl ${getStatusColor(block.status)}`}>
                      {getStatusIcon(block.status)}
                    </span>
                    <span className="text-xs text-base-content/50 capitalize font-medium">{block.status}</span>
                  </div>
                </div>

                {rationaleData.explanation && (
                  <div className="mt-4 pt-4 border-t border-base-300">
                    <p className="text-xs font-medium text-base-content/60 mb-2">Why this topic?</p>
                    <p className="text-sm text-base-content/80 leading-relaxed">{rationaleData.explanation}</p>
                  </div>
                )}
              </div>

              {/* Pomodoro Timer Card */}
              <div className="bg-base-200/50 rounded-xl p-8 border border-base-300/50">
                <div className="text-center space-y-6">
                  {/* Phase Label */}
                  <div className="flex justify-center">
                    <div className={`badge badge-lg gap-2 px-4 py-2 rounded-full ${
                      isStudyPhase 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    } border`}>
                      {isStudyPhase ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          Study Phase
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Rest Phase
                        </>
                      )}
                    </div>
                  </div>

                  {/* Timer Display */}
                  <div className="py-4">
                    <p className="text-xs font-medium text-base-content/50 mb-3 uppercase tracking-wide">Time Remaining</p>
                    <div className={`text-7xl font-sans font-light mb-3 tracking-wider ${
                      isStudyPhase ? 'text-blue-500' : 'text-amber-500'
                    }`} style={{ fontFamily: 'system-ui, -apple-system, sans-serif', letterSpacing: '0.05em' }}>
                      {displayTime}
                    </div>
                    <p className="text-xs text-base-content/50 max-w-xs mx-auto">
                      {isStudyPhase 
                        ? 'Focus on your revision for 25 minutes' 
                        : 'Take a 5-minute break to recharge'}
                    </p>
                  </div>

                  {/* Timer Controls */}
                  <div className="flex gap-3 justify-center pt-2">
                    {!timerState || (!isRunning && !isPaused) ? (
                      <button
                        onClick={handleStartTimer}
                        className="btn btn-lg gap-2 bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600 text-white rounded-full px-8"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Timer
                      </button>
                    ) : isRunning ? (
                      <button
                        onClick={handlePauseTimer}
                        className="btn btn-lg gap-2 bg-amber-500 hover:bg-amber-600 border-amber-500 hover:border-amber-600 text-white rounded-full px-8"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pause Timer
                      </button>
                    ) : (
                      <button
                        onClick={handleResumeTimer}
                        className="btn btn-lg gap-2 bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600 text-white rounded-full px-8"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Resume Timer
                      </button>
                    )}
                    {timerState && (
                      <button
                        onClick={handleResetTimer}
                        className="btn btn-outline btn-lg gap-2 border-base-300 hover:bg-base-200 rounded-full px-8"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Reset Timer
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* RE-RATE TOPIC BUTTON - Only for final session of low confidence topics (1-3) */}
              {isLowConfidenceTopic && isFinalSession && (
                <button
                  onClick={() => setShowReRating(true)}
                  className="btn btn-outline btn-block gap-2 border-purple-300 text-purple-600 hover:bg-purple-50 hover:border-purple-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Re-rate Topic Confidence
                </button>
              )}

              {/* Info for low confidence topics NOT on final session */}
              {isLowConfidenceTopic && !isFinalSession && rationaleData.sessionNumber && rationaleData.sessionTotal && (
                <div className="text-center text-sm text-base-content/60 bg-base-200/50 rounded-lg p-3">
                  <p>Session {rationaleData.sessionNumber} of {rationaleData.sessionTotal}</p>
                  <p className="text-xs mt-1">
                    You&apos;ll be asked to re-rate your confidence on the final session
                  </p>
                </div>
              )}

              {/* Info for high confidence topics (4-5) */}
              {!isLowConfidenceTopic && rationaleData.rating !== null && (
                <div className="text-center text-sm text-base-content/60 bg-base-200/50 rounded-lg p-3">
                  <p>This is an exam practice session (confidence: {rationaleData.rating}/5)</p>
                  <p className="text-xs mt-1">
                    To change this topic&apos;s rating, go to{' '}
                    <a href="/settings/rerate-topics" className="link link-primary">
                      Settings → Rerate Topics
                    </a>
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (!confirmMissed) {
                      // First click: show confirmation
                      setConfirmMissed(true);
                    } else {
                      // Second click: execute action
                      onBlockAction(blockKey, 'missed');
                      onClose();
                    }
                  }}
                  className={`btn flex-1 gap-2 ${
                    confirmMissed 
                      ? 'btn-error' // Solid red on confirmation
                      : 'btn-error btn-outline' // Outlined red initially
                  }`}
                  disabled={block.status === 'missed' || block.status === 'done'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {confirmMissed ? 'Confirm Missed?' : 'Mark as Missed'}
                </button>
                <button
                  onClick={handleMarkDone}
                  className={`btn flex-1 gap-2 ${
                    block.status === 'done' 
                      ? 'btn-warning btn-outline' 
                      : 'btn-success'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {block.status === 'done' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    )}
                  </svg>
                  {block.status === 'done' ? 'Mark as Scheduled' : 'Mark as Done'}
                </button>
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
