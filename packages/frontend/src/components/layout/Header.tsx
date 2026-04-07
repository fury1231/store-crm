import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Badge from '../ui/Badge';
import Dropdown from '../ui/Dropdown';

interface HeaderProps {
  onMenuToggle: () => void;
}

const roleBadgeVariant: Record<string, 'info' | 'success' | 'warning'> = {
  ADMIN: 'info',
  MANAGER: 'success',
  STAFF: 'warning',
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout, currentStoreId, setCurrentStoreId } = useAuth();
  const { addToast } = useToast();

  const handleLogout = async () => {
    await logout();
    addToast('Logged out successfully', 'success');
  };

  // For now, store switcher uses user's assigned store.
  // Multi-store support will be enhanced when admin can access multiple stores.
  const storeName = user?.store?.name || 'No store assigned';

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
      {/* Left: hamburger + store name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          aria-label="Toggle sidebar"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{storeName}</span>
        </div>
      </div>

      {/* Right: user info + dropdown */}
      <div className="flex items-center gap-3">
        {user && (
          <Dropdown
            trigger={
              <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-3 py-1.5 transition-colors">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-indigo-600">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-700">{user.name}</p>
                  <Badge variant={roleBadgeVariant[user.role] || 'default'}>
                    {user.role}
                  </Badge>
                </div>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            }
          >
            {/* Store switcher section */}
            {user.store && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                  Current Store
                </div>
                <button
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2
                    ${currentStoreId === user.store.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                  onClick={() => setCurrentStoreId(user.store!.id)}
                >
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  {user.store.name}
                </button>
                <div className="border-t border-gray-100 my-1" />
              </>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              data-testid="logout-button"
            >
              Sign out
            </button>
          </Dropdown>
        )}
      </div>
    </header>
  );
}
