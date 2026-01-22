import { DM_Sans } from "next/font/google";
import Script from "next/script";
import { getSEOTags } from "@/libs/seo";
import ClientLayout from "@/components/LayoutClient";
import config from "@/config";
import "./globals.css";

const font = DM_Sans({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

export const viewport = {
	// Will use the primary color of your theme to show a nice theme color in the URL bar of supported browsers
	themeColor: config.colors.main,
	width: "device-width",
	initialScale: 1,
};

// This adds default SEO tags to all pages in our app.
// You can override them in each page passing params to getSEOTags() function.
export const metadata = getSEOTags({
  title: "AI-Powered A-Level Revision Planner",
  description: "Stop procrastinating. Start revising. Your personalized A-Level revision plan built around your schedule. AI-powered scheduling for better grades.",
});

export default function RootLayout({ children }) {
	return (
		<html
			lang="en"
			data-theme={config.colors.theme}
			className={`${font.variable} ${font.className}`}
		>
			<head>
				<Script
					data-website-id="dfid_DRHI6wXBWUpscKNQ0a63Q"
					data-domain="reviseme.co"
					src="https://datafa.st/js/script.js"
					strategy="afterInteractive"
				/>
			</head>
			<body>
				{/* ClientLayout contains all the client wrappers (Crisp chat support, toast messages, tooltips, etc.) */}
				<ClientLayout>{children}</ClientLayout>
			</body>
		</html>
	);
}
