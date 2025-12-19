"use client";

export default function ConfirmAvailabilityModal({ isOpen, onClose, weekStart }) {
  if (!isOpen) return null;

  const handleGoToSettings = () => {
    // Navigate to availability settings for next week (week 1)
    window.location.href = '/settings/availability?week=1';
  };

  const formatWeekDate = (dateStr) => {
    if (!dateStr) return 'next week';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 transform transition-all animate-popup">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
          title="Go back to current week"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
            <span className="text-4xl">⚠️</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
          Set Your Availability First
        </h2>

        {/* Description */}
        <p className="text-gray-600 text-center mb-6">
          Before you can view next week&apos;s schedule, you need to set your availability 
          for the week of <strong>{formatWeekDate(weekStart)}</strong>.
        </p>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">💡</span>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Why do I need to do this?</p>
              <p>
                Each week is different! Your commitments change, so we need you to 
                confirm when you&apos;re available before generating your study plan.
              </p>
            </div>
          </div>
        </div>

        {/* Button */}
        <button
          onClick={handleGoToSettings}
          className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors text-lg"
        >
          Set My Availability →
        </button>

        {/* Footer note */}
        <p className="text-xs text-gray-500 text-center mt-4">
          You&apos;ll be taken to the Availability Settings page where you can block out times you&apos;re not available.
        </p>
      </div>
    </div>
  );
}
