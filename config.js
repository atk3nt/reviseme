const config = {
  // REQUIRED
  appName: "ReviseMe",
  // REQUIRED: a short description of your app for SEO tags (can be overwritten)
  appDescription:
    "AI-powered revision scheduling for A-Level students. Stop procrastinating — get revision planned around you.",
  // REQUIRED (no https://, not trialing slash at the end, just the naked domain)
  domainName: "reviseme.co",
  crisp: {
    // Crisp website ID. IF YOU DON'T USE CRISP: just remove this => Then add a support email in this config file (resend.supportEmail) otherwise customer support won't work.
    id: "",
    // Hide Crisp by default, except on route "/". Crisp is toggled with <ButtonSupport/>. If you want to show Crisp on every routes, just remove this below
    onlyShowOnRoutes: ["/"],
  },
  stripe: {
    // Single one-time payment plan for Exam Season Pass
    plans: [
      {
        // REQUIRED — we use this to find the plan in the webhook
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_1Si3ZCAgE33YyUIxdlINuIXq"
            : "price_1Si3ZCAgE33YyUIxdlINuIXq",
        // REQUIRED - Name of the plan, displayed on the pricing page
        name: "Exam Season Pass",
        // A friendly description of the plan, displayed on the pricing page
        description: "Jan–July 2026 • 7-day refund guarantee",
        // The price you want to display, the one user will be charged on Stripe.
        price: 29.99,
        // Anchor price for value framing
        priceAnchor: 12.99, // "1-Month Plan" crossed out
        currency: "GBP",
        features: [
          { name: "Unlimited revision plans" },
          { name: "AI-powered scheduling" },
          { name: "8 A-Level subjects" },
          { name: "Progress tracking & insights" },
          { name: "7-day money-back guarantee" }
        ],
      },
    ],
  },
  aws: {
    // If you use AWS S3/Cloudfront, put values in here
    bucket: "bucket-name",
    bucketUrl: `https://bucket-name.s3.amazonaws.com/`,
    cdn: "https://cdn-id.cloudfront.net/",
  },
  resend: {
    // REQUIRED — Email 'From' field to be used when sending magic login links
    // For development: use Resend's default email (onboarding@resend.dev works without verification)
    // For production: verify your domain at https://resend.com/domains
    // Using friendly address (not "noreply") for better deliverability
    // TODO: Once mail.reviseme.co subdomain is verified in Resend, change to: hello@mail.reviseme.co
    fromNoReply: `ReviseMe <noreply@reviseme.co>`,
    // REQUIRED — Email 'From' field to be used when sending other emails, like abandoned carts, updates etc..
    // TODO: Once mail.reviseme.co subdomain is verified in Resend, change to: hello@mail.reviseme.co
    fromAdmin: `ReviseMe <hello@reviseme.co>`,
    // Personal welcome emails from Alex
    fromAlex: `Alex from ReviseMe <alex@reviseme.co>`,
    // Email shown to customer if need support. Leave empty if not needed => if empty, set up Crisp above, otherwise you won't be able to offer customer support."
    supportEmail: "support@reviseme.co",
  },
  colors: {
    // REQUIRED — The DaisyUI theme to use (added to the main layout.js). Leave blank for default (light & dark mode). If you any other theme than light/dark, you need to add it in config.tailwind.js in daisyui.themes.
    theme: "light", // Using DaisyUI light theme with primary color override
    // REQUIRED — This color will be reflected on the whole app outside of the document (loading bar, Chrome tabs, etc..). By default it takes the primary color from your DaisyUI theme (make sure to update your the theme name after "data-theme=")
    // OR you can just do this to use a custom color: main: "#f37055". HEX only.
    main: "#0066FF", // ReviseMe brand color - Primary Blue
    // ReviseMe Brand Colors
    brand: {
      primary: "#0066FF", // Primary Blue - CTAs, links, primary buttons
      primaryHover: "#0052CC", // Hover Blue - button hover states
      textDark: "#001433", // Text Dark - headlines, important text
      textMedium: "#003D99", // Text Medium - body text, descriptions
      backgroundLight: "#E5F0FF", // Background Light - section backgrounds, cards
      white: "#FFFFFF", // White - base backgrounds
    },
  },
  auth: {
    // REQUIRED — the path to log in users. It's use to protect private routes (like /onboarding). It's used in apiClient (/libs/api.js) upon 401 errors from our API
    loginUrl: "/api/auth/signin",
    callbackUrl: "/onboarding/slide-1",
  },
  // Subject colors and icons for UI
  subjects: {
    maths: { color: '#8b5cf6', icon: '📐' },
    psychology: { color: '#ec4899', icon: '🧠' },
    biology: { color: '#10b981', icon: '🧬' },
    chemistry: { color: '#f59e0b', icon: '⚗️' },
    business: { color: '#14b8a6', icon: '💼' },
    sociology: { color: '#a855f7', icon: '👥' },
    physics: { color: '#3b82f6', icon: '⚛️' },
    economics: { color: '#ef4444', icon: '📊' },
    history: { color: '#d97706', icon: '📜' },
    geography: { color: '#16a34a', icon: '🌍' },
    computerscience: { color: '#0284c7', icon: '💻' }
  },
};

export default config;
