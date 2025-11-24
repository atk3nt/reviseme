"use client";

import { useEffect, useState, useCallback } from "react";

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

  useEffect(() => {
    setIsOpen(selection !== null && selection.kind === 'study');
  }, [selection]);

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
    
    const blockKey = getBlockKey(block);
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
  }, [block, timerState, onTimerStateChange, getBlockKey]);

  const handlePauseTimer = useCallback(() => {
    if (!block || !onTimerStateChange || !timerState) return;
    
    const blockKey = getBlockKey(block);
    const now = Date.now();
    const remaining = timerState.endTime ? Math.max(0, timerState.endTime - now) : timerState.remainingMs || 0;
    
    onTimerStateChange({
      running: false,
      phase: timerState.phase,
      endTime: null,
      pausedAt: now,
      remainingMs: remaining
    });
  }, [block, timerState, onTimerStateChange, getBlockKey]);

  const handleResumeTimer = useCallback(() => {
    if (!block || !onTimerStateChange || !timerState) return;
    
    const blockKey = getBlockKey(block);
    const now = Date.now();
    const remaining = timerState.remainingMs || (timerState.phase === 'study' ? STUDY_DURATION_MS : REST_DURATION_MS);
    
    onTimerStateChange({
      running: true,
      phase: timerState.phase,
      endTime: now + remaining,
      pausedAt: null,
      remainingMs: null
    });
  }, [block, timerState, onTimerStateChange, getBlockKey]);

  const handleResetTimer = useCallback(() => {
    if (!block || !onTimerStateChange) return;
    
    const blockKey = getBlockKey(block);
    onTimerStateChange({
      running: false,
      phase: 'study',
      endTime: null,
      pausedAt: null,
      remainingMs: null
    });
  }, [block, onTimerStateChange, getBlockKey]);

  if (!isOpen || !block) return null;

  const subject = block.topics?.specs?.subject || 'Subject';
  const topicName = block.topics?.name || 'Topic';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-base-100 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-base-200 px-6 py-4 border-b border-base-300 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Study Block Details</h2>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Block Info */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="w-4 h-4 rounded-full mt-2"
                style={{ backgroundColor: getSubjectColor(subject) }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-base-content/70 flex items-center gap-2 mb-1">
                  <span>{getSubjectIcon(subject)}</span>
                  <span>{subject}</span>
                </p>
                <h3 className="text-xl font-semibold mb-2">{topicName}</h3>
                <div className="flex items-center gap-4 text-sm text-base-content/70">
                  <span>📅 {formattedDate}</span>
                  <span>🕐 {formattedTime}</span>
                  <span>⏱️ {block.duration_minutes} minutes</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-2xl ${getStatusColor(block.status)}`}>
                  {getStatusIcon(block.status)}
                </span>
              </div>
            </div>

            {block.ai_rationale && (
              <div className="bg-base-200 rounded-lg p-4">
                <p className="text-sm text-base-content/80">{block.ai_rationale}</p>
              </div>
            )}
          </div>

          {/* Pomodoro Timer */}
          <div className="border-t border-base-300 pt-6">
            <h3 className="text-lg font-semibold mb-4">Pomodoro Timer</h3>
            <div className="flex flex-col items-center gap-4">
              {/* Timer Display */}
              <div className="text-center">
                <div className={`text-6xl font-mono font-bold mb-2 ${
                  phase === 'study' ? 'text-primary' : 'text-success'
                }`}>
                  {displayTime}
                </div>
                <div className="text-sm text-base-content/70">
                  {phase === 'study' ? '📚 Study Phase' : '☕ Rest Phase'}
                </div>
              </div>

              {/* Timer Controls */}
              <div className="flex gap-2">
                {!timerState || (!isRunning && !isPaused) ? (
                  <button
                    onClick={handleStartTimer}
                    className="btn btn-primary"
                  >
                    ▶️ Start
                  </button>
                ) : isRunning ? (
                  <button
                    onClick={handlePauseTimer}
                    className="btn btn-warning"
                  >
                    ⏸️ Pause
                  </button>
                ) : (
                  <button
                    onClick={handleResumeTimer}
                    className="btn btn-success"
                  >
                    ▶️ Resume
                  </button>
                )}
                {timerState && (
                  <button
                    onClick={handleResetTimer}
                    className="btn btn-outline"
                  >
                    🔄 Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-base-300 pt-6">
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  onBlockAction(blockKey, 'missed');
                  onClose();
                }}
                className="btn btn-error btn-outline"
                disabled={block.status === 'missed'}
              >
                Mark as Missed
              </button>
              <button
                onClick={() => {
                  onBlockAction(blockKey, 'done');
                  onClose();
                }}
                className="btn btn-success"
                disabled={block.status === 'done'}
              >
                Mark as Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

