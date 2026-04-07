import Card from '../components/ui/Card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <Card>
        <div className="text-center py-12">
          <div className="text-5xl mb-4">⚙️</div>
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <p className="text-gray-500 mt-2">
            Application settings will be available in a future milestone.
          </p>
        </div>
      </Card>
    </div>
  );
}
