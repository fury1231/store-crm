import Card from '../components/ui/Card';

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Products</h1>
      <Card>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-gray-900">Product Catalog</h2>
          <p className="text-gray-500 mt-2">
            Product catalog management will be available in Milestone 3.
          </p>
        </div>
      </Card>
    </div>
  );
}
