import LoginForm from './LoginForm';
import { deploymentBranding, isCeoPortalDeployment } from '@/lib/deployment-profile';

export default function LoginPage() {
  const brand = deploymentBranding();
  return <LoginForm brand={brand} ceoPortal={isCeoPortalDeployment()} />;
}
