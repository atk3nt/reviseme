import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

// CHATGPT PROMPT TO GENERATE YOUR TERMS & SERVICES — replace with your own data 👇

// 1. Go to https://chat.openai.com/
// 2. Copy paste bellow
// 3. Replace the data with your own (if needed)
// 4. Paste the answer from ChatGPT directly in the <pre> tag below

// You are an excellent lawyer.

// I need your help to write a simple Terms & Services for my website. Here is some context:
// - Website: https://reviseme.co
// - Name: ReviseMe
// - Contact information: support@reviseme.co
// - Description: An AI-powered revision scheduling platform for A-Level students
// - Ownership: when buying the Exam Season Pass, users get access to the platform until July 2026. They can ask for a full refund within 7 days after the purchase.
// - User data collected: name, email and payment information
// - Non-personal data collection: web cookies
// - Link to privacy-policy: https://reviseme.co/privacy-policy
// - Governing Law: United Kingdom
// - Updates to the Terms: users will be updated by email

// Please write a simple Terms & Services for my site. Add the current date. Do not add or explain your reasoning. Answer:

export const metadata = getSEOTags({
  title: `Terms and Conditions | ${config.appName}`,
  canonicalUrlRelative: "/tos",
});

const TOS = () => {
  return (
    <main className="max-w-xl mx-auto">
      <div className="p-5">
        <Link href="/" className="btn btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path
              fillRule="evenodd"
              d="M15 10a.75.75 0 01-.75.75H7.612l2.158 1.96a.75.75 0 11-1.04 1.08l-3.5-3.25a.75.75 0 010-1.08l3.5-3.25a.75.75 0 111.04 1.08L7.612 9.25h6.638A.75.75 0 0115 10z"
              clipRule="evenodd"
            />
          </svg>
          Back
        </Link>
        <h1 className="text-3xl font-extrabold pb-6">
          Terms and Conditions for {config.appName}
        </h1>

        <pre
          className="leading-relaxed whitespace-pre-wrap"
          style={{ fontFamily: "sans-serif" }}
        >
          {`Last Updated: January 22, 2026

Welcome to ReviseMe!

These Terms of Service ("Terms") govern your use of the ReviseMe website at https://reviseme.co ("Website") and the services provided by ReviseMe. By using our Website and services, you agree to these Terms.

1. Description of ReviseMe

ReviseMe is an AI-powered revision scheduling platform designed to help A-Level students plan and optimize their revision effectively.

2. Service Access and Usage Rights

When you purchase the Exam Season Pass from ReviseMe, you gain access to our platform and services until July 2026. You may use the service for personal, non-commercial educational purposes. We offer a full refund within 7 days of purchase, as specified in our refund policy.

3. User Data and Privacy

We collect and store user data, including name, email, and payment information, as necessary to provide our services. For details on how we handle your data, please refer to our Privacy Policy at https://reviseme.co/privacy-policy.

4. Non-Personal Data Collection

We use web cookies to collect non-personal data for the purpose of improving our services and user experience.

5. Governing Law

These Terms are governed by the laws of the United Kingdom.

6. Updates to the Terms

We may update these Terms from time to time. Users will be notified of any changes via email.

For any questions or concerns regarding these Terms of Service, please contact us at support@reviseme.co.

Thank you for using ReviseMe!`}
        </pre>
      </div>
    </main>
  );
};

export default TOS;
