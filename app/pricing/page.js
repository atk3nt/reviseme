import ButtonCheckout from "@/components/ButtonCheckout";
import config from "@/config";
import { getSEOTags } from "@/libs/seo";

export const metadata = getSEOTags({
  title: "Pricing",
  description: "Simple, transparent pricing for your A-Level revision plan. One payment, full access. No subscriptions. Start your revision journey today.",
  canonicalUrlRelative: "/pricing",
});

export default function PricingPage() {
  const plan = config.stripe.plans[0];

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-brand-light">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-bold mb-4 text-brand-dark">Simple, Transparent Pricing</h1>
          <p className="text-xl text-brand-medium">
            One payment. Full access. No subscriptions.
          </p>
        </div>
      </div>

      {/* Pricing Card */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="card bg-base-100 shadow-xl border-2 border-primary max-w-2xl mx-auto">
          <div className="card-body text-center p-8">
            {/* Badge */}
            <div className="badge badge-primary badge-lg mb-4">
              Most Popular
            </div>

            {/* Plan Name */}
            <h2 className="text-3xl font-bold mb-2 text-brand-dark">{plan.name}</h2>
            <p className="text-lg text-brand-medium mb-6">{plan.description}</p>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-center justify-center space-x-4 mb-2">
                <span className="text-5xl font-bold text-primary">£{plan.price}</span>
                <div className="text-left">
                  <div className="text-sm text-brand-medium line-through opacity-60">
                    £{plan.priceAnchor} 1-Month Plan
                  </div>
                  <div className="text-sm text-success font-medium">
                    Save £{((plan.priceAnchor - plan.price) / plan.priceAnchor * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <p className="text-sm text-brand-medium">
                One-time payment • 7-day refund guarantee
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4 mb-8 text-left">
              {plan.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>{feature.name}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <ButtonCheckout 
              priceId={plan.priceId}
              mode="payment"
            />

            {/* Payment Methods */}
            <div className="mt-6">
              <p className="text-sm text-brand-medium mb-3">Secure payment with</p>
              <div className="flex items-center justify-center space-x-4">
                <div className="text-2xl">💳</div>
                <div className="text-2xl">🍎</div>
                <div className="text-2xl">📱</div>
                <div className="text-sm text-brand-medium">+ more</div>
              </div>
            </div>

            {/* Guarantee */}
            <div className="mt-8 p-4 bg-brand-light rounded-lg">
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">7-Day Money-Back Guarantee</span>
              </div>
              <p className="text-sm text-brand-medium mt-1">
                Not satisfied? Get a full refund within 7 days, no questions asked.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-base-200 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-brand-dark">Frequently Asked Questions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-2 text-brand-dark">What subjects are included?</h3>
              <p className="text-brand-medium">
                All 8 major A-Level subjects: Biology, Chemistry, Physics, Mathematics, 
                Psychology, Business Studies, Economics, and English Literature. Each with 
                AQA, Edexcel, and OCR exam boards.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-2">How does the AI scheduling work?</h3>
              <p className="text-brand-medium">
                Our algorithm considers your confidence ratings, exam dates, and availability 
                to create personalized revision plans that prioritize your weakest topics 
                while maintaining balanced coverage.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-2">Can I change my subjects later?</h3>
              <p className="text-brand-medium">
                Yes! You can update your subject selections and exam boards anytime in 
                your settings. This will trigger a new plan generation.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-2">What if I miss a revision session?</h3>
              <p className="text-brand-medium">
                No problem! Mark it as missed and our system will automatically reschedule 
                it for the next available slot. We understand that life happens.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


