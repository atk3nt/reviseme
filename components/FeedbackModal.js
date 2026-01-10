"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

export default function FeedbackModal({ isOpen, onClose }) {
  const [selectedType, setSelectedType] = useState(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedType(null);
      setMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedType || !message.trim()) {
      toast.error("Please select a type and enter a message");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          message: message.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Feedback sent successfully!");
        setSelectedType(null);
        setMessage("");
        onClose();
      } else {
        const errorMsg = data.error || "Failed to send feedback";
        const details = data.details ? `: ${data.details}` : "";
        console.error("Feedback API error:", errorMsg, details);
        toast.error(`${errorMsg}${details}`);
      }
    } catch (error) {
      console.error("Error sending feedback:", error);
      toast.error(`Failed to send feedback: ${error.message || error.toString()}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    if (selectedType === "idea") return "Share an idea";
    if (selectedType === "other") return "Tell us more";
    return "Share your feedback";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-base-200 rounded-lg p-8 w-full max-w-3xl mx-4 relative" onClick={(e) => e.stopPropagation()}>
        {/* Header with back button, title, and close button */}
        <div className="flex items-center justify-between mb-8">
          {selectedType ? (
            <button
              onClick={() => {
                setSelectedType(null);
                setMessage("");
              }}
              className="text-base-content/70 hover:text-base-content transition"
              aria-label="Back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div className="w-6"></div>
          )}
          <h2 className="text-2xl font-bold text-center flex-1">{getTitle()}</h2>
          <button
            onClick={onClose}
            className="text-base-content/70 hover:text-base-content transition"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {!selectedType ? (
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedType("idea")}
                className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg border-2 border-base-300 hover:border-primary hover:bg-primary/5 transition h-40"
              >
                <svg className="w-12 h-12 text-base-content/60" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.477.859h4z" />
                </svg>
                <span className="text-lg font-semibold">Idea</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType("other")}
                className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg border-2 border-base-300 hover:border-primary hover:bg-primary/5 transition h-40"
              >
                <svg className="w-12 h-12 text-base-content/60" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-lg font-semibold">Other</span>
              </button>
            </div>
          ) : (
            <>
              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="textarea textarea-bordered w-full h-64 text-base"
                  placeholder={
                    selectedType === "idea" 
                      ? "I think that..." 
                      : "Tell us more..."
                  }
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  className="btn btn-primary px-12 text-base rounded-full"
                  disabled={!message.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Sending...
                    </>
                  ) : (
                    "Send feedback"
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

