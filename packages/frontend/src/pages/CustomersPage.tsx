import Card from '../components/ui/Card';

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
      <Card>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">👥</div>
          <h2 className="text-lg font-semibold text-gray-900">Customer Management</h2>
          <p className="text-gray-500 mt-2">
            Customer list and management features will be available in Milestone 3.
          </p>
        </div>
      </Card>
    </div>
  );
}
