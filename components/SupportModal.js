"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

// Add keyframe animations
if (typeof window !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    
    @keyframes modalPopIn {
      0% {
        opacity: 0;
        transform: scale(0.85) translateY(20px);
      }
      60% {
        transform: scale(1.02) translateY(-5px);
      }
      100% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `;
  if (!document.head.querySelector('[data-modal-animations]')) {
    styleSheet.setAttribute('data-modal-animations', 'true');
    document.head.appendChild(styleSheet);
  }
}

export default function SupportModal({ isOpen, onClose }) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payments, setPayments] = useState([]);
  const [isCheckingRefund, setIsCheckingRefund] = useState(false);
  const [refundEligibility, setRefundEligibility] = useState(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedType(null);
      setMessage("");
      setRefundEligibility(null);
      setPayments([]);
    }
  }, [isOpen]);

  // Load payments when refund option is selected
  useEffect(() => {
    if (isOpen && selectedType === "refund") {
      loadPayments();
    }
  }, [isOpen, selectedType]);

  const loadPayments = async () => {
    try {
      const response = await fetch("/api/plan/payments");
      if (response.ok) {
        const data = await response.json();
        const payments = data.payments || [];
        console.log("Payments loaded:", payments);
        console.log("Payment statuses:", payments.map(p => ({ id: p.id, status: p.status, paid_at: p.paid_at })));
        setPayments(payments);
        checkRefundEligibility(payments);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Payments API error:", response.status, errorData);
        setRefundEligibility({
          eligible: false,
          reason: `Failed to load payments: ${errorData.error || "Unknown error"}`
        });
      }
    } catch (error) {
      console.error("Error loading payments:", error);
      setRefundEligibility({
        eligible: false,
        reason: "Failed to load payments. Please try again."
      });
    }
  };

  const checkRefundEligibility = (paymentList) => {
    console.log("Checking refund eligibility for payments:", paymentList);
    const latestPayment = paymentList.find(p => p.status === 'paid');
    
    if (!latestPayment) {
      const statuses = paymentList.map(p => p.status);
      console.log("No paid payment found. Payment statuses:", statuses);
      setRefundEligibility({
        eligible: false,
        reason: paymentList.length > 0 
          ? `No eligible payments found. Found ${paymentList.length} payment(s) with status: ${statuses.join(', ')}`
          : "No eligible payments found for refund"
      });
      return;
    }

    console.log("Found paid payment:", latestPayment);
    const paymentDate = new Date(latestPayment.paid_at);
    const daysSincePayment = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log("Days since payment:", daysSincePayment);

    if (daysSincePayment > 7) {
      setRefundEligibility({
        eligible: false,
        reason: `Refund period has expired (7 days). Payment was made ${daysSincePayment} days ago.`
      });
      return;
    }

    setRefundEligibility({
      eligible: true,
      payment: latestPayment,
      daysRemaining: 7 - daysSincePayment
    });
  };

  const handleRefundRequest = async (e) => {
    // Prevent any form submission if button is inside a form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!refundEligibility?.eligible || !refundEligibility.payment) {
      return;
    }

    setIsCheckingRefund(true);
    try {
      const response = await fetch("/api/refund/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: refundEligibility.payment.id })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Refund processed successfully! You will receive a confirmation email shortly.");
        setSelectedType(null);
        setRefundEligibility(null);
        onClose();
        // Redirect to home after a short delay
        setTimeout(() => {
          router.push("/");
        }, 1500);
      } else {
        toast.error(data.error || "Failed to process refund request");
      }
    } catch (error) {
      console.error("Refund request error:", error);
      toast.error("Failed to process refund request. Please try again.");
    } finally {
      setIsCheckingRefund(false);
    }
  };

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
        toast.success("Message sent successfully!");
        setSelectedType(null);
        setMessage("");
        setRefundEligibility(null);
        onClose();
      } else {
        const errorMsg = data.error || "Failed to send message";
        const details = data.details ? `: ${data.details}` : "";
        console.error("Support API error:", errorMsg, details);
        toast.error(`${errorMsg}${details}`);
      }
    } catch (error) {
      console.error("Error sending support message:", error);
      toast.error(`Failed to send message: ${error.message || error.toString()}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    if (selectedType === "issue") return "Report an issue";
    if (selectedType === "other") return "Tell us more";
    if (selectedType === "refund") return "Money Back Guarantee";
    return "How can we help?";
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-300 ease-out" 
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        className="bg-base-200 rounded-lg p-8 w-full max-w-3xl mx-4 relative" 
        style={{
          animation: 'modalPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transformOrigin: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with back button, title, and close button */}
        <div className="flex items-center justify-between mb-8">
          {selectedType ? (
            <button
              onClick={() => {
                setSelectedType(null);
                setMessage("");
                setRefundEligibility(null);
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

        <div className="space-y-8">
          {!selectedType ? (
            <div className="grid grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setSelectedType("issue")}
                className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg border-2 border-base-300 hover:border-warning hover:bg-warning/5 transition h-40"
              >
                <svg className="w-12 h-12 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-lg font-semibold">Issue</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType("refund")}
                className="flex flex-col items-center justify-center gap-4 p-6 rounded-lg border-2 border-base-300 hover:border-error hover:bg-error/5 transition h-40"
              >
                <svg className="w-12 h-12 text-error" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                <span className="text-lg font-semibold">Guarantee</span>
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
          ) : selectedType === "refund" ? (
            <>
              {refundEligibility === null ? (
                <div className="text-center py-8">
                  <span className="loading loading-spinner loading-lg"></span>
                  <p className="mt-4">Checking refund eligibility...</p>
                </div>
              ) : refundEligibility.eligible ? (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg p-6 border-2 border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Refund Details</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-base-content/70">Amount:</span>
                        <span className="font-semibold">£{(refundEligibility.payment.amount / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-base-content/70">Payment Date:</span>
                        <span>{new Date(refundEligibility.payment.paid_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-base-content/70">Days Remaining:</span>
                        <span className="font-semibold text-success">{refundEligibility.daysRemaining} days</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-warning/10 border border-warning rounded-lg p-4">
                    <p className="text-sm text-warning-content">
                      <strong>Important:</strong> This will immediately revoke your access to Markr Planner. 
                      The refund will appear on your original payment method within 5-10 business days.
                    </p>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedType(null);
                        setRefundEligibility(null);
                      }}
                      className="btn btn-outline px-8"
                      disabled={isCheckingRefund}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRefundRequest}
                      className="btn btn-error px-8"
                      disabled={isCheckingRefund}
                    >
                      {isCheckingRefund ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          Processing...
                        </>
                      ) : (
                        "Confirm Refund"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-error/10 border border-error rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <svg className="w-6 h-6 text-error" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <h3 className="text-lg font-semibold text-error">Not Eligible for Refund</h3>
                    </div>
                    <p className="text-base-content/80">{refundEligibility.reason}</p>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedType(null);
                        setRefundEligibility(null);
                      }}
                      className="btn btn-outline px-8"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="textarea textarea-bordered w-full h-64 text-base"
                  placeholder={
                    selectedType === "issue" 
                      ? "I noticed that..." 
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
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

