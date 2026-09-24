import { BillingPage } from './billing-page';

export const metadata = {
  title: 'Billing',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <BillingPage />;
}