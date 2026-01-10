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

  // Clean topic name by removing leading apostrophes/quotes
  const cleanTopicName = (name) => {
    if (!name) return 'Topic';
    return name.replace(/^['"]+/, '').trim() || 'Topic';
  };
  const displayTopicName = cleanTopicName(topicName);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal - Full screen gradient background */}
      <div 
        className="relative rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, #001433 0%, #003D99 40%, #0066FF 70%, #0052CC 100%)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h2 className="text-xl font-bold text-white">How confident do you feel?</h2>
              <p className="text-white/80 text-sm">Rate your understanding to continue</p>
            </div>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-6">
            {/* Topic Info */}
            <div className="text-center space-y-2">
              <div className="inline-block">
                <p className="text-white/70 text-xs uppercase tracking-wide font-medium">{subject}</p>
                <p className="text-white/90 text-lg font-semibold mt-1">{displayTopicName}</p>
                <p className="text-white/60 text-xs mt-1">{sessionInfo} completed ✓</p>
              </div>
            </div>

            {/* Rating Options */}
            <div className="space-y-3">
              {RATING_OPTIONS.map((option) => {
                const isSelected = selectedRating === option.value;
                
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedRating(option.value)}
                    className={`w-full p-4 rounded-xl transition-all text-left flex items-center gap-4 ${
                      isSelected 
                        ? 'bg-white/30 backdrop-blur-md shadow-lg border-2 border-white/40' 
                        : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border-2 border-white/20'
                    }`}
                  >
                    {/* Rating Number */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shrink-0 ${option.color} shadow-lg`}>
                      {option.value}
                    </div>
                    
                    {/* Label & Description */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-white">{option.label}</p>
                      <p className="text-xs text-white/70 mt-0.5">{option.description}</p>
                    </div>
                    
                    {/* Checkmark */}
                    {isSelected && (
                      <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* What happens next - only show when rating selected */}
            {selectedRating && (
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                <p className="text-sm text-white">
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
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              className={`btn btn-block rounded-full px-6 py-3 text-white transition-all hover:scale-105 ${
                selectedRating && !isSubmitting
                  ? 'bg-white/30 hover:bg-white/40 backdrop-blur-md border-white/40 shadow-lg'
                  : 'bg-white/10 backdrop-blur-sm border-white/20 cursor-not-allowed'
              }`}
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
    </div>
  );
}



