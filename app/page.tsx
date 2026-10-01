import AuthGate from '@/components/auth-gate';
import DesignVaultApp from '@/components/design-vault-app';

export default function Home() {
  return <AuthGate><DesignVaultApp /></AuthGate>;
}

