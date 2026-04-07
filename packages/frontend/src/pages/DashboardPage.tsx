import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';

export default function DashboardPage() {
  const { user } = useAuth();

  const storeName = user?.store?.name || 'your store';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.name || 'User'}
        </p>
      </div>

      <Card>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🏪</div>
          <h2 className="text-xl font-semibold text-gray-900">
            Welcome to {storeName}
          </h2>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Your store management dashboard. Customer lists, product catalog, and sales
            tracking features are coming soon.
          </p>
        </div>
      </Card>
    </div>
  );
}
