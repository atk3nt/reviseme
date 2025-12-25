"use client";

import { useState } from "react";

const RATING_OPTIONS = [
  { value: 1, label: "Still Struggling", description: "Need more practice", color: "bg-red-500", nextSessions: 3 },
  { value: 2, label: "Getting Better", description: "Making progress", color: "bg-orange-500", nextSessions: 2 },
  { value: 3, label: "Almost There", description: "One more review", color: "bg-yellow-500", nextSessions: 1 },
  { value: 4, label: "Good", description: "Review in ~1 week", color: "bg-green-400", nextSessions: 0 },
  { value: 5, label: "Mastered", description: "Review in ~2 weeks", color: "bg-green-600", nextSessions: 0 }
];

/**
 * ReRatingModal - Mandatory re-rating modal for topics with original rating 1-3
 * 
 * Shown after completing the final session of a spaced repetition cycle.
 * User MUST select a rating to continue (no skip option).
 * 
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {object} block - The block being completed
 * @param {function} onClose - Called after successful rating submission
 * @param {function} onSubmit - Async function to handle rating submission (blockId, rating)
 */
export default function ReRatingModal({ isOpen, block, onClose, onSubmit }) {
  const [selectedRating, setSelectedRating] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !block) return null;

  const handleSubmit = async () => {
    if (!selectedRating) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(block.id, selectedRating);
      setSelectedRating(null);
      onClose();
    } catch (error) {
      console.error('Re-rating failed:', error);
      // Don't close modal on error - let user retry
    } finally {
      setIsSubmitting(false);
    }
  };

  const topicName = block.topics?.name || block.topic_name || 'Topic';
  const subject = block.topics?.specs?.subject || block.subject || 'Subject';
  
  // Get session info from ai_rationale
  let sessionInfo = 'Final session';
  try {
    const rationale = block?.ai_rationale ? JSON.parse(block.ai_rationale) : null;
    if (rationale?.sessionNumber && rationale?.sessionTotal) {
      sessionInfo = `Session ${rationale.sessionNumber} of ${rationale.sessionTotal}`;
    }
  } catch {
    // Use default sessionInfo
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop - click to close */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="relative bg-base-100 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 text-white relative">
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost absolute top-3 right-3 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-2 mb-1 pr-8">
            <span className="text-2xl">🎯</span>
            <h2 className="text-xl font-bold">How confident do you feel?</h2>
          </div>
          <p className="text-white/80 text-sm">Rate your understanding to continue</p>
        </div>

        {/* Topic Info */}
        <div className="px-6 pt-4">
          <div className="bg-base-200 rounded-lg p-3">
            <p className="text-xs text-base-content/60 uppercase tracking-wide font-medium">{subject}</p>
            <p className="font-semibold mt-0.5">{topicName}</p>
            <p className="text-xs text-base-content/50 mt-1">{sessionInfo} completed ✓</p>
          </div>
        </div>

        {/* Rating Options */}
        <div className="p-6 space-y-2">
          {RATING_OPTIONS.map((option) => {
            const isSelected = selectedRating === option.value;
            
            return (
              <button
                key={option.value}
                onClick={() => setSelectedRating(option.value)}
                className={`w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${
                  isSelected 
                    ? 'border-primary bg-primary/5 shadow-md' 
                    : 'border-base-300 hover:border-base-content/20 hover:bg-base-200/50'
                }`}
              >
                {/* Rating Number */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${option.color}`}>
                  {option.value}
                </div>
                
                {/* Label & Description */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{option.label}</p>
                  <p className="text-xs text-base-content/60">{option.description}</p>
                </div>
                
                {/* Checkmark */}
                {isSelected && (
                  <svg className="w-5 h-5 text-primary shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* What happens next - only show when rating selected */}
        {selectedRating && (
          <div className="px-6 pb-4">
            <div className="bg-info/10 border border-info/20 rounded-lg p-3">
              <p className="text-sm text-info-content">
                <span className="font-medium">What happens next: </span>
                {selectedRating <= 3 ? (
                  <>
                    {RATING_OPTIONS.find(o => o.value === selectedRating)?.nextSessions} more session
                    {RATING_OPTIONS.find(o => o.value === selectedRating)?.nextSessions > 1 ? 's' : ''} will be scheduled to reinforce this topic.
                  </>
                ) : (
                  <>
                    This topic will be scheduled for a maintenance review in {selectedRating === 4 ? '~1 week' : '~2 weeks'} to keep it fresh.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Footer - NO SKIP BUTTON - Rating is mandatory */}
        <div className="px-6 py-4 bg-base-200">
          <button
            onClick={handleSubmit}
            className="btn btn-primary btn-block"
            disabled={!selectedRating || isSubmitting}
          >
            {isSubmitting ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : !selectedRating ? (
              'Select a rating to continue'
            ) : (
              'Save Rating & Complete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}



