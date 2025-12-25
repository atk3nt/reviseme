import { redirect } from 'next/navigation';

export const dynamic = "force-dynamic";

// Redirect dashboard to plan page
export default async function Dashboard() {
  redirect('/plan');
}
