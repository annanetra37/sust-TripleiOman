import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <Construction className="w-16 h-16 text-gray-300 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Under Development</h1>
      <p className="text-gray-500 mt-2 max-w-md">
        This module is currently being developed. Contact your account manager or upgrade to Enterprise for early access.
      </p>
      <Link to="/" className="btn-primary mt-6">Back to Home</Link>
    </div>
  );
}
