import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'ShadowBallot',
  projectId: 'shadow-ballot-project',
  chains: [sepolia],
  ssr: false,
});
